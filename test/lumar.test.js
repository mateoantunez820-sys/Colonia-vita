import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as lumar from "../src/lumar.js";

const T0 = Date.UTC(2026, 8, 28, 10); // lunes 28 de septiembre de 2026, 10:00 UTC
const MIN10 = 600000;

test("Lumar es un mar propio: la misma semilla da el mismo mapa y otra semilla, otro", () => {
  const a = lumar.createLumar("uno", 0, T0), b = lumar.createLumar("uno", 0, T0), c = lumar.createLumar("dos", 0, T0);
  const mapa = m => m.regions.map(R => `${R.name}:${R.bioma}`);
  assert.equal(a.regions.length, 7);
  assert.equal(a.regions[0].bioma, "laguna", "la laguna está en el centro");
  assert.deepEqual(new Set(a.regions.map(R => R.bioma)), new Set(Object.keys(lumar.BIOMAS)));
  assert.deepEqual(mapa(a), mapa(b));
  assert.notDeepEqual(mapa(a), mapa(c));
  for (const R of a.regions) for (const v of R.vecinos) assert.ok(lumar.regionOf(a, v).vecinos.includes(R.id), "las vecindades son simétricas");
});

test("la luna de Lumar es la del cielo y la marea sube dos veces al día", () => {
  const at = (s, k) => assert.equal(lumar.luna(Date.parse(s)).k, k, s);
  at("2024-01-11T11:57Z", "nueva");
  at("2024-01-18T03:52Z", "cuarto-creciente");
  at("2024-01-25T17:54Z", "llena");
  at("2024-02-02T23:18Z", "cuarto-menguante");
  const llena = lumar.luna(Date.parse("2024-01-25T17:54Z")), nueva = lumar.luna(Date.parse("2024-01-11T11:57Z"));
  assert.ok(llena.ilum > 0.99 && nueva.ilum < 0.01);
  assert.ok(llena.mult > 2.5 && nueva.mult < 0.35, "con luna llena se forma mucho más nácar");
  assert.ok(Math.abs(nueva.llenaEn - 14.6) < 0.5, `luna llena en ${nueva.llenaEn} días`);
  // El desove del coral son las noches que siguen a la luna llena
  assert.equal(lumar.luna(Date.parse("2024-01-24T12:00Z")).desove, false);
  assert.equal(lumar.luna(Date.parse("2024-01-27T12:00Z")).desove, true);
  assert.equal(lumar.luna(Date.parse("2024-01-30T12:00Z")).desove, false);
  // Dos mareas altas y dos bajas por día de Lumar; vivas con luna llena, muertas en los cuartos
  assert.deepEqual([3, 9, 15, 21].map(h => lumar.marea(h, 0.5).k), ["alta", "baja", "alta", "baja"]);
  assert.equal(lumar.marea(3, 0.5).viva, true);
  assert.equal(lumar.marea(3, 0.25).viva, false);
  assert.ok(lumar.marea(3, 0).nivel > lumar.marea(3, 0.25).nivel);
});

test("el mar sigue vivo 60 días y da perlas, muchas más con luna llena que con luna nueva", () => {
  const w = core.createWorld(T0), m = lumar.ensure(w, "mar", T0), r = lumar.rng("mar");
  for (let i = 1; i <= 144 * 60; i++) { w.tick++; lumar.step(w, T0 + i * MIN10, r); }
  for (const R of m.regions) for (const k of Object.keys(lumar.ESPECIES_MAR)) assert.ok(Number.isFinite(R[k]) && R[k] >= 0.5 && R[k] <= 100, `${R.name} ${k}=${R[k]}`);
  assert.ok(m.regions.filter(R => R.flora > 5 && R.poli > 5 && R.depre > 2 && R.reci > 5).length >= 6, "las cuatro especies siguen en casi todo el mar");
  assert.ok(m.perlaSerial >= 50 && m.perlaSerial <= 150, `perlas nacidas en 60 días: ${m.perlaSerial}`);
  const nacidas = k => Object.values(m.perlas).filter(p => p.luna === lumar.FASES.find(f => f.k === k).name).length;
  assert.ok(nacidas("llena") > 4 * Math.max(1, nacidas("nueva")), `llena ${nacidas("llena")}, nueva ${nacidas("nueva")}`);
  assert.ok(Object.values(m.perlas).filter(p => p.estado === "libre").length <= lumar.LUMAR.FREE_MAX);
  assert.ok(Object.values(m.perlas).every(p => /^PRL-[0-9A-F]{8}$/.test(p.id) && p.brillo >= 1 && p.brillo <= 100));
  assert.ok(core.verifyChain(w));
});

// Pone una perla libre en el mar
function perla(w) {
  const m = w.lumar, antes = m.perlaSerial;
  m.regions[0].nacar = 1; w.tick++; lumar.step(w, T0 + w.tick * MIN10);
  assert.equal(m.perlaSerial, antes + 1);
  return Object.values(m.perlas).find(p => p.n === m.perlaSerial).id;
}

test("una perla no se usa: se regala, y quien la recibe la infunde en una colonia", () => {
  const w = core.createWorld(T0), m = lumar.ensure(w, "regalo", T0), col = Object.values(w.colonies)[0];
  const ana = core.createUser(w, "Ana", "h1"), leo = core.createUser(w, "Leo", "h2"), sol = core.createUser(w, "Sol", "h3");
  ana.code = "ANA234"; leo.code = "LEO234"; sol.code = "SOL234";
  const minted = w.supply.minted;
  const [p1, p2, p3] = [perla(w), perla(w), perla(w)];

  assert.equal(lumar.collectPearl(w, ana, p1).ok, true);
  assert.equal(lumar.collectPearl(w, leo, p1).ok, false, "nadie más puede recoger la misma perla");
  assert.equal(lumar.collectPearl(w, ana, p2).ok, false, "una perla al día");
  assert.equal(lumar.infusePearl(w, ana, p1, col).ok, false, "quien la recoge no la puede usar");
  assert.equal(lumar.givePearl(w, ana, p1, "ana234").ok, false, "ni regalársela a sí misma");
  assert.equal(lumar.givePearl(w, ana, p1, "ZZZZZZ").ok, false, "el código tiene que ser de alguien");
  assert.equal(lumar.givePearl(w, leo, p1, "SOL234").ok, false, "solo quien la recogió la regala");
  const g = lumar.givePearl(w, ana, p1, "leo-234");
  assert.equal(g.ok, true, g.error); assert.equal(g.to, "Leo");
  assert.equal(lumar.givePearl(w, ana, p1, "SOL234").ok, false, "se regala una sola vez");
  assert.equal(lumar.givePearl(w, leo, p1, "SOL234").ok, false, "quien la recibe no la vuelve a regalar");
  assert.deepEqual(lumar.pearlsOf(w, leo.id, "regalada").map(p => p.id), [p1]);

  // Una plaga corta termina; la perla cura la colonia
  Object.assign(col, { event: "plaga", eventLeft: 5, salud: 50 });
  const r1 = lumar.infusePearl(w, leo, p1, col);
  assert.equal(r1.ok, true, r1.error);
  assert.equal(col.event, null); assert.equal(col.eventLeft, 0);
  assert.equal(r1.termina, "plaga");
  assert.ok(col.salud > 50);
  assert.equal(lumar.infusePearl(w, leo, p1, col).ok, false, "no se infunde dos veces");
  const cert = lumar.certificate(w, p1);
  assert.deepEqual(cert.movimientos.map(x => x.tipo), ["perla", "recolección", "regalo", "infusión"]);
  assert.equal(cert.cadenaOk, true);
  assert.equal(cert.de, "Ana"); assert.equal(cert.recogio, "Ana");

  // Sin código va a quien la necesite: primero quien tiene células en una colonia en apuros
  assert.equal(lumar.collectPearl(w, leo, p2).ok, true);
  assert.equal(lumar.givePearl(w, leo, p2, null, T0).ok, false, "si nadie más juega, no hay a quién dársela");
  ana.ret = { seen: T0 }; sol.ret = { seen: T0 - 3600000 };
  const otra = Object.values(w.colonies).find(c => c !== col) || core.createColony(w, { name: "Brisa", genes: { ef: 7, res: 7, fer: 7 }, met: 7, treasury: 50 });
  Object.assign(otra, { event: "sequia", eventLeft: 40 });
  otra.cells[0].owner = sol.id;
  const g2 = lumar.givePearl(w, leo, p2, null, T0);
  assert.equal(g2.ok, true, g2.error); assert.equal(g2.to, "Sol");
  // Un evento largo se acorta y sigue; la floración no se toca
  const r2 = lumar.infusePearl(w, sol, p2, otra);
  assert.equal(r2.ok, true, r2.error);
  assert.equal(otra.event, "sequia"); assert.equal(otra.eventLeft, 40 - r2.acorta); assert.ok(r2.acorta >= 12);
  // Entre quienes no están en apuros, recibe quien menos perlas tiene: Ana (0) antes que Sol (1)
  assert.equal(lumar.collectPearl(w, leo, p3).ok, false, "Leo ya recogió hoy");
  leo.daily.perlas = 0;
  assert.equal(lumar.collectPearl(w, leo, p3).ok, true);
  otra.event = null; otra.eventLeft = 0;
  assert.equal(lumar.givePearl(w, leo, p3, null, T0).to, "Ana");
  Object.assign(col, { event: "floracion", eventLeft: 20 });
  assert.equal(lumar.infusePearl(w, ana, p3, col).ok, true);
  assert.equal(col.event, "floracion"); assert.equal(col.eventLeft, 20);

  assert.equal(w.supply.minted, minted, "las perlas no acuñan VIT");
  assert.deepEqual([ana.perlas, leo.perlas, sol.perlas].map(x => [x.recogidas, x.regaladas, x.recibidas, x.infundidas]), [[1, 1, 1, 1], [2, 2, 1, 1], [0, 0, 1, 1]]);
  assert.deepEqual([m.recogidas, m.regaladas, m.infundidas], [3, 3, 3]);
  assert.ok(core.verifyChain(w));
});

test("la perla que nadie recoge se hunde, y la vista muestra lo que toca a cada jugador", () => {
  const w = core.createWorld(T0), m = lumar.ensure(w, "vista", T0);
  const ana = core.createUser(w, "Ana", "h1"), leo = core.createUser(w, "Leo", "h2"); leo.code = "LEO234";
  const [p1, p2] = [perla(w), perla(w)];
  lumar.collectPearl(w, ana, p1);
  let v = lumar.view(w, ana);
  assert.deepEqual(v.paraRegalar.map(p => p.id), [p1]);
  assert.deepEqual(v.libres.map(p => p.id), [p2]);
  assert.equal(v.recogidasHoy, 1);
  assert.equal(v.regions.length, 7);
  assert.ok(v.luna.name && v.marea.k);
  lumar.givePearl(w, ana, p1, "LEO234");
  v = lumar.view(w, leo);
  assert.deepEqual(v.recibidas.map(p => [p.id, p.de]), [[p1, "Ana"]]);
  assert.equal(lumar.view(w, null).paraRegalar.length, 0);
  for (let i = 0; i <= lumar.LUMAR.TTL + 1; i++) { w.tick++; lumar.step(w, T0 + w.tick * MIN10); }
  assert.equal(m.perlas[p2].estado, "disuelta", "la perla que nadie recoge se hunde");
  assert.equal(m.perlas[p1].estado, "regalada", "la regalada espera a su dueño");
  assert.equal(lumar.certificate(w, "PRL-00000000"), null);
});
