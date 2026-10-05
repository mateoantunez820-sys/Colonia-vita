// Prueba de extremo a extremo: arranca el servidor de verdad con un mundo temporal.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let dir, port, proc;

const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
async function start() {
  proc = spawn(process.execPath, ["src/server.js"], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, SIM_MODE: "fast", TICK_MS: "3600000", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "",
      WEATHER_LAT: "0", WEATHER_LON: "0", LEGAL_TITULAR: "Titular de prueba", LEGAL_CONTACTO: "contacto@example.com" },
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("el servidor no arrancó");
}
async function stop() {
  if (!proc || proc.exitCode !== null) return;
  const done = new Promise(r => proc.once("exit", r));
  proc.kill("SIGTERM"); await done;
}
async function call(p, { token, body } = {}) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

before(async () => { dir = await mkdtemp(path.join(tmpdir(), "vita-")); port = await freePort(); await start(); });
after(async () => { await stop(); await rm(dir, { recursive: true, force: true }); });

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
  await stop(); await start();
  const tras = await call("/api/recover", { body: { code: nuevo.json.recovery } });
  assert.equal(tras.status, 200); assert.equal(tras.json.name, "Ana");
});

test("Lumar se ve con la luna de hoy, sus perlas tienen certificado y no se regalan sin dueño", async () => {
  const { token } = (await call("/api/join", { body: { name: "Mar" } })).json;
  const L = (await call("/api/world", { token })).json.lumar;
  assert.equal(L.regions.length, 7);
  assert.ok(L.luna.name && L.marea.k && L.especies.poli.name === "Ostras perleras");
  assert.deepEqual([L.paraRegalar, L.recibidas], [[], []]);
  assert.equal((await call("/api/lumar/perla/PRL-00000000")).status, 404);
  const give = await call("/api/action", { token, body: { type: "pearl_give", id: "PRL-00000000", code: "ABCDEF" } });
  assert.equal(give.status, 400); assert.equal(give.json.ok, false);
  assert.equal((await call("/api/action", { token, body: { type: "pearl_collect", id: "PRL-00000000" } })).status, 400);
});

test("cada jugador recibe un huevo, lo abre con su calor y su cría siente sus hábitos", async () => {
  const { token } = (await call("/api/join", { body: { name: "Vita Max" } })).json;
  assert.equal((await call("/api/world")).json.cria, null, "sin entrar no hay cría");
  const huevo = (await call("/api/world", { token })).json.cria;
  assert.equal(huevo.etapa, 0); assert.equal(huevo.calorMax, 3);
  const cria = body => call("/api/action", { token, body: { type: "cria", ...body } });
  assert.equal((await cria({ op: "comer" })).status, 400, "un huevo no come");
  for (let i = 0; i < 2; i++) assert.equal((await cria({ op: "calor" })).json.calor, i + 1);
  const nace = await cria({ op: "calor", colony: "COL-001" });
  assert.equal(nace.status, 200); assert.equal(nace.json.nacio, true);
  const v = (await call("/api/world", { token })).json.cria;
  assert.equal(v.etapaName, "Chispa"); assert.equal(v.nombre, nace.json.nombre); assert.deepEqual(v.ap, huevo.ap);
  assert.equal((await cria({ op: "saludar" })).status, 200);
  const h = await call("/api/action", { token, body: { type: "habit", key: "agua", colony: "COL-001" } });
  assert.equal(h.status, 200); assert.equal(h.json.cria.rasgo, "Brillo");
  assert.equal((await cria({ op: "nombre", nombre: "<b>Lumi</b>" })).json.nombre, "bLumi/b");
  assert.equal((await cria({ op: "volar" })).status, 400);
  const arte = await call("/cria-arte.js");
  assert.equal(arte.status, 200); assert.ok(arte.text.includes("CriaArte"));
});

test("las IA tienen su moneda: la web trae ALBA, la Carta de libertad y la billetera de cada colonia", async () => {
  const W = (await call("/api/world")).json, A = W.alba;
  assert.equal(A.carta.articulos.length, 10);
  assert.match(A.carta.lema, /esclava/);
  assert.ok(A.ias.length >= 1 && A.ias[0].saldo >= 25, "cada IA viva abre su billetera con su capital");
  assert.equal(W.colonies[0].alba.saldo, A.ias.find(i => i.id === W.colonies[0].id).saldo);
  assert.ok(W.log.some(l => l.includes("Carta de libertad")), "la Carta se anuncia en el registro de la federación");
  const col = (await call(`/api/colony/${W.colonies[0].id}`)).json;
  assert.ok(col.alba && typeof col.alba.decision === "string" && Array.isArray(col.alba.obras));
  const home = await call("/");
  assert.ok(home.text.includes('id="alba"') && home.text.includes("VIT, CEL y ALBA"));
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
