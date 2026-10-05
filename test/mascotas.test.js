import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as m from "../src/mascotas.js";
import * as ret from "../src/retention.js";
import { rng } from "../src/ecomundo.js";

const T0 = Date.UTC(2026, 9, 4, 9);
const env = () => ({ weather: null, attention: 0, difficulty: 1 });
const ok = r => { assert.equal(r.ok, true, r.error); return r; };
const ko = (r, texto) => { assert.equal(r.ok, false); if (texto) assert.match(r.error, texto); return r; };
const genesis = w => w.colonies["COL-001"];
// Todas las células de la colonia con la misma especie de mascota y el mismo lazo
const todas = (col, e, v = 100) => { for (const c of col.cells) Object.assign(c.m, { e, v }); };
// Con un azar fijo, también el de Math.random (los genes y la vida de cada célula nueva): las pruebas no fallan a veces
function conAzar(semilla, fn) { const orig = Math.random; Math.random = rng(semilla); try { return fn(); } finally { Math.random = orig; } }
const mundo = (semilla = "mundo") => conAzar(semilla, () => core.createWorld(T0));
const corre = (w, n, semilla = "mismo-camino") => conAzar(semilla, () => { for (let i = 0; i < n; i++) core.stepWorld(w, env); });

test("cada célula de la federación recibe su mascota al llegar las mascotas, y siempre la misma", () => {
  const w = mundo(), copia = structuredClone(w), col = genesis(w);
  m.ensure(w); m.ensure(copia);
  assert.equal(col.cells.length, 40);
  for (const c of col.cells) {
    assert.ok(m.CLAVES.includes(c.m.e) && /^[0-9a-f]{8}$/.test(c.m.s), "cada una con su especie y su semilla");
    assert.deepEqual([c.m.v, c.m.k], [m.MASCOTAS.NACE, 1]);
    assert.ok(m.nombre(c.m).length >= 4);
  }
  assert.deepEqual(genesis(copia).cells.map(c => c.m), col.cells.map(c => c.m), "el mismo mundo da las mismas mascotas");
  assert.equal(new Set(col.cells.map(c => c.m.s)).size, 40, "ninguna es igual a otra");
  assert.match(w.log[0], /Llegan las mascotas de VITA: cada una de las 40 células/);
  const antes = structuredClone(col.cells.map(c => c.m)), lineas = w.log.length;
  m.ensure(w);
  assert.deepEqual(col.cells.map(c => c.m), antes, "volver a llamarlo no cambia nada");
  assert.equal(w.log.length, lineas);
});

test("los nombres se leen bien y nunca salen palabras feas; las frases concuerdan con cada especie", () => {
  for (let i = 0; i < 400; i++) {
    const n = m.nombreDe(core.hash("nombre:" + i).slice(0, 8));
    assert.match(n, /^[A-ZÑ][a-zñ]{3,8}$/);
    assert.ok(!/pito|pija|puto|puta|culo|caca|pene|teta|pedo|mierda|tonto/.test(n.toLowerCase()), n);
  }
  assert.equal(m.quien({ e: "guardia", s: "00000000", n: "Pipo" }), "el erizo Pipo");
  assert.equal(m.quien({ e: "luz", s: "00000000", n: "Lumi" }), "la luciérnaga Lumi");
  assert.equal(m.nivelNombre(1, "luz"), "Amigas"); assert.equal(m.nivelNombre(1, "ciclo"), "Amigos");
  assert.equal(m.nivelNombre(4, "guardia"), "Almas gemelas");
});

test("las hijas reciben la cría de la mascota de su madre, con más lazo si la madre y la suya eran inseparables", () => {
  const w = mundo(), col = genesis(w);
  m.ensure(w);
  for (const c of col.cells) c.m.v = 75; // inseparables
  const parejas = [], fuera = core.onCellBorn((w2, col2, hija, madre) => parejas.push([hija.m?.e, madre.m.e, hija.m?.v, hija.m?.k, m.nivelDe(madre.m.v)]));
  try {
    Object.assign(col, { energia: 180, salud: 95, popF: 0 });
    col.plan = 99; core.setAlloc(col, [40, 10, 50, 0]);
    corre(w, 60, "hijas");
  } finally { fuera(); }
  assert.ok(parejas.length >= 10, `nacieron ${parejas.length}`);
  assert.ok(parejas.every(([e, , v, k]) => m.CLAVES.includes(e) && k === 1), "ninguna célula nace sin mascota");
  const iguales = parejas.filter(([e, madre]) => e === madre).length;
  assert.ok(iguales >= parejas.length * 0.7, "casi todas son de la especie de la mascota de su madre");
  const deInseparables = parejas.filter(p => p[4] >= 3);
  assert.ok(deInseparables.length >= 5);
  assert.ok(deInseparables.every(([, , v]) => v === 2 * m.MASCOTAS.NACE), "con una madre inseparable de la suya, nacen con el lazo doble");
  assert.ok(parejas.filter(p => p[4] < 3).every(([, , v]) => v === m.MASCOTAS.NACE));
  assert.equal(w.mascotas.stats.nacidas, 40 + parejas.length);
});

test("cuando una célula se va, su mascota espera en el refugio a una recién nacida, y si espera mucho se va libre a Oruz", () => {
  const w = mundo(), col = genesis(w), M = m.ensure(w);
  const van = col.cells.slice(0, 3);
  for (const c of van) c.life = -1;
  core.stepColony(w, col, env(), rng("adios"));
  const ref = M.refugio[col.id];
  assert.deepEqual(ref.map(o => o.s).sort(), van.map(c => c.m.s).sort(), "esperan las tres");
  assert.ok(ref.every(o => o.k === 1 && o.col === col.id && o.g.length === 3 && van.some(c => c.id === o.c)));
  // Las recién nacidas adoptan a las que esperan
  Object.assign(col, { energia: 180, salud: 95 }); col.plan = 99; core.setAlloc(col, [40, 10, 50, 0]);
  corre(w, 80, "adopciones");
  assert.ok(M.stats.adopciones >= 1, "alguna recién nacida adopta");
  const adoptada = col.cells.find(c => c.m.k === 2);
  assert.ok(adoptada, "la adoptada ya acompañó a una célula antes");
  assert.ok(M.cronica[col.id].some(l => /acaba de nacer y adopta (al|a la) /.test(l.txt)));
  // El refugio tiene sitio para 12: las demás se van a vivir libres
  for (const c of col.cells.slice(0, 20)) c.life = -1;
  const libres = M.stats.libres;
  core.stepColony(w, col, env(), rng("muchas"));
  assert.equal(M.refugio[col.id].length, m.MASCOTAS.REFUGIO);
  assert.ok(M.stats.libres > libres);
  // Y las que esperan más de 3 días también
  w.tick += m.MASCOTAS.ESPERA + 1; m.step(w);
  assert.equal(M.refugio[col.id].length, 0);
});

test("la mascota de la célula de un jugador espera en su hogar a la próxima célula de su familia", () => {
  const w = mundo(), col = genesis(w), M = m.ensure(w);
  const u = core.createUser(w, "Mateo", core.hash("mateo")); u.vit = 100;
  const c = col.cells[0], mascota = { ...c.m };
  ok(core.adopt(w, col, c.id, u));
  c.life = -1;
  core.stepColony(w, col, env(), rng("hogar"));
  assert.deepEqual(u.mascotasHogar.map(o => o.s), [mascota.s], "no va al refugio: espera en casa");
  assert.equal(m.view(w, u).mias.hogar[0].nombre, m.nombre(mascota));
  // Su próxima célula (un premio, un legado o una hija) la recibe
  const nueva = core.newCell(w, col, { ef: 7, res: 6, fer: 6 }, u.id);
  col.cells.push(nueva); m.step(w);
  assert.equal(nueva.m.s, mascota.s); assert.equal(nueva.m.k, 2);
  assert.equal(M.stats.reencuentros, 1);
  assert.equal(u.mascotasHogar.length, 0);
  assert.match(M.cronica[col.id][0].txt, /^(El|La) .+ que esperaba en el hogar de Mateo, ya tiene compañera/);
});

test("el lazo crece cada ciclo, más si se entienden, y cada nivel alarga la vida de la célula", () => {
  assert.equal(m.afinidad({ g: { ef: 15, res: 2, fer: 2 } }, "luz"), 1.4);
  assert.equal(m.afinidad({ g: { ef: 2, res: 15, fer: 2 } }, "luz"), 0.6);
  assert.ok(m.afinidad({ g: { ef: 6, res: 6, fer: 6 } }, "ciclo") > 1.2, "los caracoles, con las equilibradas");
  const w = mundo(), col = genesis(w);
  m.ensure(w);
  const [a, b, c] = col.cells;
  Object.assign(a.g, { ef: 15, res: 2, fer: 2 }); Object.assign(a.m, { e: "luz", v: 30 });
  Object.assign(b.g, { ef: 2, res: 15, fer: 2 }); Object.assign(b.m, { e: "luz", v: 30 });
  Object.assign(c.m, { v: 19.99 });
  const vida = c.life;
  m.step(w);
  assert.ok(a.m.v - 30 > 2 * (b.m.v - 30), "la que se entiende crece más del doble");
  assert.equal(m.nivelDe(c.m.v), 1); assert.equal(c.life, vida + m.NIVELES[1].vida, "llegar a amigas le da vida");
  for (let i = 0; i < 3000; i++) { w.tick++; m.step(w); }
  assert.ok(col.cells.every(x => x.m.v <= 100));
  assert.equal(a.m.v, 100);
});

test("las luciérnagas alumbran de noche solo cuando a la colonia le falta energía", () => {
  const w = mundo(), col = genesis(w);
  m.ensure(w); todas(col, "luz");
  const N = col.cells.length, tope = 150 + N;
  Object.assign(col, { minuto: 0, energia: 0 }); m.step(w);
  // 40 luciérnagas con el lazo al máximo, sin armonía (una sola especie): 40 × 0,08 × 0,5
  assert.equal(+col.energia.toFixed(3), +(N * m.MASCOTAS.LUZ * 0.5).toFixed(3));
  Object.assign(col, { minuto: 0, energia: 0.3 * tope }); m.step(w);
  assert.equal(col.energia, 0.3 * tope, "con energía de sobra no hace falta");
  Object.assign(col, { minuto: 720, energia: 0 }); m.step(w);
  assert.equal(col.energia, 0, "a mediodía hay sol");
  assert.ok(m.colonia(w, col).especies.find(x => x.k === "luz").dia > 0, "se ve lo que dieron");
});

test("los erizos curan durante una plaga, los caracoles reciclan a las que se van y la armonía multiplica lo que dan", () => {
  const w = mundo(), col = genesis(w), M = m.ensure(w), N = col.cells.length;
  todas(col, "guardia");
  Object.assign(col, { event: "plaga", eventLeft: 10, salud: 50, minuto: 720 }); m.step(w);
  assert.equal(+col.salud.toFixed(4), +(50 + N * m.MASCOTAS.GUARDIA * 0.5).toFixed(4));
  todas(col, "ciclo");
  Object.assign(col, { event: null, energia: 0, minuto: 720 }); M.muertes[col.id] = 10; m.step(w);
  assert.equal(+col.energia.toFixed(3), 10 * m.MASCOTAS.CICLO * 0.5);
  assert.equal(M.muertes[col.id], 0);
  // Armonía
  assert.equal(m.armonia({ luz: 10, polen: 10, guardia: 10, ciclo: 10 }), 1);
  assert.equal(m.armonia({ luz: 40 }), 0);
  col.cells.forEach((c, i) => Object.assign(c.m, { e: m.CLAVES[i % 4], v: 100 }));
  Object.assign(col, { energia: 0, minuto: 0 }); m.step(w);
  assert.equal(+col.energia.toFixed(3), +(N / 4 * m.MASCOTAS.LUZ).toFixed(3), "en armonía, diez luciérnagas dan lo que daban veinte");
});

test("el jugador da a sus mascotas una ronda de mimos al día y premios que queman VIT, y les pone nombre", () => {
  const w = mundo(), col = genesis(w), M = m.ensure(w);
  const u = core.createUser(w, "Ana", core.hash("ana")), otro = core.createUser(w, "Luis", core.hash("luis"));
  ko(m.mimos(w, u), /Todavía no tienes mascotas/);
  u.vit = 50;
  const [c1, c2] = col.cells;
  ok(core.adopt(w, col, c1.id, u)); ok(core.adopt(w, col, c2.id, u));
  c1.m.v = 10; c2.m.v = 18;
  const r = ok(m.mimos(w, u));
  assert.deepEqual([r.n, r.suben], [2, 1]);
  assert.deepEqual([c1.m.v, c2.m.v], [16, 24]);
  ko(m.mimos(w, u), /Ya les diste/);
  const vit = u.vit, quemado = w.supply.burned;
  const p = ok(m.action(w, u, { op: "premio", cell: c2.id }));
  assert.equal(p.lazo, 34); assert.equal(p.quedan, 2);
  assert.equal(u.vit, vit - 1); assert.equal(w.supply.burned, quemado + 1);
  assert.ok(w.chain.some(b => b.tipo === "quema" && b.a === "premio de mascota"));
  ok(m.action(w, u, { op: "premio", cell: c2.id })); ok(m.action(w, u, { op: "premio", cell: c2.id }));
  ko(m.action(w, u, { op: "premio", cell: c1.id }), /Hoy ya diste 3 premios/);
  assert.equal(M.stats.premios, 3); assert.equal(M.stats.vitQuemado, 3);
  ko(m.action(w, otro, { op: "premio", cell: c1.id }), /no es tuya/);
  assert.equal(ok(m.action(w, u, { op: "nombre", cell: c1.id, nombre: "<b>Lumi</b>" })).nombre, "bLumi/b");
  assert.equal(m.nombre(c1.m), "bLumi/b");
  ko(m.action(w, u, { op: "nombre", cell: c1.id, nombre: "x" }), /2 letras/);
  ko(m.action(w, u, { op: "volar", cell: c1.id }), /no entiende/);
  // Al día siguiente vuelven los mimos y los premios
  core.checkDay(w, u, new Date(T0 + 86400000));
  ok(m.mimos(w, u)); ok(m.action(w, u, { op: "premio", cell: c1.id }));
  const v = m.view(w, u).mias;
  assert.equal(v.n, 2); assert.equal(v.mimos, true); assert.equal(v.premios, 2);
  assert.equal(v.lista[0].cell, c2.id, "primero la más unida");
});

test("los hábitos de «Salud real» y las visitas de su cría también alegran a sus mascotas", () => {
  const w = mundo(), col = genesis(w);
  m.ensure(w);
  const u = core.createUser(w, "Mateo", core.hash("mateo")); u.vit = 50;
  assert.equal(m.habito(w, u), null, "sin mascotas no pasa nada");
  const c = col.cells[0];
  ok(core.adopt(w, col, c.id, u)); c.m.v = 10;
  assert.deepEqual(m.habito(w, u), { n: 1, suben: 0 });
  assert.equal(c.m.v, 10 + m.MASCOTAS.HABITO);
  u.cria = { etapa: 3, hogar: col.id, diario: [] };
  const jugo = m.conCria(w, u, { op: "saludar" }, { ok: true, visita: { colonia: col.name, energia: 10 } });
  assert.deepEqual(jugo, { jugo: 1, colonia: col.name });
  assert.equal(c.m.v, 10 + m.MASCOTAS.HABITO + m.MASCOTAS.CRIA);
  assert.match(u.cria.diario[0].txt, /^En Génesis jugué con .+, la mascota de tu célula\.$/);
  const conocio = m.conCria(w, u, { op: "volver" }, { ok: true, relato: { colonia: col.name } });
  assert.ok(conocio.conocio.nombre);
  assert.match(u.cria.diario[0].txt, /^En Génesis conocí (al|a la) /);
  assert.equal(m.conCria(w, u, { op: "saludar" }, { ok: false }), null);
});

test("si se apagan todas las colonias, las mascotas que esperan despiertan a una generación nueva con los genes de sus células", () => {
  const w = mundo(), col = genesis(w), M = m.ensure(w);
  for (const c of col.cells) c.life = -1;
  core.stepColony(w, col, env(), rng("apagón"));
  assert.equal(col.alive, false);
  const esperan = structuredClone(M.refugio[col.id]);
  assert.equal(esperan.length, m.MASCOTAS.REFUGIO);
  let ciclos = 0;
  while (!col.alive && ciclos < 100) { w.tick++; m.step(w); ciclos++; }
  assert.equal(ciclos, m.MASCOTAS.RENACE + 1, "esperan unas horas");
  assert.equal(col.cells.length, m.MASCOTAS.RENACE_CELULAS);
  assert.deepEqual([col.energia, col.salud, col.gen, col.gratitud], [80, 85, 2, core.CONFIG.GRATITUDE_TICKS]);
  esperan.forEach((o, i) => {
    const c = col.cells[i];
    assert.equal(c.m.s, o.s); assert.equal(c.m.k, 2);
    assert.ok(["ef", "res", "fer"].every((k, j) => Math.abs(c.g[k] - o.g[j]) <= 1), "con los genes de la célula que acompañaron");
  });
  assert.ok(col.cells.every(c => c.m && c.owner === "colonia"));
  assert.equal(M.refugio[col.id].length, 0);
  assert.equal(M.stats.renacimientos, 1); assert.equal(w.stats.reseeds, 1);
  assert.ok(w.chain.some(b => b.tipo === "renace" && b.a === col.id));
  assert.match(col.log.join(" "), /Renace gracias a sus mascotas/);
  assert.match(w.log.join(" "), /Génesis renace gracias a sus mascotas/);
  assert.ok(core.verifyChain(w));
  // Sigue viviendo como cualquier colonia
  corre(w, 50, "después");
  assert.equal(col.alive, true);
});

test("sin mascotas esperando, vuelven algunas de las que viven libres en Oruz; con una colonia viva no hace falta", () => {
  const w = mundo(), col = genesis(w), M = m.ensure(w);
  const hija = core.createColony(w, { name: "Brisa", genes: { ef: 7, res: 6, fer: 6 }, met: 7, treasury: 0, parent: col.id });
  for (const c of col.cells) c.life = -1;
  core.stepColony(w, col, env(), rng("una"));
  for (let i = 0; i < 100; i++) { w.tick++; m.step(w); }
  assert.equal(col.alive, false, "mientras viva Brisa, la supervisora puede rescatarla");
  assert.equal(M.apagada, null);
  hija.alive = false; hija.cells = []; M.refugio = {};
  for (let i = 0; i < 100 && !col.alive && !hija.alive; i++) { w.tick++; m.step(w); }
  const viva = [col, hija].find(c => c.alive);
  assert.ok(viva);
  assert.ok(viva.cells.every(c => c.m && c.m.k === 1));
  assert.match(M.cronica[viva.id][0].txt, /mascotas libres de Oruz/);
});

test("los ganchos de las mascotas no gastan el azar del ciclo: la federación sigue el mismo camino con ellas", () => {
  const base = mundo(), sin = structuredClone(base), con = structuredClone(base);
  m.ensure(con);
  corre(sin, 900); corre(con, 900);
  const nucleo = w => JSON.stringify(Object.values(w.colonies).map(({ log, ...c }) => ({ ...c, cells: c.cells.map(({ m: _, ...x }) => x) })));
  assert.equal(nucleo(con), nucleo(sin));
  assert.ok(con.stats.births > 20 && con.stats.deaths > 0, "nacieron y murieron células");
  assert.ok(Object.values(con.colonies).every(c => c.cells.every(x => x.m)));
  const st = con.mascotas.stats;
  assert.equal(st.nacidas + st.adopciones, 40 + con.stats.births, "cada célula nueva, con una mascota nueva o adoptada");
  assert.ok(st.adopciones > 0);
});

test("la copia firmada guarda la mascota de cada célula, con su nombre y su lazo, y las que esperan en el hogar", () => {
  const w = mundo(), col = genesis(w);
  m.ensure(w);
  const u = core.createUser(w, "Ana", core.hash("ana")); u.vit = 60;
  const [c1, c2, c3] = col.cells;
  for (const c of [c1, c2, c3]) ok(core.adopt(w, col, c.id, u));
  Object.assign(c1.m, { v: 93.5, n: "Lumi", k: 3 });
  c3.life = -1; core.stepColony(w, col, env(), rng("copia"));
  assert.equal(u.mascotasHogar.length, 1);
  w.tick += 300;
  const save = ret.makeSave(w, u, "clave");
  const w2 = core.createWorld(T0 + 1); m.ensure(w2);
  const r = ok(ret.restoreSave(w2, save, "clave"));
  const v = w2.users[r.user.id];
  const mias = genesis(w2).cells.filter(c => c.owner === v.id);
  assert.equal(r.cells, 2);
  const lumi = mias.find(c => c.m.n === "Lumi");
  assert.ok(lumi, "vuelve con su nombre");
  assert.deepEqual([lumi.m.e, lumi.m.s, lumi.m.v, lumi.m.k], [c1.m.e, c1.m.s, 93.5, 3]);
  assert.ok(mias.some(c => c.m.s === c2.m.s));
  assert.equal(v.mascotasHogar.length, 1);
  assert.equal(v.mascotasHogar[0].t, w2.tick, "en el mundo nuevo empieza a esperar de nuevo");
  assert.equal(m.view(w2, v).mias.hogar[0].horas, 0);
  // Una copia de antes de las mascotas también vale: sus células reciben una al llegar
  const c = core.newCell(w2, genesis(w2), { ef: 7, res: 6, fer: 6 }, v.id);
  assert.equal(m.restaurar(w2, c, null), false);
  assert.equal(m.restaurar(w2, c, ["constructor", "zz", 50, 1, 0, ""]), false, "solo especies que existen");
});

test("las vistas resumen la federación y dibujan cada mascota junto a su célula", () => {
  const w = mundo(), col = genesis(w);
  assert.equal(m.view(w, null), null); assert.equal(m.colonia(w, col), null); assert.equal(m.metrics(w), null);
  m.ensure(w);
  const v = m.view(w, null);
  assert.equal(v.total, 40); assert.equal(v.mias, null);
  assert.equal(Object.values(v.porEspecie).reduce((a, b) => a + b, 0), 40);
  assert.ok(v.armonia > 0 && v.armonia <= 1);
  assert.deepEqual(Object.keys(v.especies), m.CLAVES);
  const d = m.colonia(w, col, null);
  assert.equal(d.puntos.length, col.cells.length);
  d.puntos.forEach(([e, nivel], i) => { assert.equal(m.CLAVES[e], col.cells[i].m.e); assert.equal(nivel, m.nivelDe(col.cells[i].m.v)); });
  assert.equal(d.top.length, 3); assert.equal(d.especies.length, 4); assert.deepEqual(d.mias, []);
  const met = m.metrics(w);
  assert.equal(met.total, 40); assert.equal(met.almasVivas, 0); assert.equal(met.enHogares, 0); assert.equal(met.nacidas, 40);
  // Ninguna vista rompe el mundo, aunque los datos estén mal
  col.cells[0].m = { e: "luz" };
  assert.doesNotThrow(() => { m.view(w, null); m.colonia(w, col, null); });
});
