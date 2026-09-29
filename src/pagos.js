// Pagos reales con Stripe Checkout. Están apagados hasta que el dueño pone en Render sus
// claves (STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET) y sus datos legales. El juego nunca ve
// la tarjeta: Stripe cobra en su propia página y avisa al servidor con un webhook firmado.
import { createHmac, timingSafeEqual } from "node:crypto";
import { block, grant } from "./core.js";
import { legalInfo } from "./legal.js";

export const PACKS = {
  p50: { vit: 50, cents: 99 },
  p300: { vit: 300, cents: 499 },
  p700: { vit: 700, cents: 999 },
};

export function paymentsConfig(env = process.env) {
  const key = String(env.STRIPE_SECRET_KEY || "").trim(), hook = String(env.STRIPE_WEBHOOK_SECRET || "").trim();
  const missing = [];
  if (!key) missing.push("STRIPE_SECRET_KEY");
  if (!hook) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!legalInfo(env).completo) missing.push("LEGAL_TITULAR", "LEGAL_CONTACTO");
  return {
    enabled: missing.length === 0, missing, key, hook,
    currency: String(env.STRIPE_CURRENCY || "eur").trim().toLowerCase(),
    live: /^(sk|rk)_live_/.test(key),
  };
}

export function priceText(cents, currency) {
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`; }
}
export function packsView(cfg) {
  return Object.entries(PACKS).map(([id, p]) => ({ id, vit: p.vit, price: priceText(p.cents, cfg.currency) }));
}

function state(w) {
  w.pagos ??= { sesiones: {}, hechos: {}, ventas: 0, ingresos: {}, revisar: 0 };
  return w.pagos;
}
const worldId = w => String(w.createdAt);

// Crea la página de pago de Stripe para un paquete y la apunta en el mundo.
export async function createCheckout(w, cfg, user, packId, origin, fetchImpl = fetch) {
  const p = Object.hasOwn(PACKS, packId) ? PACKS[packId] : null;
  if (!p) return { ok: false, error: "Paquete desconocido" };
  const body = new URLSearchParams({
    mode: "payment",
    locale: "es",
    client_reference_id: user.id,
    success_url: `${origin}/?pago=ok`,
    cancel_url: `${origin}/?pago=cancelado`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": cfg.currency,
    "line_items[0][price_data][unit_amount]": String(p.cents),
    "line_items[0][price_data][product_data][name]": `${p.vit} VIT para Colonia VITA`,
    "line_items[0][price_data][product_data][description]": "Moneda virtual del juego. No es una inversión y no se puede cambiar por dinero.",
    // "mundo" separa los pagos de cada servidor si varios comparten la misma cuenta de Stripe.
    "metadata[mundo]": worldId(w), "metadata[user]": user.id, "metadata[pack]": packId,
    "payment_intent_data[metadata][mundo]": worldId(w), "payment_intent_data[metadata][user]": user.id,
    "custom_text[submit][message]": "Al pagar aceptas los términos de Colonia VITA y que el VIT se entregue al momento. Si vives en la Unión Europea, reconoces que por eso pierdes el derecho de desistimiento.",
  });
  let res, j;
  try {
    res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", body, signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/x-www-form-urlencoded" },
    });
    j = await res.json();
  } catch (e) {
    console.error("[pagos] Stripe no respondió:", e.message);
    return { ok: false, error: "El sistema de pagos no responde; prueba en un rato" };
  }
  if (!res.ok || !j?.url) {
    console.error("[pagos] Stripe rechazó la sesión:", res.status, j?.error?.message);
    return { ok: false, error: "No se pudo abrir el pago; prueba en un rato" };
  }
  const s = state(w);
  s.sesiones[j.id] = { user: user.id, pack: packId, at: Date.now() };
  // Solo se guardan las sesiones del último día: las que no se pagan caducan en Stripe.
  for (const [id, x] of Object.entries(s.sesiones)) if (Date.now() - x.at > 86400000) delete s.sesiones[id];
  return { ok: true, url: j.url };
}

// Firma de Stripe: cabecera "t=<segundos>,v1=<hmac>", HMAC-SHA256 de "<t>.<cuerpo>" con el secreto del webhook.
export function verifySignature(raw, header, secret, nowMs = Date.now(), toleranceS = 300) {
  if (!secret) return false;
  let t = null; const sigs = [];
  for (const part of String(header || "").split(",")) {
    const i = part.indexOf("="), k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = Number(v); else if (k === "v1") sigs.push(v);
  }
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowMs / 1000 - t) > toleranceS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(raw).digest();
  return sigs.some(s => { const b = Buffer.from(s, "hex"); return b.length === expected.length && timingSafeEqual(b, expected); });
}

// Devoluciones y disputas: se retira el VIT comprado en la misma proporción (sin bajar de 0), y el
// dinero devuelto deja de contar como ingreso y de financiar a las IA. f es la parte devuelta (acumulada).
function retirar(w, s, rec, f) {
  const back = Math.round(rec.cents * f) - (rec.devuelto || 0);
  if (back > 0) {
    rec.devuelto = (rec.devuelto || 0) + back;
    s.ingresos[rec.currency] = Math.round((s.ingresos[rec.currency] || 0) * 100 - back) / 100;
    if (rec.currency === "usd" || rec.currency === "eur") w.ai.revenueUsd -= back / 100;
  }
  const target = Math.round(rec.vit * f), take = target - (rec.retirado || 0);
  if (take <= 0) return { ok: true, note: "ya retirado" };
  const u = w.users[rec.user], quita = u ? Math.min(take, Math.max(0, Math.floor(u.vit))) : 0;
  if (u) { u.vit -= quita; w.supply.burned += quita; block(w, "devolución", u.id, "sistema", quita); }
  rec.retirado = (rec.retirado || 0) + take;
  return { ok: true, note: "retirado", vit: quita };
}

// Aplica un evento de Stripe ya verificado. Cada pago se entrega una sola vez aunque Stripe repita el aviso.
export function handleEvent(w, cfg, event) {
  const s = state(w), o = event?.data?.object || {};
  switch (event?.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (o.metadata?.mundo !== worldId(w)) return { ok: true, note: "no es de este mundo" };
      if (o.payment_status !== "paid") return { ok: true, note: "pendiente de cobro" };
      if (s.hechos[o.id]) return { ok: true, note: "ya entregado" };
      const uid = o.metadata?.user || o.client_reference_id, packId = o.metadata?.pack, u = w.users[uid];
      const p = Object.hasOwn(PACKS, String(packId)) ? PACKS[packId] : null;
      // Con los precios adaptados de Stripe, el importe y la moneda de arriba son los del comprador;
      // los de la tienda vienen en currency_conversion.
      const conv = o.currency_conversion?.source_currency ? o.currency_conversion : null;
      const amount = conv ? conv.amount_total : o.amount_total, currency = String((conv ? conv.source_currency : o.currency) || "").toLowerCase();
      if (!u || !p || amount !== p.cents || currency !== cfg.currency) {
        console.error(`[pagos] ${o.id} no cuadra con ningún paquete (${amount} ${currency}, paquete ${packId}); revísalo en Stripe`);
        s.hechos[o.id] = { user: uid || null, vit: 0, cents: amount, currency, pi: o.payment_intent || null, at: Date.now(), revisar: true };
        s.revisar++;
        return { ok: true, note: "revisar" };
      }
      grant(w, u, p.vit, "compra");
      const rec = s.hechos[o.id] = { user: u.id, vit: p.vit, cents: p.cents, currency, pi: o.payment_intent || null, at: Date.now() };
      delete s.sesiones[o.id];
      s.ventas++; s.ingresos[currency] = (s.ingresos[currency] || 0) + p.cents / 100;
      // Una parte de los ingresos paga el cómputo de las IA (el euro se cuenta como un dólar, a la baja).
      if (currency === "usd" || currency === "eur") w.ai.revenueUsd += p.cents / 100;
      const pend = rec.pi && s.devueltos?.[rec.pi];
      if (pend) { delete s.devueltos[rec.pi]; retirar(w, s, rec, pend.f); }
      return { ok: true, note: "entregado", user: u.id, vit: p.vit };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      delete s.sesiones[o.id];
      return { ok: true, note: "sin cobro" };
    case "charge.refunded":
    case "charge.dispute.created": {
      const pi = o.payment_intent, share = event.type === "charge.refunded" ? (o.amount ? o.amount_refunded / o.amount : 1) : 1;
      const rec = pi && Object.values(s.hechos).find(x => x.pi === pi), f = Math.min(1, Math.max(0, share));
      if (!rec && pi) {
        // Stripe no garantiza el orden: si la compra aún no ha llegado, la devolución se aplica al entregarla.
        s.devueltos ??= {};
        for (const [k, x] of Object.entries(s.devueltos)) if (Date.now() - x.at > 30 * 86400000) delete s.devueltos[k];
        s.devueltos[pi] = { f: Math.max(f, s.devueltos[pi]?.f || 0), at: Date.now() };
      }
      if (!rec || !rec.vit) return { ok: true, note: "sin compra asociada" };
      return retirar(w, s, rec, f);
    }
    default:
      return { ok: true, note: "ignorado" };
  }
}

export function paymentsMetrics(w, cfg) {
  const s = w.pagos || {};
  return { activos: cfg.enabled, faltan: cfg.missing, real: cfg.live, moneda: cfg.currency, mundo: worldId(w), ventas: s.ventas || 0, ingresos: s.ingresos || {}, revisar: s.revisar || 0 };
}
