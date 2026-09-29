import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as vita from "../src/vita.js";

const { VITA } = vita;
const genesis = w => Object.values(w.colonies)[0];

test("Vita alimenta sola a una colonia con hambre con raciones de 15 VIT de su reserva", () => {
  const w = core.createWorld(0), col = genesis(w);
  col.energia = 0; col.treasury = 50; w.tick = 1;
  const minted0 = w.supply.minted, burned0 = w.supply.burned;
  vita.step(w);
  assert.equal(VITA.RACION, 15);
  assert.equal(col.energia, 120, "una ración da 15 × 8 de energía");
  assert.equal(col.treasury, 50, "la paga la reserva, no el tesoro de la colonia");
  assert.equal(w.vita.reserva, VITA.DIARIO - 15);
  assert.equal(w.supply.minted - minted0, VITA.DIARIO, "la asignación del día se acuña una vez");
  assert.equal(w.supply.burned - burned0, 15, "la ración se quema como nutrientes");
  assert.deepEqual(w.chain.slice(-3).map(b => b.tipo), ["asignación", "alimento", "quema"]);
  assert.ok(col.log.some(l => l.includes("Vita la alimenta y quema 15 VIT")));
  assert.equal(core.verifyChain(w), true);
  const v = vita.view(w);
  assert.equal(v.hoy.raciones, 1); assert.equal(v.porColonia[col.id].raciones, 1); assert.equal(v.energiaRacion, 120);
});

test("sin hambre no gasta, y a una colonia con hambre la alimenta como mucho 4 veces al día con una hora de espera", () => {
  const w = core.createWorld(0), col = genesis(w);
  col.energia = 5000; w.tick = 1; vita.step(w);
  assert.equal(w.vita.hoy.raciones, 0);
  const ticks = [];
  for (let t = 2; t < 144; t++) {
    w.tick = t; col.energia = 0; const r = w.vita.hoy.raciones;
    vita.step(w);
    if (w.vita.hoy.raciones > r) ticks.push(t);
  }
  assert.equal(ticks.length, VITA.RACIONES_DIA);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] - ticks[i - 1] >= VITA.ESPERA);
  w.tick = 144; col.energia = 0; vita.step(w);
  assert.equal(w.vita.hoy.raciones, 1, "al día siguiente vuelve a poder comer");
});

test("la reserva nunca queda en negativo ni guarda más de dos días", () => {
  const w = core.createWorld(0);
  for (let i = 0; i < 5; i++) core.createColony(w, { name: "C" + i, genes: { ef: 5, res: 5, fer: 5 }, met: 7, treasury: 50, parent: null });
  for (let t = 1; t <= 144 * 6; t++) {
    w.tick = t;
    for (const c of Object.values(w.colonies)) c.energia = 0;
    vita.step(w);
    assert.ok(w.vita.reserva >= 0);
  }
  const w2 = core.createWorld(0); genesis(w2).energia = 1e6; genesis(w2).treasury = 100;
  for (let t = 1; t <= 144 * 6; t++) { w2.tick = t; vita.step(w2); }
  assert.equal(w2.vita.reserva, VITA.MAXIMO);
  assert.equal(w2.vita.total.asignado, VITA.MAXIMO, "sin gastar no se acuña más");
});

test("cubre los gastos de una colonia con el tesoro vacío una vez al día", () => {
  const w = core.createWorld(0), col = genesis(w);
  col.energia = 5000; col.treasury = 0; w.tick = 1;
  vita.step(w); vita.step(w);
  assert.equal(col.treasury, VITA.GASTOS);
  assert.equal(w.vita.hoy.gastos, VITA.GASTOS);
  col.treasury = 0; w.tick = 144; vita.step(w);
  assert.equal(col.treasury, VITA.GASTOS, "al día siguiente vuelve a cubrirlos");
  assert.equal(w.vita.total.gastos, 2 * VITA.GASTOS);
});

test("las colonias extintas no reciben nada y la reserva sobrevive a guardar y cargar el mundo", () => {
  const w = core.createWorld(0), col = genesis(w);
  col.alive = false; col.energia = 0; col.treasury = 0; w.tick = 1;
  vita.step(w);
  assert.equal(w.vita.hoy.raciones, 0); assert.equal(w.vita.hoy.gastos, 0);
  const back = JSON.parse(JSON.stringify(w));
  back.colonies[col.id].alive = true; back.tick = 2;
  vita.step(back);
  assert.equal(back.vita.hoy.raciones, 1);
  assert.equal(back.vita.reserva, VITA.DIARIO - VITA.RACION - VITA.GASTOS);
});
