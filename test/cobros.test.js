// Pagos y anuncios reales de extremo a extremo, con claves de prueba (no se llama a Stripe).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startServer } from "./servidor.js";

const HOOK = "whsec_prueba", ADMIN = "admin-de-prueba";
let srv, call;
before(async () => {
  srv = await startServer({
    STRIPE_SECRET_KEY: "sk_test_prueba", STRIPE_WEBHOOK_SECRET: HOOK, LEGAL_TITULAR: "Titular", LEGAL_CONTACTO: "t@example.com",
    ADSENSE_CLIENT: "ca-pub-1234567890123456", AD_MIN_MS: "300", ADMIN_TOKEN: ADMIN, DEMO_PURCHASES: "1",
  });
  call = srv.call;
});
after(() => srv.close());

const signed = (event, secret = HOOK) => {
  const raw = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  return { raw, headers: { "stripe-signature": `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}` } };
};

test("un pago confirmado por Stripe llega al jugador una sola vez", async () => {
  const { token, id } = (await call("/api/join", { body: { name: "Compradora" } })).json;
  const w = (await call("/api/world", { token })).json;
  assert.equal(w.pagos.enabled, true); assert.equal(w.pagos.test, true);
  assert.deepEqual(w.pagos.packs.map(p => p.vit), [50, 300, 700]);
  assert.equal(w.demoPurchases, false, "con pagos reales no hay compras de prueba");
  assert.equal((await call("/api/action", { token, body: { type: "buy_demo" } })).status, 400);
  assert.equal((await call("/api/pagos/checkout", { token, body: { pack: "p50" } })).status, 400, "hay que aceptar los términos");

  const mundo = (await call("/api/admin/metrics", { headers: { authorization: "Bearer " + ADMIN } })).json.pagos.mundo;
  const vit0 = w.me.vit;
  const event = { type: "checkout.session.completed", data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 99, currency: "eur", payment_intent: "pi_1", metadata: { mundo, user: id, pack: "p50" } } } };
  assert.equal((await call("/api/pagos/webhook", signed(event))).status, 200);
  assert.equal((await call("/api/pagos/webhook", signed(event))).status, 200, "Stripe puede repetir el aviso");
  assert.equal((await call("/api/pagos/webhook", signed(event, "whsec_falso"))).status, 400, "sin la firma buena no se acepta");
  assert.equal((await call("/api/world", { token })).json.me.vit, vit0 + 50);
  const m = (await call("/api/admin/metrics", { headers: { authorization: "Bearer " + ADMIN } })).json.pagos;
  assert.equal(m.ventas, 1); assert.equal(m.ingresos.eur, 0.99);
});

test("los anuncios reales cargan AdSense y solo pagan un vale visto entero", async () => {
  const home = (await call("/")).text;
  assert.ok(home.includes('<meta name="google-adsense-account" content="ca-pub-1234567890123456">'));
  assert.ok(home.includes("adsbygoogle.js?client=ca-pub-1234567890123456"));
  assert.equal((await call("/ads.txt")).text, "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");

  const { token } = (await call("/api/join", { body: { name: "Mirona" } })).json;
  assert.equal((await call("/api/world", { token })).json.ads.real, true);
  assert.equal((await call("/api/action", { token, body: { type: "ad" } })).status, 400, "sin vale no paga");
  const { ticket } = (await call("/api/anuncio", { token, body: {} })).json;
  assert.equal((await call("/api/action", { token, body: { type: "ad", ticket } })).json.error, "El anuncio aún no ha terminado");
  await new Promise(r => setTimeout(r, 350));
  const ok = await call("/api/action", { token, body: { type: "ad", ticket } });
  assert.equal(ok.status, 200); assert.equal(ok.json.reward, 2);
  assert.equal((await call("/api/action", { token, body: { type: "ad", ticket } })).status, 400, "un vale solo vale una vez");
});
