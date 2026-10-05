// Retención: que los jugadores vuelvan y que no pierdan lo que consiguieron.
// - Copia firmada de la cuenta (con su Ámbar y sus perlas), que guarda el navegador y sobrevive a los reinicios del servidor.
// - Informe "Mientras no estabas" al volver tras una hora o más.
// - Liga semanal con premios en células raras, épicas y legendarias (no en VIT).
// - Invitaciones que premian a los dos cuando el amigo juega 3 días distintos.
// - Métricas de retención para el panel del dueño.
// Funciones puras sobre `world`, como core.js: aquí no hay E/S.
import { createHmac, timingSafeEqual } from "node:crypto";
import { hash, newCell, block, grant, cellPrice, positions, clog, wlog, cap, EVENTS, RARITY } from "./core.js";
import { amberOf, ORUZ as ORUZ_CFG } from "./oruz.js";
import { pearlsOf, LUMAR as LUMAR_CFG } from "./lumar.js";
import { guardar as guardarMascota, restaurar as restaurarMascota, restaurarHogar } from "./mascotas.js";

const err = message => ({ ok: false, error: message });
const DAY = 86400000;
const dayStr = t => new Date(t).toISOString().slice(0, 10);
// Los contadores de la retención van dentro de w.stats, que el mundo ya trae con los suyos;
// se crean a cero si faltan (o si un guardado viejo los dejó en null)
const stats = w => {
  const s = (w.stats ||= {});
  for (const k of ["restores", "welcomes"]) if (!Number.isFinite(s[k])) s[k] = 0;
  return s;
};

// ---------- copia firmada de la cuenta ----------
export const SAVE_VERSION = 1;
const sign = (key, data) => createHmac("sha256", key).update(data).digest("base64url");

export function makeSave(w, u, key, now = Date.now()) {
  if (!key) return null;
  const names = [], cells = [], mascotas = [];
  for (const col of Object.values(w.colonies)) for (const c of col.cells) {
    if (c.owner !== u.id) continue;
    let i = names.indexOf(col.name); if (i < 0) i = names.push(col.name) - 1;
    cells.push([c.g.ef, c.g.res, c.g.fer, +c.mined.toFixed(2), i]);
    mascotas.push(guardarMascota(w, c)); // la mascota de cada célula, en el mismo orden
  }
  // Las participaciones en los fondos de las IA se guardan por su valor neto de retirada
  const fondos = Math.floor(positions(w, u).reduce((s, p) => s + p.value * 0.95, 0));
  const ambar = amberOf(w, u.id).map(({ owner, ownerName, ...p }) => p);
  const perlas = pearlsOf(w, u.id).map(({ owner, ownerName, ...p }) => p);
  const data = Buffer.from(JSON.stringify({ v: SAVE_VERSION, at: now, world: w.createdAt, user: u, names, cells, mascotas, fondos, ambar, perlas })).toString("base64url");
  return `${data}.${sign(key, data)}`;
}

export function restoreSave(w, blob, key, now = Date.now()) {
  if (!key) return err("Las copias de seguridad no están activadas en este servidor");
  const [data, sig] = String(blob || "").split(".");
  if (!data || !sig) return err("Copia no válida");
  const good = Buffer.from(sign(key, data)), got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return err("Esta copia no está firmada por este servidor");
  let s;
  try { s = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); } catch { return err("Copia no válida"); }
  if (s?.v !== SAVE_VERSION || !s.user?.tokenHash) return err("Copia no válida");
  // Una cuenta se identifica por su número y su fecha de alta, no por su clave: la clave cambia al usar
  // el código de recuperación, y sin esto una copia vieja podría duplicar células y VIT.
  // `origenes` guarda las cuentas de las que viene, para que ninguna copia vuelva dos veces.
  const origenes = [...new Set([...(s.user.origenes || []), `${s.user.id}:${s.user.createdAt}`])];
  const misma = x => x.tokenHash === s.user.tokenHash || (x.id === s.user.id && x.createdAt === s.user.createdAt) || x.origenes?.some(o => origenes.includes(o));
  if (Object.values(w.users).some(misma)) return err("Tu cuenta ya está en este mundo");
  let n = Object.keys(w.users).length + 1, id;
  do id = "U" + String(n++).padStart(4, "0"); while (w.users[id]);
  const u = { ...s.user, id, vit: 0, restoredAt: now, origenes };
  u.daily ||= { date: "", prog: {}, claimed: {} };
  restaurarHogar(w, u);
  w.users[id] = u;
  // Sus células vuelven a una colonia viva con sitio (la del mismo nombre si existe).
  // Llevan un código nuevo para no chocar con las de este mundo; si no caben, se pagan a precio de mercado.
  const alive = Object.values(w.colonies).filter(c => c.alive), placed = [];
  let refund = 0;
  for (const [k, [ef, res, fer, mined, i]] of (s.cells || []).entries()) {
    const g = { ef, res, fer }, free = c => cap(c) - c.cells.length;
    const col = alive.find(c => c.name === s.names?.[i] && free(c) > 0) || alive.filter(c => free(c) > 0).sort((a, b) => free(b) - free(a))[0];
    if (!col) { refund += cellPrice({ g }); continue; }
    const cell = newCell(w, col, g, id);
    cell.mined = mined || 0;
    if (w.mascotas) restaurarMascota(w, cell, s.mascotas?.[k]); // vuelve con su mascota y su lazo
    col.cells.push(cell); placed.push(cell.id);
  }
  const vit = Math.floor(s.user.vit || 0) + (s.fondos || 0) + refund;
  grant(w, u, vit, "restauración");
  if (placed.length) block(w, "restauración", "copia", id, placed.length, "CEL", placed.slice(0, 3));
  const amb = [];
  if (w.oruz) for (const p of s.ambar || []) if (!w.oruz.ambar[p.id]) { w.oruz.ambar[p.id] = { ...p, owner: id, ownerName: u.name, estado: "guardada" }; amb.push(p.id); }
  if (amb.length) block(w, "restauración", "copia", id, amb.length, "AMB", amb.slice(0, 3));
  // Las perlas vuelven como estaban: las recogidas, para regalar; las recibidas, para infundir
  const prl = [];
  if (w.lumar) for (const p of s.perlas || []) if (!w.lumar.perlas[p.id]) {
    w.lumar.perlas[p.id] = { ...p, owner: id, ownerName: u.name, ...(p.estado === "guardada" ? { recolector: id, recolectorName: u.name } : {}) };
    prl.push(p.id);
  }
  if (prl.length) block(w, "restauración", "copia", id, prl.length, "PRL", prl.slice(0, 3));
  u.welcome = { restaurada: true, at: now, vit, celulas: placed.length, ambar: amb.length, perlas: prl.length, reembolso: refund };
  u.ret = { seen: now, snap: null };
  stats(w).restores++;
  wlog(w, `${u.name} recupera su cuenta tras un reinicio del servidor`);
  return { ok: true, user: u, cells: placed.length, vit, amber: amb.length, pearls: prl.length };
}

// ---------- "Mientras no estabas" ----------
export const RETURN_MS = 3600000; // una hora fuera ya cuenta como volver
function snapshot(w, u, now) {
  let cells = 0; const cols = {};
  for (const col of Object.values(w.colonies)) {
    let n = 0; for (const c of col.cells) if (c.owner === u.id) n++;
    if (n) { cells += n; cols[col.id] = n; }
  }
  return { at: now, tick: w.tick, mined: u.mined || 0, vit: Math.floor(u.vit), cells, cols, graduadas: w.oruz?.graduadas || 0, ambar: w.oruz?.ambarSerial || 0, perlas: w.lumar?.perlaSerial || 0 };
}
function report(w, u, snap, away, now) {
  const cur = snapshot(w, u, now);
  const colonias = Object.values(w.colonies).filter(c => cur.cols[c.id] || snap.cols[c.id]).map(c => ({
    id: c.id, name: c.name, alive: c.alive, salud: Math.round(c.salud), evento: c.event ? EVENTS[c.event].name : null,
    celulas: cur.cols[c.id] || 0, antes: snap.cols[c.id] || 0, oruz: c.oruz?.estado || null, mensaje: c.ai.message || "",
  }));
  stats(w).welcomes++;
  return {
    horas: Math.max(1, Math.round(away / 3600000)), at: now,
    acunado: Math.max(0, Math.floor(cur.mined - snap.mined)), vit: cur.vit, vitAntes: snap.vit, celulas: cur.cells, celulasAntes: snap.cells, colonias,
    nuevas: Object.values(w.colonies).filter(c => c.createdTick > snap.tick).map(c => c.name),
    graduadas: Math.max(0, (w.oruz?.graduadas || 0) - snap.graduadas), ambarNuevo: Math.max(0, (w.oruz?.ambarSerial || 0) - snap.ambar),
    ambarLibre: Object.values(w.oruz?.ambar || {}).filter(p => p.estado === "libre").length, racha: u.streak,
    // Una foto tomada antes de que existiera Lumar cuenta las perlas desde ahora
    perlasNuevas: Math.max(0, (w.lumar?.perlaSerial || 0) - (snap.perlas ?? cur.perlas)), perlasLibres: Object.values(w.lumar?.perlas || {}).filter(p => p.estado === "libre").length,
    regalos: pearlsOf(w, u.id, "regalada").filter(p => (p.regaladaEn || 0) > snap.at).map(p => ({ id: p.id, de: p.deName, color: p.color })).slice(0, 5), luna: w.lumar?.luna?.name || null,
  };
}
// Se llama en cada petición de un jugador con sesión
export function touch(w, u, now = Date.now()) {
  if (!u.code) codeFor(w, u);
  const r = (u.ret ||= { seen: 0, snap: null }), away = r.seen ? now - r.seen : 0;
  if (r.snap && away >= RETURN_MS) u.welcome = report(w, u, r.snap, away, now);
  if (!r.snap || away >= RETURN_MS || now - r.snap.at >= 60000) r.snap = snapshot(w, u, now);
  r.seen = now;
  markDay(w, u, now);
}
function markDay(w, u, now) {
  const d = dayStr(now), days = (u.days ||= []);
  if (days.at(-1) === d) return;
  days.push(d); if (days.length > 60) days.splice(0, days.length - 60);
  u.daysActive = (u.daysActive || 0) + 1;
  award(w, u, "racha", now);
  checkInvite(w, u, now);
}

// ---------- liga semanal ----------
export const LEAGUE = {
  cap: 60, // puntos máximos por día: premia volver cada día más que jugar sin parar
  pts: { claim: 8, habit: 4, feed: 3, adopt: 5, upgrade: 5, invest: 2, ad: 1, spore: 1, amber_collect: 4, amber_infuse: 3, pearl_collect: 3, pearl_give: 5, pearl_infuse: 2, mimos: 3, racha: 5, invite: 15 },
  prizes: [3, 2, 2, 1, 1, 1, 1, 1, 1, 1], // rareza de la célula de premio del 1.º al 10.º
};
const PRIZE_GENES = [null, { ef: 9, res: 9, fer: 9 }, { ef: 11, res: 11, fer: 11 }, { ef: 13, res: 13, fer: 13 }];
// Semana ISO en UTC, por ejemplo "2026-S40"; la liga cierra el lunes a las 00:00 UTC
export function weekKey(t) {
  const d = new Date(t), x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const y = x.getUTCFullYear(), wk = Math.ceil(((x - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-S${String(wk).padStart(2, "0")}`;
}
export function weekEnds(t) {
  const d = new Date(t), x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return x + (8 - (new Date(x).getUTCDay() || 7)) * DAY;
}
function leagueOf(u, now) {
  const wk = weekKey(now), d = dayStr(now), L = (u.league ||= { week: wk, pts: 0, day: d, dayPts: 0 });
  if (L.week !== wk) Object.assign(L, { week: wk, pts: 0, day: d, dayPts: 0 });
  if (L.day !== d) Object.assign(L, { day: d, dayPts: 0 });
  return L;
}
export function award(w, u, kind, now = Date.now()) {
  const n = LEAGUE.pts[kind] || 0;
  if (!n) return 0;
  const L = leagueOf(u, now), add = Math.max(0, Math.min(n, LEAGUE.cap - L.dayPts));
  L.pts += add; L.dayPts += add;
  return add;
}
const ranking = (w, wk) => Object.values(w.users).filter(u => u.league?.week === wk && u.league.pts > 0).sort((a, b) => b.league.pts - a.league.pts || a.id.localeCompare(b.id));
function prizeCell(w, u, rar) {
  const alive = Object.values(w.colonies).filter(c => c.alive);
  if (!alive.length) return null;
  const mine = c => c.cells.reduce((n, x) => n + (x.owner === u.id), 0), free = c => cap(c) - c.cells.length;
  const col = alive.sort((a, b) => mine(b) - mine(a) || free(b) - free(a))[0];
  const cell = newCell(w, col, { ...PRIZE_GENES[rar] }, u.id);
  col.cells.push(cell);
  block(w, "premio liga", "liga", u.id, 1, "CEL", [cell.id]);
  clog(w, col, `${u.name} gana la célula ${RARITY[rar].name.toLowerCase()} <b>${cell.id}</b> en la liga semanal`);
  return cell;
}
// Cierra la semana anterior y reparte premios. Se llama en cada ciclo; solo actúa al cambiar de semana.
export function leagueTick(w, now = Date.now()) {
  const wk = weekKey(now), L = (w.league ||= { week: wk, history: [] });
  if (L.week === wk) return null;
  const prev = L.week, all = ranking(w, prev);
  const top = all.slice(0, LEAGUE.prizes.length).map((u, i) => {
    const rar = LEAGUE.prizes[i], cell = prizeCell(w, u, rar);
    (u.trophies ||= []).push({ week: prev, pos: i + 1, pts: u.league.pts, cell: cell?.id || null });
    u.premio = { week: prev, pos: i + 1, rareza: RARITY[rar].name, cell: cell?.id || null };
    return { pos: i + 1, name: u.name, pts: u.league.pts, premio: RARITY[rar].name };
  });
  L.history.unshift({ week: prev, top, jugadores: all.length }); if (L.history.length > 12) L.history.length = 12;
  L.week = wk;
  if (top.length) wlog(w, `Liga ${prev}: gana ${top[0].name} con ${top[0].pts} puntos y se lleva una célula legendaria`);
  return top;
}
export function leagueView(w, u, now = Date.now()) {
  const wk = weekKey(now), all = ranking(w, wk), L = u?.league?.week === wk ? u.league : null;
  return {
    week: wk, cierraEn: weekEnds(now) - now, tope: LEAGUE.cap, puntos: LEAGUE.pts, premios: LEAGUE.prizes.map(r => RARITY[r].name),
    top: all.slice(0, 10).map((x, i) => ({ pos: i + 1, name: x.name, pts: x.league.pts })),
    yo: u ? { pos: all.findIndex(x => x.id === u.id) + 1, pts: L?.pts || 0, hoy: L?.day === dayStr(now) ? L.dayPts : 0 } : null,
    anterior: w.league?.history?.[0] || null,
  };
}

// ---------- invitaciones ----------
export const INVITE = { dias: 3, amigo: 10, tu: 15, max: 10 };
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function codeFor(w, u) {
  if (u.code) return u.code;
  const used = new Set(Object.values(w.users).map(x => x.code).filter(Boolean));
  let n = 0, code;
  do {
    const h = hash(`${u.tokenHash}:${u.createdAt}:${n++}`);
    code = Array.from({ length: 6 }, (_, i) => ALPHA[parseInt(h.slice(i * 2, i * 2 + 2), 16) % ALPHA.length]).join("");
  } while (used.has(code));
  return (u.code = code);
}
export function onJoin(w, u, ref) {
  codeFor(w, u);
  const code = String(ref || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const by = code && Object.values(w.users).find(x => x.code === code && x.id !== u.id);
  if (!by) return false;
  u.ref = { code, ok: false };
  (by.inv ||= { joined: 0, ok: 0, paid: 0 }).joined++;
  return true;
}
function checkInvite(w, u, now) {
  if (!u.ref || u.ref.ok || (u.daysActive || 0) < INVITE.dias) return;
  u.ref.ok = true;
  grant(w, u, INVITE.amigo, "invitación");
  const by = Object.values(w.users).find(x => x.code === u.ref.code);
  if (!by) return;
  const inv = (by.inv ||= { joined: 0, ok: 0, paid: 0 });
  inv.ok++;
  if (inv.paid >= INVITE.max) return;
  inv.paid++;
  grant(w, by, INVITE.tu, "invitación");
  award(w, by, "invite", now);
  wlog(w, `${by.name} y ${u.name} ganan VIT: la invitación se cumplió`);
}
export function inviteView(w, u) {
  const inv = u.inv || { joined: 0, ok: 0, paid: 0 };
  return {
    code: u.code || null, ...inv, max: INVITE.max, dias: INVITE.dias, amigo: INVITE.amigo, tu: INVITE.tu,
    mia: u.ref ? { ok: u.ref.ok, dias: Math.min(u.daysActive || 0, INVITE.dias) } : null,
  };
}

// ---------- lo que ve el jugador y lo que ve el dueño ----------
export function userExtras(w, u, savesOn) {
  return { invite: inviteView(w, u), welcome: u.welcome || null, premio: u.premio || null, saves: !!savesOn, trophies: (u.trophies || []).slice(-5) };
}
export function metrics(w, now = Date.now()) {
  const users = Object.values(w.users), today = dayStr(now), since = k => dayStr(now - k * DAY);
  const cohort = k => {
    const base = users.filter(u => u.createdAt && dayStr(u.createdAt) <= since(k));
    const back = base.filter(u => u.days?.includes(dayStr(u.createdAt + k * DAY)));
    return { base: base.length, vuelven: back.length, pct: base.length ? Math.round(back.length / base.length * 100) : null };
  };
  const o = w.oruz, m = w.lumar;
  return {
    jugadores: users.length,
    dau: users.filter(u => u.days?.includes(today)).length,
    wau: users.filter(u => u.days?.some(d => d >= since(6))).length,
    mau: users.filter(u => u.days?.some(d => d >= since(29))).length,
    d1: cohort(1), d7: cohort(7),
    invitaciones: { unidos: users.filter(u => u.ref).length, cumplidas: users.filter(u => u.ref?.ok).length },
    liga: { semana: weekKey(now), jugadores: ranking(w, weekKey(now)).length },
    restauradas: stats(w).restores, informesDeRegreso: stats(w).welcomes,
    oruz: o ? { graduadas: o.graduadas, enEscuela: Object.keys(o.escuela).length, ambarNacido: o.ambarSerial, ambarRecogido: Object.values(o.ambar).filter(p => p.owner).length, porJugadorYDia: ORUZ_CFG.AMBER_PER_DAY } : null,
    lumar: m ? { luna: m.luna.name, perlasNacidas: m.perlaSerial, recogidas: m.recogidas, regaladas: m.regaladas, infundidas: m.infundidas, porJugadorYDia: LUMAR_CFG.PER_DAY } : null,
  };
}
