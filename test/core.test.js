import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import { clientIp } from "../src/net.js";
import { simulatedWeather } from "../src/weather.js";

const env = () => ({ weather: null, attention: 0, difficulty: 1 });
function run(w, ticks) { for (let i = 0; i < ticks; i++) core.stepWorld(w, env); }

// Azar con semilla para que las simulaciones largas den siempre el mismo resultado.
function seeded(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function withSeed(seed, fn) { const orig = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = orig; } }
const validPersona = p => [p.riesgo, p.codicia, p.cuidado].every(x => Number.isFinite(x) && x >= 0 && x <= 1);

test("la federación sobrevive 45 días simulados y funda colonias hijas", () => {
  const w = withSeed(7, () => { const w = core.createWorld(); run(w, 144 * 45); return w; });
  const cols = Object.values(w.colonies);
  assert.ok(cols.some(c => c.alive), "debe quedar alguna colonia viva");
  assert.ok(cols.length >= 2, `esperaba colonias hijas, hay ${cols.length}`);
  assert.ok(core.verifyChain(w), "la cadena debe verificarse");
  assert.ok(cols.every(c => validPersona(c.ai.persona)), "todas las IA deben tener una personalidad válida");
  assert.equal(w.stats.foundings, cols.length - 1);
  assert.ok(w.stats.births > 0 && Object.values(w.stats.events).some(n => n > 0));
  console.log(cols.map(c => `${c.name} vivo=${c.alive} células=${c.cells.length} tesoro=${Math.floor(c.treasury)}`).join(" | "));
});

test("las colonias hijas heredan una personalidad válida y parecida a la de su madre", () => {
  const w = core.createWorld(); const g = Object.values(w.colonies)[0];
  g.treasury = 1000; g.salud = 90;
  for (let i = 0; i < 150; i++) g.cells.push(core.newCell(w, g, { ef: 8, res: 8, fer: 8 }, "colonia"));
  const hija = core.maybeFound(w, g);
  assert.ok(hija, "debe fundar");
  const p = JSON.parse(JSON.stringify(hija.ai.persona)); // como queda al guardar y cargar
  assert.ok(validPersona(p), `personalidad inválida: ${JSON.stringify(p)}`);
  for (const k of ["riesgo", "codicia", "cuidado"]) assert.ok(Math.abs(p[k] - g.ai.persona[k]) <= 0.21, `${k} se aleja demasiado`);
});

test("al cargar un mundo se reparan las personalidades dañadas", () => {
  const w = core.createWorld(); const g = Object.values(w.colonies)[0];
  g.ai.persona = { riesgo: null, codicia: null, cuidado: null };
  delete w.stats;
  assert.equal(core.migrateWorld(w), 1);
  assert.ok(validPersona(g.ai.persona));
  assert.equal(w.stats.foundings, 0);
});

test("adoptar cobra el precio, quema la comisión y cambia el dueño", () => {
  const w = core.createWorld(); const col = Object.values(w.colonies)[0];
  const u = core.createUser(w, "Ana", "h"); u.vit = 500;
  const c = col.cells[0], price = core.cellPrice(c), burned = w.supply.burned;
  const r = core.adopt(w, col, c.id, u);
  assert.equal(r.ok, true); assert.equal(c.owner, u.id); assert.equal(u.vit, 500 - price);
  assert.ok(w.supply.burned > burned);
  assert.equal(core.adopt(w, col, c.id, u).ok, false, "no se puede adoptar dos veces");
});

test("invertir y retirar conserva el valor menos la comisión de salida", () => {
  const w = core.createWorld(); const col = Object.values(w.colonies)[0];
  col.treasury = 100;
  const u = core.createUser(w, "Leo", "h"); u.vit = 200;
  const price0 = core.sharePrice(col);
  assert.equal(core.invest(w, col, u, 100).ok, true);
  assert.equal(col.treasury, 200);
  assert.ok(Math.abs(core.sharePrice(col) - price0) < 1e-9, "invertir no cambia el precio");
  col.treasury += 100; // la IA hace crecer el tesoro
  const value = col.fund.shares[u.id] * core.sharePrice(col);
  const before = u.vit, r = core.withdraw(w, col, u);
  assert.equal(r.ok, true); assert.equal(r.partial, false);
  assert.equal(u.vit - before, Math.floor(value * 0.95));
  assert.ok(value > 100 && value < 200, `valor ${value}`);
});

test("no se puede comprar media colonia invirtiendo con el tesoro vacío", () => {
  const w = core.createWorld(); const col = Object.values(w.colonies)[0];
  col.treasury = 100; core.sharePrice(col); // la cartera nace con el tesoro lleno
  col.treasury = 1;                         // la IA se gasta casi todo en mejoras
  const u = core.createUser(w, "Pícaro", "h"); u.vit = 1000; const start = u.vit;
  assert.equal(core.invest(w, col, u, 5).ok, true);
  col.treasury += 300;                      // y después vuelve a acuñar
  assert.equal(core.withdraw(w, col, u).ok, true);
  const gain = u.vit - start;
  assert.ok(gain < 10, `ganancia excesiva: ${gain} VIT (antes del arreglo eran unos 237)`);
});

test("si el tesoro no alcanza, se paga lo que hay y el resto sigue invertido", () => {
  const w = core.createWorld(); const col = Object.values(w.colonies)[0];
  col.treasury = 0;
  const u = core.createUser(w, "Eva", "h"); u.vit = 300;
  assert.equal(core.invest(w, col, u, 300).ok, true);
  col.treasury = 50; // la IA gasta 250 en mejoras
  const r1 = core.withdraw(w, col, u);
  assert.equal(r1.ok, true); assert.equal(r1.partial, true); assert.ok(r1.pending > 0);
  assert.equal(col.treasury, 0);
  assert.ok(col.fund.shares[u.id] > 0, "conserva el resto de la participación");
  assert.equal(core.withdraw(w, col, u).ok, false, "con el tesoro vacío no paga nada");
  col.treasury = 1000;
  const r2 = core.withdraw(w, col, u);
  assert.equal(r2.ok, true); assert.equal(r2.partial, false);
  assert.equal(col.fund.shares[u.id], undefined);
});

test("los anuncios tienen límite diario y espera entre ellos", () => {
  const w = core.createWorld(); const u = core.createUser(w, "Sol", "h");
  let t = 1e12;
  for (let i = 0; i < core.ADS.perDay; i++) { assert.equal(core.watchedAd(w, u, t).ok, true); t += core.ADS.cooldownMs; }
  assert.equal(core.watchedAd(w, u, t).ok, false);
  assert.equal(core.watchedAd(core.createWorld(), core.createUser(w, "X", "h"), 5).ok, true);
});

test("las esporas tienen tope diario y espera entre ellas", () => {
  const w = core.createWorld(); const u = core.createUser(w, "Pau", "h");
  let t = 1e12;
  assert.equal(core.mineSpore(w, u, 2, t).ok, true);
  assert.equal(core.mineSpore(w, u, 2, t + 1000).ok, false, "hay que esperar entre esporas");
  for (let i = 1; i < core.SPORES.perDay; i++) { t += core.SPORES.cooldownMs; assert.equal(core.mineSpore(w, u, 2, t).ok, true); }
  t += core.SPORES.cooldownMs;
  const r = core.mineSpore(w, u, 2, t);
  assert.equal(r.ok, false); assert.match(r.error, /mañana/);
  assert.equal(core.userView(w, u).sporesLeft, 0);
});

test("cada hábito de salud cuenta una vez al día", () => {
  const w = core.createWorld(); const col = Object.values(w.colonies)[0]; const u = core.createUser(w, "Iris", "h");
  const e = col.energia;
  assert.equal(core.logHabit(w, u, col, "agua").ok, true);
  assert.ok(col.energia > e);
  assert.equal(core.logHabit(w, u, col, "agua").ok, false);
});

test("el mantenimiento solo quema el tesoro que sobra", () => {
  const w = core.createWorld(); const col = Object.values(w.colonies)[0];
  col.treasury = 200; run(w, 1);
  assert.equal(w.stats.upkeepBurned, 0);
  col.treasury = core.CONFIG.UPKEEP_FREE + 1000; run(w, 1);
  assert.ok(Math.abs(w.stats.upkeepBurned - 1000 * core.CONFIG.UPKEEP_RATE) < 0.05, `quemado ${w.stats.upkeepBurned}`);
});

test("alterar un bloque rompe la verificación", () => {
  const w = core.createWorld(); run(w, 50);
  w.chain[1].cant = 9999;
  assert.equal(core.verifyChain(w), false);
});

test("la IP de los límites no se puede falsear con X-Forwarded-For", () => {
  assert.equal(clientIp({ "x-forwarded-for": "1.1.1.1" }, "9.9.9.9", 0), "9.9.9.9", "sin proxy se ignora la cabecera");
  assert.equal(clientIp({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }, "10.0.0.1", 1), "5.5.5.5", "detrás de un proxy vale la IP que añadió el proxy");
  assert.equal(clientIp({}, "10.0.0.1", 1), "10.0.0.1");
});

test("el clima simulado es fijo para cada hora y sigue las estaciones", () => {
  const day0 = Date.UTC(2026, 0, 1) / 86400000;
  const strip = x => ({ ...x, at: 0 });
  assert.deepEqual(strip(simulatedWeather(day0 + 10, 600)), strip(simulatedWeather(day0 + 10, 600)));
  const avgTemp = (from, to) => { let s = 0, n = 0; for (let d = from; d < to; d++) for (let m = 0; m < 1440; m += 180) { s += simulatedWeather(day0 + d, m).temp; n++; } return s / n; };
  assert.ok(avgTemp(0, 31) + 10 < avgTemp(181, 212), "enero debe ser bastante más frío que julio");
  for (let d = 0; d < 365; d += 7) {
    const x = simulatedWeather(day0 + d, 720);
    assert.ok(x.luz >= 0.4 && x.luz <= 1 && x.source === "simulado");
  }
});

test("sin clave de Anthropic la consulta falla sin romper y devuelve la mitad de lo cobrado", async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
  const { consultColony } = await import("../src/ai.js");
  const w = core.createWorld(); const col = Object.values(w.colonies)[0]; col.treasury = 100;
  await consultColony(w, col, env());
  const cost = core.CONFIG.AI_CALL_COST_VIT, refund = Math.floor(cost / 2);
  assert.equal(col.treasury, 100 - cost + refund);
  assert.equal(w.supply.burned, cost - refund);
  assert.equal(w.stats.aiConsults, 0);
});
