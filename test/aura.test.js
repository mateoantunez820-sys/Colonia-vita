import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as aura from "../src/aura.js";

const DIA = 86400000, T0 = Date.UTC(2026, 8, 29, 9);
const ok = r => { assert.equal(r.ok, true, r.error); return r; };
function mundo() {
  const w = core.createWorld(T0), u = core.createUser(w, "Vita Max", "x");
  return { w, u, col: w.colonies["COL-001"] };
}

test("contar cómo te levantaste da 2 VIT y energía a la colonia, lo mismo con cualquier ánimo, una vez al día", () => {
  for (const k of Object.keys(aura.AURAS)) {
    const { w, u, col } = mundo(), vit = u.vit, e = col.energia;
    const r = ok(aura.elegir(w, u, k, col, T0));
    assert.equal(u.vit, vit + aura.AURA.VIT); assert.equal(col.energia, e + aura.AURA.ENERGIA);
    assert.ok(aura.AURAS[k].frases.includes(r.texto));
    const otro = k === "calma" ? "radiante" : "calma";
    assert.equal(ok(aura.elegir(w, u, otro, col, T0 + 3600000)).cambio, true, "se puede cambiar el mismo día");
    assert.equal(u.vit, vit + aura.AURA.VIT, "cambiarla no da más VIT"); assert.equal(col.energia, e + aura.AURA.ENERGIA);
    assert.equal(aura.view(w, u, T0).hoy.k, otro);
    assert.equal(aura.elegir(w, u, otro, col, T0).ok, false);
  }
  const { w, u } = mundo();
  assert.equal(aura.elegir(w, u, "furia", null, T0).ok, false);
  assert.equal(aura.view(w, null), null);
  assert.equal(aura.view(w, u, T0).hoy, null);
});

test("con el ánimo bajo VITA cuida y recuerda la Línea Vida, y la bitácora pública no dice cómo se siente nadie", () => {
  const { w, u, col } = mundo();
  ok(aura.elegir(w, u, "bajo", col, T0));
  const v = aura.view(w, u, T0);
  assert.match(v.hoy.ayuda, /0800 0767/); assert.equal(v.hoy.col, "COL-001");
  assert.ok(!/bajo|ánimo|aura (radiante|en calma)/i.test(col.log[0]) && col.log[0].includes("ilumina"));
  const w2 = mundo();
  ok(aura.elegir(w2.w, w2.u, "radiante", w2.col, T0));
  assert.equal(aura.view(w2.w, w2.u, T0).hoy.ayuda, null);
});

test("racha de días seguidos, historial de dos semanas y 5 VIT más cada 7 días", () => {
  const { w, u, col } = mundo(), ks = Object.keys(aura.AURAS);
  for (let d = 0; d < 7; d++) {
    const r = ok(aura.elegir(w, u, ks[d % ks.length], col, T0 + d * DIA));
    assert.equal(r.racha, d + 1); assert.equal(r.semana, d === 6 ? aura.AURA.SEMANA_VIT : 0);
  }
  assert.equal(aura.view(w, u, T0 + 7 * DIA).racha, 7, "ayer contó: la racha sigue viva");
  assert.equal(aura.view(w, u, T0 + 8 * DIA).racha, 0, "un día sin aura corta la racha");
  assert.equal(ok(aura.elegir(w, u, "calma", col, T0 + 8 * DIA)).racha, 1);
  for (let d = 9; d < 30; d++) ok(aura.elegir(w, u, "energia", col, T0 + d * DIA));
  assert.equal(aura.view(w, u, T0 + 29 * DIA).hist.length, aura.AURA.HIST);
});
