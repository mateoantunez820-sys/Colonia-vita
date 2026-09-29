import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as oruz from "../src/oruz.js";
import * as lumar from "../src/lumar.js";
import * as cenit from "../src/cenit.js";
import * as aero from "../src/aeropuerto.js";
import * as ret from "../src/retention.js";

const T0 = Date.UTC(2026, 8, 28, 10); // lunes 28 de septiembre de 2026, 10:00 UTC
const MIN10 = 600000;

// Un mundo con sus tres ecomundos y el aeropuerto abierto. Los fenómenos quedan lejos de los puertos
// para que ninguna nave salga con retraso salvo cuando la prueba lo pide.
function mundo(seed = "aero") {
  const w = core.createWorld(T0);
  oruz.ensure(w, seed); lumar.ensure(w, seed, T0); cenit.ensure(w, seed, T0); aero.ensure(w);
  for (const k of ["oruz", "lumar", "cenit"]) w[k].fenomeno.region = w[k].regions[1].id;
  return w;
}
// Un ciclo: las colonias vivas envejecen y el aeropuerto mueve sus naves (sin exploradoras)
function ciclo(w, weather = null) {
  w.tick++;
  for (const c of Object.values(w.colonies)) if (c.alive) c.edad++;
  aero.step(w, { weather }, () => 1);
}
// Un jugador con `n` células adoptadas en Génesis
function jugador(w, name, vit = 100, n = 3) {
  const u = core.createUser(w, name, "h-" + name), col = Object.values(w.colonies)[0];
  u.vit = 1000;
  const ids = col.cells.filter(c => c.owner === "colonia").slice(0, n).map(c => c.id);
  for (const id of ids) assert.equal(core.adopt(w, col, id, u).ok, true);
  u.vit = vit;
  return { u, col, ids };
}
// Manda una célula de viaje y espera a que vuelva
function viajar(w, u, id, dest) {
  const r = aero.reservar(w, u, id, dest);
  assert.equal(r.ok, true, r.error);
  for (let i = 0; i < 120 && aero.viajesDe(w, u.id).some(v => v.cel.id === id); i++) ciclo(w);
  assert.ok(!aero.viajesDe(w, u.id).some(v => v.cel.id === id), "la célula volvió");
  return w.aeropuerto.recientes[0];
}
const buscar = (w, id) => Object.values(w.colonies).flatMap(c => c.cells).find(c => c.id === id);

test("un billete: solo para tus células, se paga en VIT que se quema y respeta los límites del pasaporte", () => {
  const w = mundo(), { u, col, ids } = jugador(w, "Ana", 100, 5), leo = jugador(w, "Leo", 100, 2);
  const burned = w.supply.burned, minted = w.supply.minted;
  const ajena = col.cells.find(c => c.owner === "colonia").id;
  assert.equal(aero.reservar(w, u, ajena, "LMR").ok, false, "no puede mandar células que no son suyas");
  assert.equal(aero.reservar(w, u, ids[0], "MARTE").ok, false);
  const r = aero.reservar(w, u, ids[0], "LMR");
  assert.equal(r.ok, true, r.error);
  assert.equal(u.vit, 100 - aero.MUNDOS.LMR.tarifa);
  assert.equal(w.supply.burned - burned, aero.MUNDOS.LMR.tarifa, "el billete se quema");
  assert.ok(!col.cells.some(c => c.id === ids[0]), "la célula deja su colonia mientras viaja");
  assert.equal(r.viaje.fase, "terminal");
  assert.ok(r.sale >= 1 && r.sale <= aero.AERO.CADA);
  assert.match(r.num, /^VG \d+$/);
  assert.equal(aero.reservar(w, u, ids[0], "ORZ").ok, false, "ya está de viaje");
  assert.equal(aero.reservar(w, u, ids[1], "ORZ").ok, true);
  assert.equal(aero.reservar(w, u, ids[2], "CEN").ok, true);
  const lleno = aero.reservar(w, u, ids[3], "ORZ");
  assert.equal(lleno.ok, false); assert.match(lleno.error, /células de viaje/);
  // Con más millas el pasaporte sube de nivel: una plaza y un billete más al día
  aero.pasaporte(u).millas = 1000;
  assert.equal(aero.nivel(u).name, "Viajero");
  assert.deepEqual([aero.plazas(u), aero.porDia(u)], [aero.AERO.PLAZAS_JUGADOR + 1, aero.AERO.POR_DIA + 1]);
  assert.equal(aero.reservar(w, u, ids[3], "ORZ").ok, true);
  assert.equal(aero.celulasDeViaje(w, u.id).length, 4);
  // Los billetes del día y el VIT también se acaban
  leo.u.daily.vuelos = aero.porDia(leo.u);
  assert.match(aero.reservar(w, leo.u, leo.ids[0], "ORZ").error, /billetes/);
  leo.u.daily.vuelos = 0; leo.u.vit = 3;
  assert.match(aero.reservar(w, leo.u, leo.ids[0], "CEN").error, /cuesta/);
  assert.equal(leo.u.vit, 3);
  assert.equal(w.chain.filter(b => b.tipo === "billete").length, 4);
  assert.equal(w.supply.minted, minted, "viajar no crea VIT");
  assert.ok(core.verifyChain(w));
});

test("una célula vuela, explora, aprende una sola vez por mundo, no envejece y vuelve a su colonia", () => {
  const w = mundo(), { u, col, ids: [id] } = jugador(w, "Ana", 100, 1);
  const cel = buscar(w, id);
  cel.g = { ef: 15, res: 8, fer: 10 };
  for (let i = 0; i < 30; i++) ciclo(w);
  const edad = col.edad - cel.born, vida = cel.life;

  const r = aero.reservar(w, u, id, "LMR");
  const fases = ["terminal"];
  for (let i = 0; i < 120 && aero.viajesDe(w, u.id).length; i++) {
    ciclo(w);
    const v = aero.viajesDe(w, u.id)[0];
    if (v && fases.at(-1) !== v.fase) fases.push(v.fase);
    if (v?.fase === "explorando") assert.ok(v.region?.name, "explora una región de Lumar");
  }
  assert.deepEqual(fases.filter(f => f !== "espera"), ["terminal", "ida", "explorando", "vuelta"]);
  assert.ok(col.cells.includes(cel), "vuelve a su colonia");
  assert.deepEqual(cel.sellos, ["LMR"]);
  assert.equal(cel.g.fer, 11, "Lumar le enseña fertilidad");
  assert.equal(col.edad - cel.born, edad, "no envejeció durante el viaje");
  const P = aero.pasaporte(u);
  assert.deepEqual([P.viajes, P.millas, P.sellos.LMR], [1, aero.MUNDOS.LMR.millas, 1]);
  assert.deepEqual(w.aeropuerto.recientes[0], { ...w.aeropuerto.recientes[0], cel: id, dest: "LMR", gano: "fer", millas: aero.MUNDOS.LMR.millas, col: col.name });
  assert.ok(w.aeropuerto.recientes[0].tick > 30);
  assert.equal(r.num.startsWith("VG 2"), true, "los vuelos a Lumar son la serie 200");

  // La segunda vez en Lumar ya no aprende nada, pero suma sello y millas
  const otra = viajar(w, u, id, "LMR");
  assert.equal(otra.gano, null);
  assert.equal(cel.g.fer, 11);
  assert.deepEqual(cel.sellos, ["LMR"]);
  assert.equal(aero.pasaporte(u).sellos.LMR, 2);
  // Oruz enseña resistencia, que también alarga la vida
  assert.equal(viajar(w, u, id, "ORZ").gano, "res");
  assert.deepEqual([cel.g.res, cel.life], [9, vida + 24]);
  // Con un gen al máximo no aprende más, pero se lleva el sello
  u.daily.vuelos = 0;
  assert.equal(viajar(w, u, id, "CEN").gano, null);
  assert.equal(cel.g.ef, 15);
  assert.deepEqual(cel.sellos, ["LMR", "ORZ", "CEN"]);
  assert.equal(cel.viajes, 4);
  assert.equal(col.edad - cel.born, edad, "cuatro viajes y sigue igual de joven");

  // Su pasaporte y sus vuelos quedan en la cadena
  const tipos = w.chain.filter(b => b.ids?.includes(id) && ["billete", "despegue", "aterrizaje"].includes(b.tipo)).map(b => b.tipo);
  assert.deepEqual(tipos.slice(0, 5), ["billete", "despegue", "aterrizaje", "despegue", "aterrizaje"]);
  const pas = aero.pasaporteCelula(w, id);
  assert.deepEqual(pas.sellos, ["Lumar", "Oruz", "Cénit"]);
  assert.equal(pas.viajes, 4); assert.equal(pas.dueno, "Ana"); assert.equal(pas.donde, `En ${col.name}`);
  assert.equal(pas.movimientos.length, 20); assert.equal(pas.cadenaOk, true);
  assert.equal(aero.pasaporteCelula(w, "CEL-000000"), null);
  assert.ok(core.verifyChain(w));
});

test("si su colonia ya no existe o está llena, la célula vuelve a otra; si no hay ninguna, espera en la terminal", () => {
  const w = mundo(), { u, col, ids: [id, id2] } = jugador(w, "Ana", 100, 2);
  const brisa = core.createColony(w, { name: "Brisa", genes: { ef: 6, res: 6, fer: 6 }, met: 6, treasury: 0, parent: null });
  aero.reservar(w, u, id, "ORZ");
  for (let i = 0; i < 120 && !["espera", "vuelta"].includes(aero.viajesDe(w, u.id)[0]?.fase); i++) ciclo(w);
  col.alive = false; brisa.alive = false;
  for (let i = 0; i < 20; i++) ciclo(w);
  assert.equal(aero.viajesDe(w, u.id)[0].fase, "sin sitio");
  assert.ok(aero.view(w, u).me.viajes[0].faseName.includes("sitio"));
  brisa.alive = true;
  ciclo(w);
  assert.equal(aero.viajesDe(w, u.id).length, 0);
  assert.ok(brisa.cells.some(c => c.id === id), "vuelve a la colonia viva");
  assert.equal(w.aeropuerto.recientes[0].col, "Brisa");

  // Su colonia está viva pero llena: vuelve a la que tenga sitio
  col.alive = true;
  aero.reservar(w, u, id2, "ORZ");
  while (col.cells.length < core.cap(col)) col.cells.push(core.newCell(w, col, { ef: 5, res: 5, fer: 5 }, "colonia"));
  for (let i = 0; i < 120 && aero.viajesDe(w, u.id).length; i++) ciclo(w);
  assert.ok(brisa.cells.some(c => c.id === id2));
});

test("una tormenta sobre el puerto del otro mundo o el mal tiempo de VITA retrasan las naves", () => {
  const w = mundo();
  w.lumar.fenomeno = { k: "temporal", region: w.lumar.regions[0].id };
  const { u, ids: [id] } = jugador(w, "Ana", 100, 1);
  aero.reservar(w, u, id, "LMR");
  let f;
  for (let i = 0; i < 12 && !f; i++) { ciclo(w); f = Object.values(w.aeropuerto.vuelos).find(x => x.dest === "LMR" && x.ida); }
  assert.equal(f.estado, "retrasado");
  assert.equal(f.motivo, `${lumar.FENOMENOS.temporal.name.toLowerCase()} sobre ${w.lumar.regions[0].name}`);
  assert.ok(f.sale > f.prog && f.sale - f.prog <= 3);
  assert.equal(f.llega, f.sale + aero.MUNDOS.LMR.vuelo);
  assert.equal(aero.view(w, u).me.viajes[0].retraso, f.motivo);
  assert.ok(w.aeropuerto.cronica.some(x => x.txt.includes("retraso")), "la crónica cuenta el retraso de una nave con pasaje");
  for (let i = 0; i < 12; i++) ciclo(w);
  assert.equal(f.estado, "aterrizado");

  const w2 = mundo("lluvia");
  for (let i = 0; i < aero.AERO.CADA; i++) ciclo(w2, { lluvia: 0.2, desc: "tormenta" });
  const vs = Object.values(w2.aeropuerto.vuelos);
  assert.equal(vs.length, 6, "cada hora sale una nave a cada mundo y vuelve otra");
  assert.ok(vs.every(x => x.motivo === "tormenta en VITA"));
  assert.equal(w2.aeropuerto.stats.retrasos, 6);
  assert.equal(w2.aeropuerto.cronica.length, 0, "las naves vacías no llenan la crónica");
});

test("las colonias ricas mandan exploradoras a aprender el gen que les falta, pagadas con su tesoro", () => {
  const rica = seed => {
    const w = mundo(seed), col = Object.values(w.colonies)[0];
    Object.assign(col, { treasury: 1000, salud: 90, edad: 200, event: null });
    col.ai.persona.riesgo = 1;
    for (const c of col.cells) c.g = { ef: 10, res: 10, fer: 3 };
    col.cells[5].g = { ef: 12, res: 12, fer: 3 };
    return { w, col };
  };
  const { w, col } = rica("exploradora"), mejor = col.cells[5].id, burned = w.supply.burned;
  assert.equal(aero.explorar(w, () => 0), 1);
  const [v] = aero.viajesDe(w, "colonia");
  assert.equal(v.dest, "LMR", "le falta fertilidad: va a Lumar");
  assert.equal(v.cel.id, mejor, "manda a su mejor célula");
  assert.equal(col.treasury, 1000 - aero.MUNDOS.LMR.tarifa);
  assert.equal(w.supply.burned - burned, aero.MUNDOS.LMR.tarifa);
  assert.equal(aero.explorar(w, () => 0), 0, "una exploradora a la vez");
  for (let i = 0; i < 120 && aero.viajesDe(w, "colonia").length; i++) ciclo(w);
  assert.equal(buscar(w, mejor).g.fer, 4, "vuelve sabiendo más");
  assert.equal(aero.explorar(w, () => 0), 0, "y no manda otra hasta el día siguiente");
  assert.equal(w.aeropuerto.stats.exploradoras, 1);

  // No viajan las agradecidas, las aprendices de Oruz, las pobres, las que sufren un evento ni las prudentes
  const casos = [
    col => { col.gratitud = 100; }, col => { col.oruz = { estado: "aprendiz" }; }, col => { col.treasury = 100; },
    col => { col.event = "plaga"; col.eventLeft = 5; }, col => { col.salud = 40; },
  ];
  for (const [i, cambio] of casos.entries()) {
    const x = rica("no-" + i); cambio(x.col);
    assert.equal(aero.explorar(x.w, () => 0), 0, `caso ${i}`);
  }
  assert.equal(aero.explorar(rica("prudente").w, () => 0.99), 0, "el azar también decide");
});

test("la copia firmada guarda las células de viaje con sus sellos y las estrellas atrapadas", () => {
  const w = mundo("copia"), KEY = "clave-de-prueba";
  const { u, ids: [id] } = jugador(w, "Ana", 100, 2);
  buscar(w, id).sellos = ["ORZ"];
  aero.reservar(w, u, id, "CEN");
  w.cenit.regions[0].polvo = 1; w.tick++; cenit.step(w, T0 + w.tick * MIN10);
  const est = Object.values(w.cenit.estrellas)[0].id;
  assert.equal(cenit.catchStar(w, u, est).ok, true);
  const save = ret.makeSave(w, u, KEY);

  const w2 = mundo("copia");
  const r = ret.restoreSave(w2, save, KEY);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.cells, r.stars], [2, 1]);
  const mias = Object.values(w2.colonies).flatMap(c => c.cells).filter(c => c.owner === r.user.id);
  assert.equal(mias.length, 2, "la célula que estaba de viaje vuelve a casa");
  assert.deepEqual(mias.map(c => c.sellos || []).sort((a, b) => b.length - a.length)[0], ["ORZ"], "con los sellos de su pasaporte");
  assert.deepEqual(cenit.starsOf(w2, r.user.id).map(p => p.id), [est], "la estrella conserva su código");
  assert.equal(r.user.welcome.estrellas, 1);
  const col = Object.values(w2.colonies)[0];
  assert.equal(cenit.wishStar(w2, r.user, est, col).ok, true, "y todavía puede pedir su deseo");
  assert.ok(core.verifyChain(w2));
});

test("al volver, el jugador ve qué células volvieron de viaje, las estrellas que cayeron y los deseos por sus colonias", () => {
  const w = mundo("regreso"), { u, col, ids: [id] } = jugador(w, "Ana", 100, 1), leo = core.createUser(w, "Leo", "h-leo");
  const ahora = Date.now();
  ret.touch(w, u, ahora);
  buscar(w, id).g.fer = 5;
  viajar(w, u, id, "LMR");
  w.cenit.regions[0].polvo = 1; w.tick++; cenit.step(w, T0 + w.tick * MIN10);
  const e = Object.values(w.cenit.estrellas).at(-1).id;
  assert.equal(cenit.catchStar(w, leo, e).ok, true);
  assert.equal(cenit.wishStar(w, leo, e, col).ok, true);
  ret.touch(w, u, ahora + 3 * 3600000);
  const r = u.welcome;
  assert.deepEqual(r.viajes, [{ cel: id, dest: "LMR", gano: "fer", millas: aero.MUNDOS.LMR.millas }]);
  assert.equal(r.estrellasNuevas, 1);
  assert.deepEqual(r.deseos, [{ por: "Leo", col: col.name }]);
});

test("el tablero muestra las salidas y llegadas en orden, los destinos y el pasaporte del jugador", () => {
  const w = mundo(), { u, ids } = jugador(w, "Ana", 100, 2);
  aero.reservar(w, u, ids[0], "CEN");
  for (let i = 0; i < 9; i++) ciclo(w);
  const g = aero.view(w, null), v = aero.view(w, u);
  assert.equal(g.me, null);
  assert.deepEqual(g.mundos.map(M => M.name), ["Oruz", "Lumar", "Cénit"]);
  assert.ok(g.salidas.length <= 6 && g.llegadas.length <= 6);
  for (const l of [g.salidas.map(f => f.sale), g.llegadas.map(f => f.llega)]) assert.deepEqual(l, [...l].sort((a, b) => a - b));
  for (const D of Object.values(aero.MUNDOS)) assert.ok(g.salidas.some(f => f.dest === D.k), `hay salida a ${D.name}`);
  assert.equal(v.me.viajes.length, 1);
  assert.equal(v.me.viajes[0].destName, "Cénit");
  assert.ok(v.me.viajes[0].en >= 0);
  assert.deepEqual(v.me.celulas.map(c => c.id), [ids[1]], "solo las que están en casa pueden viajar");
  assert.deepEqual([v.me.pasaporte.nivel, v.me.plazas, v.me.porDia, v.me.hoy], ["Pasajero", 3, 3, 1]);
  assert.equal(v.enViaje, 1);
});
