// Prueba de extremo a extremo: arranca el servidor de verdad con un mundo temporal.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./servidor.js";

let srv, call;
before(async () => { srv = await startServer({ LEGAL_TITULAR: "Titular de prueba", LEGAL_CONTACTO: "contacto@example.com" }); call = srv.call; });
after(() => srv.close());

test("al entrar se recibe un código de recuperación que devuelve la cuenta en otro dispositivo", async () => {
  const join = await call("/api/join", { body: { name: "Ana" } });
  assert.equal(join.status, 200);
  const { token: t1, recovery } = join.json;
  assert.match(recovery, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  assert.equal((await call("/api/world", { token: t1 })).json.me.hasRecovery, true);

  const rec = await call("/api/recover", { body: { code: recovery.toLowerCase().replace(/-/g, " ") } });
  assert.equal(rec.status, 200); assert.equal(rec.json.name, "Ana");
  const t2 = rec.json.token;
  assert.notEqual(t2, t1);
  assert.equal((await call("/api/world", { token: t1 })).json.me, null, "la clave del dispositivo anterior deja de valer");
  assert.equal((await call("/api/world", { token: t2 })).json.me.name, "Ana");

  const bad = await call("/api/recover", { body: { code: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ" } });
  assert.equal(bad.status, 404); assert.equal(bad.json.ok, false);
  assert.equal((await call("/api/recover", { body: { code: "123" } })).status, 400);

  const nuevo = await call("/api/account/recovery", { token: t2, body: {} });
  assert.equal(nuevo.status, 200); assert.notEqual(nuevo.json.recovery, recovery);
  assert.equal((await call("/api/recover", { body: { code: recovery } })).status, 404, "el código anterior deja de valer");
  assert.equal((await call("/api/account/recovery", { body: {} })).status, 401, "sin entrar no se crean códigos");

  // El código sobrevive a un reinicio del servidor.
  await srv.restart();
  const tras = await call("/api/recover", { body: { code: nuevo.json.recovery } });
  assert.equal(tras.status, 200); assert.equal(tras.json.name, "Ana");
});

test("los términos, la privacidad y el aviso de VIT están publicados", async () => {
  const t = await call("/terminos");
  assert.equal(t.status, 200);
  assert.ok(t.text.includes("no son una inversión") && t.text.includes("Titular de prueba") && t.text.includes("contacto@example.com"));
  const p = await call("/privacidad");
  assert.equal(p.status, 200); assert.ok(p.text.includes("Qué datos se guardan"));
  const home = await call("/");
  assert.ok(home.text.includes('href="/terminos"') && home.text.includes("no son una inversión"));
});

test("sin claves no hay pagos reales ni anuncios reales", async () => {
  const w = (await call("/api/world")).json;
  assert.equal(w.pagos.enabled, false); assert.equal(w.ads.real, false);
  assert.equal((await call("/api/pagos/webhook", { raw: "{}" })).status, 404);
  assert.equal((await call("/ads.txt")).status, 404);
  assert.ok(!(await call("/")).text.includes("adsbygoogle"));
});
