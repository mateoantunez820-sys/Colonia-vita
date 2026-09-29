// El aura del día: cada mañana el jugador cuenta cómo se levantó y la colonia que está viendo brilla con ese color.
// · Contarlo da 2 VIT al jugador y +8 energía y +2 salud a la colonia, sea cual sea el aura: decir que estás mal no se castiga.
// · VITA le deja un mensaje corto. Con cansancio o con el ánimo bajo, el mensaje es de cuidado,
//   y con el ánimo bajo recuerda la Línea Vida de Uruguay.
// · Racha de días seguidos e historial de dos semanas. Cada 7 días seguidos, 5 VIT más.
// · Se puede cambiar el mismo día, sin premio extra. El aura es privada: solo la ve su jugador,
//   y la bitácora pública dice que la colonia brilla, no cómo se siente nadie.
// Funciones puras sobre `world`, como core.js: aquí no hay E/S.
import { hash, clog, grant } from "./core.js";

export const AURA = { VIT: 2, ENERGIA: 8, SALUD: 2, SEMANA: 7, SEMANA_VIT: 5, HIST: 14 };
export const AYUDA = "Si lo estás pasando muy mal, no tienes que atravesarlo a solas: en Uruguay la Línea Vida atiende gratis a cualquier hora en el 0800 0767, o en el *0767 desde el celular. Hablar con alguien de confianza también ayuda.";
export const AURAS = {
  radiante: { name: "Radiante", color: "#F0B03F", frases: [
    "¡Qué luz traes hoy! Tu colonia brilla dorada gracias a ti.",
    "Hoy tu brillo se contagia: las células bailan con tu color.",
    "Días así se guardan. Tu colonia y yo te lo agradecemos."] },
  energia: { name: "Con energía", color: "#62D6B8", frases: [
    "Con esa energía, hoy tu colonia crece contigo.",
    "Buen día: tu colonia recibe tu fuerza y te la devuelve.",
    "Se nota tu impulso. Hoy las células trabajan con más ganas."] },
  calma: { name: "En calma", color: "#6FA8F5", frases: [
    "La calma también es fuerza. Tu colonia respira tranquila contigo.",
    "Un día sereno: tu colonia guarda tu paz.",
    "Sin prisa y con buen paso. Así también se crece."] },
  cansancio: { name: "Con cansancio", color: "#C38BF2", frases: [
    "Descansar también es cuidarse. Hoy tu colonia te cuida a ti.",
    "Ve a tu ritmo: tu colonia no tiene prisa, y yo tampoco.",
    "Gracias por venir igual. Un poco de agua y una pausa también cuentan."] },
  bajo: { name: "Con el ánimo bajo", color: "#F4B6C8", ayuda: true, frases: [
    "Gracias por contarme cómo estás. No tienes que poder con todo hoy: tu colonia y yo te acompañamos.",
    "Los días grises también pasan. Hoy tu colonia brilla suave, solo para ti.",
    "Aunque hoy cueste, que hayas venido ya es un paso. Aquí te esperamos, sin exigirte nada."] },
};

const DIA = 86400000;
const fecha = t => new Date(t).toISOString().slice(0, 10);
const err = message => ({ ok: false, error: message });
// El mensaje cambia cada día, pero es el mismo si lo vuelves a mirar
const frase = (u, dia, k) => AURAS[k].frases[parseInt(hash(`aura:${u.id}:${dia}`).slice(0, 8), 16) % AURAS[k].frases.length];

// col: la colonia que está viendo el jugador. Si está extinta, el aura cuenta igual, pero no brilla ninguna.
export function elegir(w, u, k, col, now = Date.now()) {
  const a = AURAS[k];
  if (!a) return err("Elige cómo te levantaste hoy");
  const hoy = fecha(now), prev = u.aura;
  if (prev?.fecha === hoy) {
    if (prev.k === k) return err("Esa ya es tu aura de hoy");
    prev.k = k; prev.hist[0] = [hoy, k];
    return { ok: true, cambio: true, name: a.name, texto: frase(u, hoy, k) };
  }
  const racha = prev?.fecha === fecha(now - DIA) ? prev.racha + 1 : 1;
  const semana = racha % AURA.SEMANA === 0 ? AURA.SEMANA_VIT : 0;
  grant(w, u, AURA.VIT, "aura del día");
  if (semana) grant(w, u, semana, "semana de aura");
  const brilla = col?.alive ? col : null;
  if (brilla) {
    brilla.energia += AURA.ENERGIA; brilla.salud = Math.min(100, brilla.salud + AURA.SALUD);
    clog(w, brilla, `El aura de ${u.name} ilumina la colonia (+${AURA.ENERGIA} energía)`);
  }
  u.aura = { fecha: hoy, k, col: brilla?.id || null, racha, hist: [[hoy, k], ...(prev?.hist || [])].slice(0, AURA.HIST) };
  return { ok: true, name: a.name, texto: frase(u, hoy, k), vit: AURA.VIT + semana, semana, racha };
}

// Va dentro de /api/world: si algo falla, el jugador se queda sin su aura, pero no sin ver el mundo.
export function view(w, u, now = Date.now()) {
  if (!u) return null;
  try {
    const a = u.aura, hoy = fecha(now), deHoy = a?.fecha === hoy;
    const racha = a && (deHoy || a.fecha === fecha(now - DIA)) ? a.racha : 0;
    const col = deHoy && a.col ? w.colonies[a.col] : null;
    return {
      opciones: Object.entries(AURAS).map(([k, x]) => ({ k, name: x.name, color: x.color })),
      hoy: deHoy ? { k: a.k, name: AURAS[a.k].name, color: AURAS[a.k].color, texto: frase(u, hoy, a.k), ayuda: AURAS[a.k].ayuda ? AYUDA : null,
        col: col?.alive ? col.id : null, colName: col?.alive ? col.name : null } : null,
      racha, semana: AURA.SEMANA, premio: { vit: AURA.VIT, energia: AURA.ENERGIA, semana: AURA.SEMANA_VIT },
      hist: (a?.hist || []).map(([f, k]) => ({ f, name: AURAS[k]?.name || k, color: AURAS[k]?.color || "#8AA4AD" })),
    };
  } catch (e) { console.error("[aura]", e.message); return null; }
}
