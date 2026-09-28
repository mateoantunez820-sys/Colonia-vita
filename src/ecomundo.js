// Motor común de los ecomundos de VITA (Oruz y Lumar).
// Siete regiones en hexágonos que nacen de una semilla, cuatro especies que dependen unas de otras
// y una materia preciosa (la resina del Ámbar, el nácar de las perlas) que solo se forma donde las
// cuatro viven a la vez. Cada mundo pone sus biomas, su luz y su calendario; aquí no hay E/S.
import { hash, verifyChain } from "./core.js";

// Las cuatro especies ocupan siempre los mismos puestos: productora, simbionte, depredadora y recicladora
export const ESPECIES = ["flora", "poli", "depre", "reci"];
const RING = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const r3 = x => Math.round(x * 1000) / 1000;

// Generador pseudoaleatorio con semilla (mulberry32): el mismo mundo sale siempre igual
export function rng(seed) {
  let a = parseInt(hash(String(seed)).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- el mapa ----------
// Una región en el centro y seis alrededor; cada una es vecina del centro y de sus dos lados.
// `inicio(R)` añade los campos propios de cada mundo (su materia, su clima); `valido` descarta nombres feos.
export function crearRegiones(r, { centro, tipos, silabas, biomas, inicio, valido = () => true }) {
  const used = new Set();
  const name = () => {
    let n;
    do n = Array.from({ length: r() < 0.4 ? 3 : 2 }, () => silabas[Math.floor(r() * silabas.length)]).join("");
    while (used.has(n) || n.length < 4 || !valido(n));
    used.add(n);
    return n[0].toUpperCase() + n.slice(1);
  };
  const kinds = shuffle([...tipos], r);
  const regions = [{ id: "R0", name: name(), bioma: centro, q: 0, r: 0 }, ...RING.map(([q, rr], i) => ({ id: "R" + (i + 1), name: name(), bioma: kinds[i], q, r: rr }))];
  for (const [i, R] of regions.entries()) {
    const B = biomas[R.bioma];
    R.vecinos = i === 0 ? regions.slice(1).map(x => x.id) : ["R0", "R" + ((i + 4) % 6 + 1), "R" + (i % 6 + 1)];
    Object.assign(R, { suelo: 55, flora: r3(45 * B.fert), poli: 20, depre: 6, reci: 15 }, inicio(R, B));
  }
  return regions;
}
export const regionDe = (m, id) => m.regions.find(R => R.id === id) || m.regions[0];

// ---------- las cuatro especies ----------
// Un ciclo de una región. `agua` es la lluvia en Oruz y las corrientes en Lumar.
// `alumnas` son los puestos que refuerzan las colonias que estudian allí.
export function pasoPoblaciones(R, { luz, agua, frio, fert }, alumnas = []) {
  let { flora: F, poli: P, depre: D, reci: X, suelo: N } = R;
  // Productora: crece con luz, agua y suelo, y la simbionte la ayuda
  const gF = 0.1 * F * (1 - F / 100) * luz * (N / (N + 30)) * (0.35 + 0.65 * agua) * fert * (1 + 0.5 * P / 80) * (1 - 0.7 * frio);
  const mF = F * 0.004 * (1 + 1.5 * frio);
  // Simbionte y depredadora: presa y cazador, con ciclos que suben y bajan
  const eat = 0.05 * P * D / (P + 20);
  const gP = 0.06 * P * (F / (F + 40)) * (1 - P / 80), mP = P * 0.004 * (1 + frio);
  const gD = 0.35 * eat, mD = D * 0.01 * (1 + 0.5 * frio);
  // Lo que muere alimenta a la recicladora, que devuelve nutrientes al suelo
  const dead = mF + mP + mD + eat * 0.65;
  const gX = 0.05 * X * (dead / (dead + 2)) * (1 - X / 60), mX = X * 0.006;
  F += gF - mF; P += gP - mP - eat; D += gD - mD; X += gX - mX;
  N += dead * 0.5 * (0.3 + X / 40) - gF - N * 0.003 + 0.03 * agua;
  for (const eco of alumnas) {
    if (eco === "flora") F += 0.05; else if (eco === "poli") P += 0.04; else if (eco === "reci") X += 0.04; else if (eco === "depre") D -= 0.02;
  }
  Object.assign(R, { flora: r3(clamp(F, 0.5, 100)), poli: r3(clamp(P, 0.5, 100)), depre: r3(clamp(D, 0.5, 100)), reci: r3(clamp(X, 0.5, 100)), suelo: r3(clamp(N, 0, 100)) });
  // La materia preciosa solo se forma donde las cuatro especies están presentes
  R.eq = +Math.min(1, R.flora / 40, R.poli / 20, R.depre / 8, R.reci / 20).toFixed(3);
}
// Materia que forman la productora y la simbionte en un ciclo, antes de los multiplicadores del mundo
export const formacion = R => 0.006 * (R.flora / 100) * (R.poli / 60);

// Migración entre vecinas: ninguna especie desaparece del todo y el mundo se mezcla despacio
export function migrar(regions) {
  const before = new Map(regions.map(R => [R.id, Object.fromEntries(ESPECIES.map(k => [k, R[k]]))]));
  for (const R of regions) for (const k of ESPECIES) {
    const avg = R.vecinos.reduce((s, id) => s + before.get(id)[k], 0) / R.vecinos.length;
    R[k] = r3(clamp(R[k] + 0.003 * (avg - before.get(R.id)[k]), 0.5, 100));
  }
}

// Los fenómenos del cielo cambian de tipo cada `cada` horas y se mueven a una vecina cada 12
export function moverFenomeno(m, r, tipos, cada, alCambiar) {
  const f = m.fenomeno;
  if (m.hora % cada === 0) { const ks = Object.keys(tipos); f.k = ks[Math.floor(r() * ks.length)]; alCambiar?.(f); }
  if (m.hora % 12 === 0) { const R = regionDe(m, f.region); f.region = R.vecinos[Math.floor(r() * R.vecinos.length)]; }
}

// ---------- piezas únicas ----------
// El código sale de la huella de la semilla, el número de pieza, la región, la hora y el último
// bloque de la cadena. De la misma huella sale su tono.
export function nuevaPieza(w, m, { prefijo, serial, store, tonos }, R) {
  const tip = w.chain.length ? w.chain[w.chain.length - 1].hash : "";
  let n, h, id;
  do { n = ++m[serial]; h = hash(`${m.seed}:${n}:${R.id}:${m.hora}:${tip}`); id = prefijo + h.slice(0, 8).toUpperCase(); } while (m[store][id]);
  const v = parseInt(h.slice(8, 12), 16) / 65536;
  return { id, n, tono: tonos.find(([p]) => v < p)[1] };
}
export const libres = store => Object.values(store).filter(p => p.estado === "libre");
// Las piezas libres se disuelven tras `ttl` horas; las gastadas o disueltas más antiguas se olvidan
export function limpiarPiezas(m, store, { ttl, guardar, gastadas }, alDisolver) {
  for (const p of libres(store)) if (m.hora - p.hora > ttl) { p.estado = "disuelta"; alDisolver?.(p); }
  const gone = Object.values(store).filter(p => gastadas.includes(p.estado));
  if (gone.length > guardar) for (const p of gone.sort((a, b) => a.n - b.n).slice(0, gone.length - guardar)) delete store[p.id];
}
// Certificado de origen: la pieza, su bloque de nacimiento y todos sus movimientos en la cadena
export function certificado(w, p, vista) {
  const moves = w.chain.filter(b => b.ids?.includes(p.id)).map(b => ({ n: b.n, tipo: b.tipo, de: b.de, a: b.a, hash: b.hash, t: b.t }));
  return { ...vista(p), movimientos: moves, cadenaOk: verifyChain(w) };
}
