import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as oruz from "../src/oruz.js";

function hija(w, persona = { riesgo: 0.5, codicia: 0.5, cuidado: 0.5 }) {
  const madre = Object.values(w.colonies)[0];
  return core.createColony(w, { name: "Brisa", genes: { ef: 7, res: 6, fer: 7 }, met: 7, treasury: 120, parent: madre.id, persona });
}
// Avanza solo Oruz (la federación queda quieta) hasta que se cumpla la condición
function hasta(w, cond, max = 200) {
  let n = 0;
  while (!cond() && n++ < max) { w.tick++; oruz.step(w, oruz.rng("ciclo" + n)); }
  return n;
}
// Las células nacen con genes y vida al azar (Math.random en core). Con el azar fijado por una semilla,
// una prueba que depende de toda la escuela da siempre el mismo resultado.
function conAzar(semilla, fn) {
  const antes = Math.random;
  Math.random = oruz.rng(semilla);
  try { return fn(); } finally { Math.random = antes; }
}

test("Oruz es un mundo propio: la misma semilla da el mismo mapa y otra semilla, otro", () => {
  const a = oruz.createOruz("uno"), b = oruz.createOruz("uno"), c = oruz.createOruz("dos");
  const mapa = o => o.regions.map(R => `${R.name}:${R.bioma}`);
  assert.equal(a.regions.length, 7);
  assert.deepEqual(mapa(a), mapa(b));
  assert.notDeepEqual(mapa(a), mapa(c));
  for (const R of a.regions) for (const v of R.vecinos) assert.ok(oruz.regionOf(a, v).vecinos.includes(R.id), "las vecindades son simétricas");
  assert.deepEqual(oruz.calendario({ hora: 24 * 6 * 5 + 30 }), { anio: 2, estacion: "Soles", k: "soles", dia: 2, hora: 6 });
});

test("el ecosistema de cuatro roles sigue vivo 60 días y da Ámbar sin inundar el mundo", () => {
  const w = core.createWorld(), o = oruz.ensure(w, "eco"), r = oruz.rng("eco");
  for (let i = 0; i < 144 * 60; i++) { w.tick++; oruz.step(w, r); }
  for (const R of o.regions) for (const k of Object.keys(oruz.ROLES)) assert.ok(Number.isFinite(R[k]) && R[k] >= 0.5 && R[k] <= 100, `${R.name} ${k}=${R[k]}`);
  assert.ok(o.regions.filter(R => R.flora > 5 && R.poli > 5 && R.depre > 2 && R.reci > 5).length >= 5, "casi todas las regiones conservan sus cuatro roles");
  assert.ok(o.ambarSerial >= 60 && o.ambarSerial <= 250, `Ámbar nacido en 60 días: ${o.ambarSerial}`);
  assert.ok(Object.values(o.ambar).filter(p => p.estado === "libre").length <= oruz.ORUZ.AMBER_FREE_MAX);
  assert.ok(core.verifyChain(w));
});

test("la escuela repara una personalidad rota, da 12 lecciones y gradúa sin tocar el mundo real", () => {
  const H = oruz.ORUZ.HORIZON;
  oruz.ORUZ.HORIZON = 72; // lecciones cortas para que la prueba vaya rápido
  try {
    const w = core.createWorld(); oruz.ensure(w, "escuela");
    const c = hija(w, { riesgo: NaN, codicia: NaN, cuidado: NaN });
    const minted = w.supply.minted, chain = w.chain.length, cells = c.cells.length;
    hasta(w, () => c.oruz);
    assert.equal(c.oruz.estado, "aprendiz");
    assert.ok(Object.values(c.ai.persona).every(Number.isFinite), "la personalidad queda reparada");
    const n = hasta(w, () => c.oruz?.estado === "graduada");
    assert.equal(c.oruz.estado, "graduada");
    assert.equal(c.oruz.lecciones, oruz.ORUZ.LESSONS);
    assert.ok(c.oruz.nota >= 0 && c.oruz.nota <= 100);
    assert.ok(n <= oruz.ORUZ.LESSONS * oruz.ORUZ.LESSON_EVERY + 2, `tardó ${n} ciclos`);
    // Las lecciones se simulan en copias: en el mundo real no se acuña VIT ni nacen células por ellas
    assert.equal(w.supply.minted, minted);
    assert.equal(c.cells.length, cells);
    assert.ok(w.chain.slice(chain).every(b => ["graduación", "ámbar"].includes(b.tipo)));
    assert.ok(core.verifyChain(w));
    assert.equal(Object.keys(w.oruz.escuela).length, 0);
  } finally { oruz.ORUZ.HORIZON = H; }
});

test("una aprendiz con mala estrategia sale de la escuela creciendo más que como nació", () => conAzar("mala-estrategia", () => {
  const w = core.createWorld(); oruz.ensure(w, "aprende");
  const c = hija(w, { riesgo: 0, codicia: 1, cuidado: 1 });
  hasta(w, () => c.oruz?.estado === "graduada");
  assert.equal(c.oruz.estado, "graduada");
  assert.ok(c.oruz.mejora > 0, `mejora en el examen final: ${c.oruz.mejora}%`);
  for (const k of ["riesgo", "codicia", "cuidado"]) assert.ok(Math.abs(c.ai.persona[k] - { riesgo: 0, codicia: 1, cuidado: 1 }[k]) <= oruz.ORUZ.RANGE + 1e-9, "conserva su carácter");
}));

test("el Ámbar es único, se recoge con límite diario, se infunde una vez y deja certificado", () => {
  const w = core.createWorld(), o = oruz.ensure(w, "ambar"), col = Object.values(w.colonies)[0];
  const ana = core.createUser(w, "Ana", "h1"), leo = core.createUser(w, "Leo", "h2");
  for (let i = 0; i < 3; i++) { o.regions[0].resina = 1; w.tick++; oruz.step(w); }
  const libres = Object.values(o.ambar).filter(p => p.estado === "libre");
  assert.ok(libres.length >= 3);
  assert.equal(new Set(libres.map(p => p.id)).size, libres.length, "cada pieza tiene su propio código");
  const [a, b, c] = libres.map(p => p.id);
  assert.equal(oruz.collectAmber(w, ana, a).ok, true);
  assert.equal(oruz.collectAmber(w, leo, a).ok, false, "nadie más puede recoger la misma pieza");
  assert.equal(oruz.collectAmber(w, ana, b).ok, true);
  assert.equal(oruz.collectAmber(w, ana, c).ok, false, "hay un límite diario");
  assert.equal(oruz.infuseAmber(w, leo, a, col).ok, false, "solo su dueña la infunde");
  const e = col.energia;
  assert.equal(oruz.infuseAmber(w, ana, a, col).ok, true);
  assert.ok(col.energia > e);
  assert.equal(oruz.infuseAmber(w, ana, a, col).ok, false, "no se infunde dos veces");
  const cert = oruz.certificate(w, a);
  assert.deepEqual(cert.movimientos.map(m => m.tipo), ["ámbar", "recolección", "infusión"]);
  assert.equal(cert.cadenaOk, true);
  assert.deepEqual(oruz.amberOf(w, ana.id).map(p => p.id), [b]);
  hasta(w, () => o.ambar[c].estado !== "libre", oruz.ORUZ.AMBER_TTL + 5);
  assert.equal(o.ambar[c].estado, "disuelta", "la pieza que nadie recoge se disuelve");
});

test("las aprendices viven con el clima de Oruz y los roles dan ventajas pequeñas", () => {
  const w = core.createWorld(), o = oruz.ensure(w, "roles"), c = hija(w);
  hasta(w, () => c.oruz);
  const R = oruz.regionOf(o, c.oruz.region);
  const madrid = { weather: { luz: 1, frio: 0, lluvia: 0, desc: "Madrid" }, attention: 0, difficulty: 1 };
  assert.equal(oruz.envFor(w, c, madrid).weather.desc, `Oruz · ${R.name}`);
  o.polinizadoras = 0;
  c.oruz = { estado: "graduada", rol: "guardiana" };
  assert.equal(oruz.envFor(w, c, { weather: { luz: 1, frio: 0.8, lluvia: 0 } }).weather.frio, 0.4);
  c.oruz.rol = "productora";
  assert.equal(oruz.envFor(w, c, madrid).weather.luz, 1.06);
  assert.equal(oruz.envFor(w, Object.values(w.colonies)[0], { weather: null }).weather.luz, 1, "Génesis no cambia");
  o.polinizadoras = 9;
  assert.equal(oruz.envFor(w, Object.values(w.colonies)[0], { weather: null }).weather.luz, 1.08, "las polinizadoras ayudan hasta un 8%");
});
