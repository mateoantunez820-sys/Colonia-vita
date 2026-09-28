import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as core from "../src/core.js";
import { PACKS, createCheckout, handleEvent, paymentsConfig, verifySignature } from "../src/pagos.js";
import { adsConfig, adsHead, adsTxt, redeemAd, startAd } from "../src/anuncios.js";

const ENV = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", LEGAL_TITULAR: "Ana", LEGAL_CONTACTO: "ana@example.com" };
const sign = (raw, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
const paid = (w, u, pack, extra = {}) => ({
  type: "checkout.session.completed",
  data: { object: { id: "cs_" + Math.random().toString(36).slice(2), payment_status: "paid", amount_total: PACKS[pack].cents, currency: "eur", payment_intent: "pi_" + Math.random().toString(36).slice(2), metadata: { mundo: String(w.createdAt), user: u.id, pack }, ...extra } },
});

test("los pagos solo se encienden con las claves de Stripe y los datos del titular", () => {
  assert.equal(paymentsConfig({}).enabled, false);
  assert.deepEqual(paymentsConfig({ ...ENV, LEGAL_CONTACTO: "" }).missing, ["LEGAL_TITULAR", "LEGAL_CONTACTO"]);
  assert.deepEqual(paymentsConfig({ ...ENV, STRIPE_WEBHOOK_SECRET: "" }).missing, ["STRIPE_WEBHOOK_SECRET"]);
  const cfg = paymentsConfig(ENV);
  assert.equal(cfg.enabled, true); assert.equal(cfg.live, false); assert.equal(cfg.currency, "eur");
  assert.equal(paymentsConfig({ ...ENV, STRIPE_SECRET_KEY: "sk_live_y" }).live, true);
});

test("la firma del webhook de Stripe se comprueba de verdad", () => {
  const raw = Buffer.from(JSON.stringify({ type: "x" }));
  assert.equal(verifySignature(raw, sign(raw, "whsec_x"), "whsec_x"), true);
  assert.equal(verifySignature(raw, sign(raw, "otro"), "whsec_x"), false, "secreto equivocado");
  assert.equal(verifySignature(Buffer.from('{"type":"y"}'), sign(raw, "whsec_x"), "whsec_x"), false, "cuerpo alterado");
  assert.equal(verifySignature(raw, sign(raw, "whsec_x", Math.floor(Date.now() / 1000) - 600), "whsec_x"), false, "aviso viejo");
  assert.equal(verifySignature(raw, `v1=00,${sign(raw, "whsec_x")}`, "whsec_x"), true, "vale si una de las firmas es buena");
  assert.equal(verifySignature(raw, "", "whsec_x"), false);
  assert.equal(verifySignature(raw, sign(raw, ""), ""), false, "sin secreto no se acepta nada");
});

test("la página de pago se pide a Stripe con el precio, el jugador y el mundo", async () => {
  const w = core.createWorld(), u = core.createUser(w, "Leo", "h"), cfg = paymentsConfig(ENV);
  let req;
  const fake = async (url, init) => { req = { url, init, body: Object.fromEntries(init.body) }; return { ok: true, json: async () => ({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }) }; };
  const r = await createCheckout(w, cfg, u, "p300", "https://vita.example", fake);
  assert.deepEqual(r, { ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
  assert.equal(req.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(req.init.headers.authorization, "Bearer sk_test_x");
  assert.equal(req.body["line_items[0][price_data][unit_amount]"], "499");
  assert.equal(req.body["line_items[0][price_data][currency]"], "eur");
  assert.equal(req.body["metadata[user]"], u.id); assert.equal(req.body["metadata[pack]"], "p300");
  assert.equal(req.body["metadata[mundo]"], String(w.createdAt));
  assert.equal(req.body.success_url, "https://vita.example/?pago=ok");
  assert.equal(w.pagos.sesiones.cs_1.user, u.id);
  assert.equal((await createCheckout(w, cfg, u, "p9999", "https://vita.example", fake)).ok, false);
  const down = async () => { throw new Error("sin red"); };
  assert.equal((await createCheckout(w, cfg, u, "p50", "https://vita.example", down)).ok, false);
  const refused = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Invalid API Key" } }) });
  assert.equal((await createCheckout(w, cfg, u, "p50", "https://vita.example", refused)).ok, false);
});

test("un pago entrega el VIT una sola vez y financia a las IA", () => {
  const w = core.createWorld(), u = core.createUser(w, "Eva", "h"), cfg = paymentsConfig(ENV);
  const vit0 = u.vit, minted0 = w.supply.minted, ev = paid(w, u, "p300");
  assert.equal(handleEvent(w, cfg, ev).note, "entregado");
  assert.equal(u.vit, vit0 + 300); assert.equal(w.supply.minted, minted0 + 300);
  assert.equal(handleEvent(w, cfg, ev).note, "ya entregado");
  assert.equal(u.vit, vit0 + 300, "un aviso repetido no paga dos veces");
  assert.equal(w.pagos.ventas, 1); assert.equal(w.pagos.ingresos.eur, 4.99);
  assert.ok(Math.abs(w.ai.revenueUsd - 4.99) < 1e-9);
  assert.equal(w.chain.at(-1).tipo, "compra");
});

test("los pagos pendientes, ajenos o que no cuadran no entregan VIT", () => {
  const w = core.createWorld(), u = core.createUser(w, "Iris", "h"), cfg = paymentsConfig(ENV), vit0 = u.vit;
  const pend = paid(w, u, "p50", { payment_status: "unpaid" });
  assert.equal(handleEvent(w, cfg, pend).note, "pendiente de cobro");
  assert.equal(u.vit, vit0);
  pend.type = "checkout.session.async_payment_succeeded"; pend.data.object.payment_status = "paid";
  assert.equal(handleEvent(w, cfg, pend).note, "entregado", "el pago diferido llega cuando Stripe confirma el cobro");
  assert.equal(handleEvent(w, cfg, paid(w, u, "p50", { amount_total: 1 })).note, "revisar");
  assert.equal(handleEvent(w, cfg, paid(w, u, "p50", { currency: "usd" })).note, "revisar");
  assert.equal(handleEvent(w, cfg, paid(w, u, "p50", { metadata: { mundo: "otro", user: u.id, pack: "p50" } })).note, "no es de este mundo");
  assert.equal(handleEvent(w, cfg, { type: "customer.created", data: { object: {} } }).note, "ignorado");
  assert.equal(u.vit, vit0 + 50);
  assert.equal(w.pagos.revisar, 2);
});

test("si se devuelve un pago o hay disputa se retira el VIT de esa compra sin dejar saldo negativo", () => {
  const w = core.createWorld(), u = core.createUser(w, "Pau", "h"), cfg = paymentsConfig(ENV);
  const ev = paid(w, u, "p700"); handleEvent(w, cfg, ev);
  const pi = ev.data.object.payment_intent, before = u.vit;
  const half = { type: "charge.refunded", data: { object: { payment_intent: pi, amount: 999, amount_refunded: 500 } } };
  assert.equal(handleEvent(w, cfg, half).note, "retirado");
  assert.equal(u.vit, before - 350);
  assert.equal(handleEvent(w, cfg, half).note, "ya retirado");
  u.vit = 100; // se gastó casi todo
  assert.equal(handleEvent(w, cfg, { type: "charge.dispute.created", data: { object: { payment_intent: pi } } }).note, "retirado");
  assert.equal(u.vit, 0);
  assert.equal(handleEvent(w, cfg, { type: "charge.refunded", data: { object: { payment_intent: "pi_otro", amount: 1, amount_refunded: 1 } } }).note, "sin compra asociada");
});

test("los anuncios reales solo pagan un vale propio, una vez y tras verlo entero", () => {
  assert.equal(adsConfig({}).enabled, false);
  assert.equal(adsConfig({ ADSENSE_CLIENT: "pub-123" }).enabled, false);
  const cfg = adsConfig({ ADSENSE_CLIENT: "ca-pub-1234567890123456", ADSENSE_TEST: "1" });
  assert.equal(cfg.enabled, true);
  assert.equal(adsTxt(cfg), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  assert.ok(adsHead(cfg).includes('content="ca-pub-1234567890123456"') && adsHead(cfg).includes('data-adbreak-test="on"'));
  const w = core.createWorld(), a = core.createUser(w, "A", "h"), b = core.createUser(w, "B", "h2");
  const t0 = 1e12, s = startAd(a, t0);
  assert.equal(s.ok, true);
  assert.equal(redeemAd(cfg, a, s.ticket, t0 + 1000).ok, false, "antes de terminar no paga");
  assert.equal(redeemAd(cfg, b, s.ticket, t0 + 6000).ok, false, "el vale es de otro jugador");
  assert.equal(redeemAd(cfg, a, s.ticket, t0 + 6000).ok, true);
  assert.equal(redeemAd(cfg, a, s.ticket, t0 + 7000).ok, false, "un vale solo vale una vez");
  assert.equal(redeemAd(cfg, a, "inventado", t0 + 7000).ok, false);
  a.daily.ads = core.ADS.perDay;
  assert.equal(startAd(a, t0 + 60000).ok, false, "respeta el tope diario");
});
