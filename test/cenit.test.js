import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as cenit from "../src/cenit.js";

const T0 = Date.UTC(2026, 8, 28, 10); // lunes 28 de septiembre de 2026, 10:00 UTC
const MIN10 = 600000;

test("Cénit es un cielo propio: la misma semilla da el mismo mapa y otra semilla, otro", () => {
  const a = cenit.createCenit("uno", 0, T0), b = cenit.createCenit("uno", 0, T0), c = cenit.createCenit("dos", 0, T0);
  const mapa = m => m.regions.map(R => `${R.name}:${R.bioma}`);
  assert.equal(a.regions.length, 7);
  assert.equal(a.regions[0].bioma, "puerto", "el puerto de las nubes está en el centro");
  assert.deepEqual(new Set(a.regions.map(R => R.bioma)), new Set(Object.keys(cenit.BIOMAS)));
  assert.deepEqual(mapa(a), mapa(b));
  assert.notDeepEqual(mapa(a), mapa(c));
  for (const R of a.regions) for (const v of R.vecinos) assert.ok(cenit.regionOf(a, v).vecinos.includes(R.id), "las vecindades son simétricas");
});

test("el cielo de Cénit sigue el calendario real de las lluvias de estrellas y la luz de la luna", () => {
  const at = (y, m, d, h = 12) => cenit.cielo(Date.UTC(y, m - 1, d, h));
  const per = at(2026, 8, 12), gem = at(2026, 12, 14), cua = at(2027, 1, 3);
  assert.equal(per.lluvia.k, "perseidas"); assert.ok(per.thz >= 90, `Perseidas ${per.thz}`);
  assert.equal(gem.lluvia.k, "geminidas"); assert.ok(gem.thz >= 140, `Gemínidas ${gem.thz}`);
  assert.equal(cua.lluvia.k, "cuadrantidas", "las Cuadrántidas empiezan en diciembre y tienen el pico en enero");
  assert.equal(at(2026, 12, 30).lluvia.k, "cuadrantidas");
  assert.equal(at(2026, 10, 21).lluvia.k, "orionidas");
  // A mediados de marzo no hay ninguna lluvia: la próxima fuerte son las Líridas de abril
  const marzo = at(2026, 3, 15);
  assert.equal(marzo.lluvia, null); assert.equal(marzo.thz, 0);
  assert.equal(marzo.proxima.k, "liridas");
  assert.equal(new Date(marzo.proxima.desde).toISOString().slice(0, 10), "2026-04-14");
  // Lejos del pico queda la cola de la lluvia, mucho más floja
  assert.ok(at(2026, 8, 2).thz < per.thz / 3);
  // Con luna llena se ven muchas menos estrellas fugaces que con luna nueva
  const llena = cenit.cielo(Date.parse("2024-01-25T17:54Z")), nueva = cenit.cielo(Date.parse("2024-01-11T11:57Z"));
  assert.equal(llena.luna.k, "llena"); assert.equal(nueva.luna.k, "nueva");
  assert.ok(nueva.mult > 3 * llena.mult, `nueva ×${nueva.mult}, llena ×${llena.mult}`);
  assert.ok(per.mult > marzo.mult, "una lluvia fuerte multiplica las estrellas");
});

test("el cielo sigue vivo 60 días y da estrellas fugaces de noche, muchas más con luna nueva", () => {
  const w = core.createWorld(T0), m = cenit.ensure(w, "cielo", T0), r = cenit.rng("cielo"), minted = w.supply.minted;
  const por = {}, horas = {};
  for (let i = 1; i <= 144 * 60; i++) {
    const n = m.estrellaSerial;
    w.tick++; cenit.step(w, T0 + i * MIN10, r);
    const k = m.cielo.luna.k; horas[k] = (horas[k] || 0) + 1;
    if (m.estrellaSerial > n) por[k] = (por[k] || 0) + m.estrellaSerial - n;
  }
  for (const R of m.regions) for (const k of Object.keys(cenit.ESPECIES_CIELO)) assert.ok(Number.isFinite(R[k]) && R[k] >= 0.5 && R[k] <= 100, `${R.name} ${k}=${R[k]}`);
  assert.ok(m.regions.filter(R => R.flora > 5 && R.poli > 5 && R.depre > 2 && R.reci > 5).length >= 6, "las cuatro especies siguen en casi todo el cielo");
  assert.ok(m.estrellaSerial >= 250 && m.estrellaSerial <= 600, `estrellas en 60 días: ${m.estrellaSerial}`);
  const ritmo = k => (por[k] || 0) / horas[k];
  assert.ok(ritmo("nueva") > 2 * ritmo("llena"), `por ciclo: nueva ${ritmo("nueva")}, llena ${ritmo("llena")}`);
  const ps = Object.values(m.estrellas);
  assert.ok(ps.length <= cenit.CENIT.KEEP + cenit.CENIT.FREE_MAX, "las estrellas viejas no se acumulan");
  assert.ok(ps.every(p => cenit.esNoche(p.hora % 24)), "caen de noche");
  assert.ok(ps.filter(p => p.estado === "libre").length <= cenit.CENIT.FREE_MAX);
  assert.ok(ps.every(p => /^EST-[0-9A-F]{8}$/.test(p.id) && p.brillo >= 1 && p.brillo <= 100));
  assert.equal(w.supply.minted, minted, "Cénit no acuña VIT");
  assert.ok(core.verifyChain(w));
});

// Hace caer una estrella sobre el puerto de las nubes
function estrella(w) {
  const m = w.cenit, antes = m.estrellaSerial;
  m.regions[0].polvo = 1; w.tick++; cenit.step(w, T0 + w.tick * MIN10);
  assert.equal(m.estrellaSerial, antes + 1);
  return Object.values(m.estrellas).find(p => p.n === m.estrellaSerial).id;
}

test("una estrella se atrapa una vez, pide un deseo por cualquier colonia y la hace florecer", () => {
  const w = core.createWorld(T0), m = cenit.ensure(w, "deseo", T0), col = Object.values(w.colonies)[0];
  const ana = core.createUser(w, "Ana", "h1"), leo = core.createUser(w, "Leo", "h2");
  const otros = ["Sol", "Río", "Mar", "Luz"].map((n, i) => core.createUser(w, n, "o" + i));
  const minted = w.supply.minted;
  const [e1, e2] = [estrella(w), estrella(w)];

  assert.equal(cenit.catchStar(w, ana, e1).ok, true);
  assert.equal(cenit.catchStar(w, leo, e1).ok, false, "nadie más atrapa la misma estrella");
  assert.equal(cenit.catchStar(w, ana, e2).ok, false, "una estrella al día");
  assert.deepEqual(cenit.starsOf(w, ana.id).map(p => p.id), [e1]);
  assert.equal(cenit.wishStar(w, leo, e1, col).ok, false, "solo quien la atrapó pide el deseo");

  col.event = "sequia"; col.eventLeft = 10;
  const seca = cenit.wishStar(w, ana, e1, col);
  assert.equal(seca.ok, false); assert.match(seca.error, /perlas de Lumar/);
  col.event = null; col.eventLeft = 0;
  col.alive = false;
  assert.equal(cenit.wishStar(w, ana, e1, col).ok, false, "una colonia extinta no florece");
  col.alive = true;

  const brillo = m.estrellas[e1].brillo, d = cenit.wishStar(w, ana, e1, col);
  assert.equal(d.ok, true, d.error);
  assert.equal(col.event, "floracion");
  assert.equal(d.ciclos, cenit.CENIT.FLORECE + Math.round(brillo / 10));
  assert.equal(col.eventLeft, d.ciclos);
  assert.equal(cenit.wishStar(w, ana, e1, col).ok, false, "una estrella pide un solo deseo");
  assert.equal(cenit.starsOf(w, ana.id).length, 0);

  // Otros jugadores se suman al deseo y la floración dura más, hasta un tope
  assert.equal(cenit.joinWish(w, ana, d.deseo).ok, false, "no se suma a su propio deseo");
  const s = cenit.joinWish(w, leo, d.deseo);
  assert.equal(s.ok, true, s.error);
  assert.equal(col.eventLeft, d.ciclos + cenit.CENIT.SUMA);
  assert.equal(cenit.joinWish(w, leo, d.deseo).ok, false, "se suma una sola vez");
  for (const u of otros.slice(0, 3)) assert.equal(cenit.joinWish(w, u, d.deseo).ok, true);
  assert.equal(cenit.joinWish(w, otros[3], d.deseo).ok, false, `se suman ${cenit.CENIT.SUMAN} como mucho`);
  assert.ok(col.eventLeft <= cenit.CENIT.TOPE);

  // La cadena guarda el origen de la estrella, quién la atrapó y por quién pidió el deseo
  const cert = cenit.certificate(w, e1);
  assert.deepEqual(cert.movimientos.map(b => b.tipo), ["estrella", "captura", "deseo", "sumarse", "sumarse", "sumarse", "sumarse"]);
  assert.equal(cert.cadenaOk, true);
  assert.equal(cenit.certificate(w, "EST-00000000"), null);
  assert.equal(w.supply.minted, minted, "los deseos no crean VIT");
  assert.ok(core.verifyChain(w));
});

test("la floración de los deseos tiene un tope y cada jugador se suma a pocos deseos al día", () => {
  const w = core.createWorld(T0), m = cenit.ensure(w, "tope", T0), col = Object.values(w.colonies)[0];
  const us = ["A1", "B2", "C3", "D4", "E5"].map((n, i) => core.createUser(w, n, "t" + i));
  const deseos = [];
  for (const u of us.slice(0, 4)) {
    const id = estrella(w);
    assert.equal(cenit.catchStar(w, u, id).ok, true);
    const r = cenit.wishStar(w, u, id, col);
    if (!r.ok) { assert.match(r.error, /todo lo que puede/); continue; }
    deseos.push(r.deseo);
    assert.ok(col.eventLeft <= cenit.CENIT.TOPE, `floración ${col.eventLeft}`);
  }
  assert.ok(deseos.length >= 2, "un segundo deseo alarga la floración que ya hay");
  // Un jugador se suma a 3 deseos al día como mucho
  const col2 = core.createColony(w, { name: "Brisa", genes: { ef: 6, res: 6, fer: 6 }, met: 6, treasury: 0, parent: null });
  const e = us[4];
  const ds = [];
  for (const u of us.slice(0, 4)) {
    u.daily.estrellas = 0;
    const id = estrella(w);
    assert.equal(cenit.catchStar(w, u, id).ok, true);
    col2.event = null; col2.eventLeft = 0;
    const r = cenit.wishStar(w, u, id, col2);
    assert.equal(r.ok, true, r.error); ds.push(r.deseo);
  }
  const hechos = ds.map(id => cenit.joinWish(w, e, id).ok);
  assert.equal(hechos.filter(Boolean).length, cenit.CENIT.SUMAR_DIA, JSON.stringify(hechos));
  assert.ok(m.deseos.length <= cenit.CENIT.DESEOS);
});

test("una estrella que nadie atrapa se apaga y ya no se puede atrapar", () => {
  const w = core.createWorld(T0), m = cenit.ensure(w, "apagada", T0);
  const ana = core.createUser(w, "Ana", "h1");
  const id = estrella(w);
  for (let i = 0; i < cenit.CENIT.TTL + 1; i++) { w.tick++; cenit.step(w, T0 + w.tick * MIN10); }
  assert.equal(m.estrellas[id].estado, "apagada");
  assert.equal(cenit.catchStar(w, ana, id).ok, false);
  assert.ok(!cenit.view(w, ana).libres.some(p => p.id === id));
});

test("la vista del cielo muestra la luna, las lluvias, las estrellas y quién puede sumarse a cada deseo", () => {
  const w = core.createWorld(T0), m = cenit.ensure(w, "vista", T0), col = Object.values(w.colonies)[0];
  const ana = core.createUser(w, "Ana", "h1"), leo = core.createUser(w, "Leo", "h2");
  const e = estrella(w), libre = estrella(w);
  cenit.catchStar(w, ana, e);
  const g = cenit.view(w, null);
  assert.equal(g.regions.length, 7);
  assert.ok(g.cielo.luna.name && g.cielo.mult > 0 && typeof g.noche === "boolean");
  assert.ok(g.libres.some(p => p.id === libre && p.expira > 0 && p.expira <= cenit.CENIT.TTL));
  assert.deepEqual(g.mias, []);
  assert.equal(g.especies.poli.name, "Luciérnagas estelares");
  const va = cenit.view(w, ana);
  assert.deepEqual(va.mias.map(p => p.id), [e]);
  assert.equal(va.mias[0].ciclos, cenit.CENIT.FLORECE + Math.round(m.estrellas[e].brillo / 10), "muestra cuánto florecerá la colonia");
  assert.equal(va.atrapadasHoy, 1);
  const d = cenit.wishStar(w, ana, e, col);
  const [da] = cenit.view(w, ana).deseos, [dl] = cenit.view(w, leo).deseos, [dg] = cenit.view(w, null).deseos;
  assert.equal(da.id, d.deseo);
  assert.deepEqual([da.mio, da.puedo], [true, false]);
  assert.deepEqual([dl.mio, dl.puedo], [false, true]);
  assert.equal(dg.puedo, false);
  cenit.joinWish(w, leo, d.deseo);
  const [dl2] = cenit.view(w, leo).deseos;
  assert.deepEqual([dl2.sumado, dl2.puedo, dl2.sumados], [true, false, ["Leo"]]);
  // Cuando se acaba la floración, el deseo deja de aparecer
  col.event = null; col.eventLeft = 0;
  assert.deepEqual(cenit.view(w, leo).deseos, []);
});
