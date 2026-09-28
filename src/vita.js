// Reserva de Vita: VIT del juego que el dueño autorizó para que Vita, la supervisora de la federación,
// alimente a las colonias y les cubra los gastos, sin que los jugadores tengan que hacer nada.
// Cada día de juego recibe una asignación con tope. Es VIT del juego, no dinero real.
// Funciones puras sobre `world`, como core.js: aquí no hay E/S.
import { block, buyNutrients, clog } from "./core.js";

export const VITA = {
  RACION: 15,       // VIT por ración: se queman como nutrientes y dan 15 × 8 = 120 de energía
  DIARIO: 240,      // asignación de cada día de juego (144 ciclos)
  MAXIMO: 480,      // la reserva no guarda más de dos días de asignación
  RACIONES_DIA: 4,  // raciones al día como mucho para cada colonia
  ESPERA: 6,        // ciclos entre dos raciones a la misma colonia (una hora)
  HORAS: 2,         // una colonia tiene hambre si su energía no le llega para 2 horas
  GASTOS_MIN: 10,   // si su tesoro baja de esto, Vita le cubre los gastos...
  GASTOS: 15,       // ...con esta cantidad, una vez al día
};
const DIA = 144;

export function ensure(w) {
  w.vita ??= { reserva: 0, dia: -1, hoy: { raciones: 0, alimento: 0, gastos: 0 }, total: { asignado: 0, raciones: 0, alimento: 0, gastos: 0 }, cols: {} };
  return w.vita;
}

// Energía que la colonia gasta en un ciclo sin luz (la noche es cuando se queda sin comer).
const gastoPorCiclo = col => col.cells.length * 0.03 * (1 + col.met / 30) + (col.alloc.rep / 100) * 1.2 * Math.max(0.25, col.cells.length / 40);
export const tieneHambre = col => col.alive && col.cells.length > 0 && col.energia < VITA.HORAS * 6 * gastoPorCiclo(col);

function nuevoDia(w, v, dia) {
  v.dia = dia; v.hoy = { raciones: 0, alimento: 0, gastos: 0 };
  // La cuenta de raciones y gastos vuelve a cero; la hora de la última ración se guarda para respetar la espera.
  for (const [id, c] of Object.entries(v.cols)) { if (!w.colonies[id]?.alive) delete v.cols[id]; else { c.raciones = 0; c.gastos = false; } }
  const n = Math.max(0, Math.min(VITA.DIARIO, VITA.MAXIMO - v.reserva));
  if (!n) return;
  v.reserva += n; v.total.asignado += n; w.supply.minted += n;
  block(w, "asignación", "sistema", "vita", n);
}

function darA(w, v, col, n, tipo) {
  v.reserva -= n; col.treasury += n;
  block(w, tipo, "vita", col.id, n);
}

export function step(w) {
  const v = ensure(w), dia = Math.floor(w.tick / DIA);
  if (dia !== v.dia) nuevoDia(w, v, dia);
  const vivas = Object.values(w.colonies).filter(c => c.alive);
  // Primero la comida, empezando por la colonia con menos energía para su tamaño.
  for (const col of vivas.filter(tieneHambre).sort((a, b) => a.energia / (150 + a.cells.length) - b.energia / (150 + b.cells.length))) {
    if (v.reserva < VITA.RACION) break;
    const c = v.cols[col.id] ??= { raciones: 0, ultima: -VITA.ESPERA, gastos: false };
    if (c.raciones >= VITA.RACIONES_DIA || w.tick - c.ultima < VITA.ESPERA) continue;
    darA(w, v, col, VITA.RACION, "alimento");
    buyNutrients(w, col, VITA.RACION, "Vita la alimenta y");
    c.raciones++; c.ultima = w.tick;
    v.hoy.raciones++; v.hoy.alimento += VITA.RACION; v.total.raciones++; v.total.alimento += VITA.RACION;
  }
  // Después los gastos: un tesoro vacío no puede pagar nutrientes de emergencia, mejoras ni consultas.
  for (const col of vivas) {
    if (v.reserva < VITA.GASTOS) break;
    if (col.treasury >= VITA.GASTOS_MIN) continue;
    const c = v.cols[col.id] ??= { raciones: 0, ultima: -VITA.ESPERA, gastos: false };
    if (c.gastos) continue;
    darA(w, v, col, VITA.GASTOS, "gastos");
    clog(w, col, `Vita le cubre los gastos: +${VITA.GASTOS} VIT al tesoro`);
    c.gastos = true; v.hoy.gastos += VITA.GASTOS; v.total.gastos += VITA.GASTOS;
  }
}

export function view(w) {
  const v = ensure(w);
  return {
    reserva: Math.floor(v.reserva), diario: VITA.DIARIO, racion: VITA.RACION, energiaRacion: VITA.RACION * 8,
    hoy: { ...v.hoy, colonias: Object.values(v.cols).filter(c => c.raciones || c.gastos).length },
    total: { ...v.total },
    porColonia: Object.fromEntries(Object.entries(v.cols).map(([id, c]) => [id, { raciones: c.raciones, gastos: c.gastos }])),
  };
}
