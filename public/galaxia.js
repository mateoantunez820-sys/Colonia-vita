// Galaxia VITA: la federación dibujada como una galaxia viva y cada colonia como un mini mundo.
// VITA es la estrella del centro. Cada colonia es un mini planeta con cara, color y dibujo propios,
// sacados de su genoma, y gira en la órbita de su rango: Ámbar cerca de la estrella, Oruz en medio y
// las ciudadanas afuera. Los hilos de luz unen a cada madre con sus hijas. Oruz y Lumar son planetas
// con su Ámbar y sus perlas en órbita, y la luna de Lumar está en su fase real.
// Canvas 2D sin dependencias: se pausa cuando no se ve y respeta "reducir movimiento".
(() => {
"use strict";
const TAU = Math.PI * 2;
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hsl = (h, s, l, a = 1) => `hsla(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%,${a})`;
const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",")},${a})`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FONT = { t: '"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif', m: '"IBM Plex Mono",ui-monospace,Menlo,monospace' };

// ---------- lienzo y bucle ----------
// Ajusta el canvas a su tamaño en pantalla, con la densidad limitada a 2× para cuidar el celular.
function lienzo(cv, alCambiar) {
  const s = { ctx: cv.getContext("2d"), w: 0, h: 0, d: 1 };
  const fit = () => {
    const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
    const d = Math.min(2, devicePixelRatio || 1);
    if (Math.abs(r.width - s.w) < .5 && Math.abs(r.height - s.h) < .5 && d === s.d) return;
    Object.assign(s, { w: r.width, h: r.height, d });
    cv.width = Math.round(s.w * d); cv.height = Math.round(s.h * d);
    s.ctx.setTransform(d, 0, 0, d, 0, 0); alCambiar(s);
  };
  // el primer aviso del observador llega antes del primer cuadro, ya con todo inicializado
  new ResizeObserver(fit).observe(cv);
  return s;
}
// Dibuja en cada cuadro solo mientras el canvas está en pantalla y la pestaña visible.
// Con "reducir movimiento" no hay animación: se dibuja una vez cada vez que cambian los datos.
function bucle(cv, cuadro) {
  let visible = true, raf = 0, last = 0, reloj = 0;
  const paso = now => { raf = 0; const dt = last ? Math.min(100, now - last) : 16; last = now; reloj += dt; cuadro(reloj, dt); pedir(); };
  const pedir = () => { if (!raf && visible && !document.hidden && !REDUCE) raf = requestAnimationFrame(paso); };
  new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); last = 0; pedir(); }).observe(cv);
  document.addEventListener("visibilitychange", () => { last = 0; pedir(); });
  return { ahora: () => { if (!raf) cuadro(reloj, 0); }, pedir };
}

// Resplandores: un degradado radial pintado una vez por color y reusado como imagen
const halos = new Map();
function halo(key, color) {
  let s = halos.get(key); if (s) return s;
  s = document.createElement("canvas"); s.width = s.height = 64;
  const g = s.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color(1)); gr.addColorStop(.22, color(.6)); gr.addColorStop(.55, color(.16)); gr.addColorStop(1, color(0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); halos.set(key, s); return s;
}
const luzHex = hex => halo(hex, a => rgba(hex, a));
const luzHue = (h, s = 80, l = 70) => halo(`h${h}|${s}|${l}`, a => hsl(h, s, l, a));
function luz(ctx, img, x, y, r, a = 1) { if (r <= 0 || a <= 0) return; ctx.globalAlpha = a; ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }

// ---------- el aspecto de cada colonia ----------
const EVK = { "Sequía": "sequia", "Floración": "floracion", "Helada": "helada", "Plaga": "plaga" };
// Los genes promedio vienen en el genoma: VIT-[eficiencia][resistencia][fertilidad][metabolismo]-XX
function genes(code) {
  const m = /^VIT-([0-9A-F]{4})/i.exec(code || ""), d = m ? [...m[1]].map(x => parseInt(x, 16)) : [7, 7, 7, 7];
  return { ef: d[0], res: d[1], fer: d[2], met: d[3] };
}
// Color propio de cada colonia: el ángulo de oro reparte los tonos para que no se repitan
function tono(id) { const n = parseInt(/(\d+)$/.exec(id || "")?.[1] || "", 10); return Number.isFinite(n) ? (n * 137.508 + 20) % 360 : hashStr(id || "") % 360; }
function look(c, W) {
  const g = genes(c.genome), seed = hashStr(c.id || c.name || ""), hue = tono(c.id);
  const rar = c.rarity || [1, 0, 0, 0], tot = rar.reduce((a, b) => a + b, 0) || 1;
  return {
    id: c.id, seed, hue, hue2: (hue + 30 + g.fer * 6) % 360, sat: 52 + g.ef * 2.2, lig: 52 + g.ef * .7,
    bands: 1 + g.met % 3, spots: Math.round(g.fer / 3), shell: .5 + g.res / 9,
    alive: c.alive !== false, rank: c.alive === false ? "muerta" : (c.rango?.k || "ciudadana"),
    salud: c.salud ?? 80, event: EVK[c.event] || null, aprendiz: W?.oruz?.estado?.[c.id]?.estado === "aprendiz",
    brillo: (rar[3] || 0) / tot, grat: !!c.gratitudDias,
  };
}

// Mini planeta con cara. o = { t, mira (ángulo de las pupilas), parpadeo }
function mini(ctx, x, y, r, L, o = {}) {
  const t = o.t || 0, dead = !L.alive, H = L.hue, S = dead ? 5 : L.sat, Li = dead ? 34 : L.lig;
  ctx.save(); ctx.translate(x, y);
  if (L.rank === "ambar") anillo(ctx, r, true);
  if (L.rank === "oruz" && r >= 5) orbitales(ctx, r, t);
  const g = ctx.createRadialGradient(-r * .38, -r * .42, r * .08, 0, 0, r);
  g.addColorStop(0, hsl(H, S, Math.min(93, Li + 28))); g.addColorStop(.55, hsl(H, S, Li)); g.addColorStop(1, hsl(H, S * .85, Li - 24));
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
  if (r >= 6) {
    // bandas de planeta (metabolismo) y manchas (fertilidad)
    ctx.save(); ctx.clip();
    ctx.globalAlpha = dead ? .12 : .3; ctx.strokeStyle = hsl(L.hue2, S, Li + 10); ctx.lineWidth = r * .17;
    for (let i = 0; i < L.bands; i++) { const by = r * (-.5 + i * .42); ctx.beginPath(); ctx.moveTo(-r, by); ctx.quadraticCurveTo(0, by + r * .2, r, by); ctx.stroke(); }
    ctx.globalAlpha = dead ? .15 : .42; ctx.fillStyle = hsl(L.hue2, S, Li + 20);
    const R = rng(L.seed);
    for (let i = 0; i < L.spots; i++) { const a = R() * TAU, d = .35 + R() * .5; ctx.beginPath(); ctx.arc(Math.cos(a) * d * r, Math.sin(a) * d * r * .7 + r * .2, r * (.07 + R() * .07), 0, TAU); ctx.fill(); }
    evento(ctx, r, L.event, dead);
    ctx.restore();
  }
  // la corteza: más gruesa cuanto más resistente
  ctx.globalAlpha = 1; ctx.lineWidth = Math.max(.6, L.shell * r / 12); ctx.strokeStyle = hsl(H, S, Math.min(95, Li + 32), dead ? .2 : .5);
  ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
  if (r >= 4.5) cara(ctx, r, L, o);
  if (L.event === "floracion" && r >= 7) flor(ctx, r * .62, -r * .78, r * .26);
  if (L.rank === "ambar") { anillo(ctx, r, false); if (r >= 8) corona(ctx, r); }
  if (L.aprendiz && r >= 6) birrete(ctx, r);
  if (L.grat && r >= 8) corazon(ctx, r * .92, -r * .62, r * .2, "#F4829B");
  if (L.brillo > .05 && r >= 6 && !dead) destello(ctx, -r * 1.05, -r * .85, r * (.22 + L.brillo * .5), .6 + .4 * Math.sin(t / 380 + L.seed));
  ctx.restore();
}
function cara(ctx, r, L, o) {
  const dead = !L.alive, cerr = dead || o.parpadeo, ey = r * .02, ex = r * .33, ew = r * .17, eh = r * .21;
  const mx = Math.cos(o.mira || 0) * ew * .38, my = Math.sin(o.mira || 0) * eh * .3;
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    const cx = s * ex;
    if (cerr) { ctx.strokeStyle = "rgba(8,16,20,.8)"; ctx.lineWidth = Math.max(.9, r * .075); ctx.beginPath(); ctx.moveTo(cx - ew * .8, ey); ctx.quadraticCurveTo(cx, ey + eh * .55, cx + ew * .8, ey); ctx.stroke(); continue; }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(cx, ey, ew, eh, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0B1418"; ctx.beginPath(); ctx.arc(cx + mx, ey + my, ew * .6, 0, TAU); ctx.fill();
    if (r >= 9) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + mx - ew * .22, ey + my - eh * .28, ew * .22, 0, TAU); ctx.fill(); }
  }
  if (dead) return;
  // la boca dice cómo está de salud
  const y = r * .42, w = r * .2, s = L.salud;
  ctx.strokeStyle = "rgba(8,16,20,.75)"; ctx.lineWidth = Math.max(.9, r * .075); ctx.beginPath();
  if (s > 60) { ctx.moveTo(-w, y - r * .05); ctx.quadraticCurveTo(0, y + r * .15, w, y - r * .05); }
  else if (s > 30) { ctx.moveTo(-w * .8, y); ctx.lineTo(w * .8, y); }
  else { ctx.moveTo(-w, y + r * .07); ctx.quadraticCurveTo(0, y - r * .11, w, y + r * .07); }
  ctx.stroke();
  if (s > 60 && r >= 10) { ctx.fillStyle = "rgba(255,120,140,.32)"; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * r * .56, r * .27, r * .12, r * .08, 0, 0, TAU); ctx.fill(); } }
}
function evento(ctx, r, ev, dead) {
  if (!ev || dead) return;
  ctx.globalAlpha = 1;
  if (ev === "helada") { ctx.fillStyle = "rgba(225,242,255,.85)"; ctx.beginPath(); ctx.ellipse(0, -r * 1.05, r * 1.1, r * .55, 0, 0, TAU); ctx.fill(); }
  else if (ev === "sequia") {
    ctx.fillStyle = "rgba(240,140,60,.28)"; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = "rgba(60,30,10,.55)"; ctx.lineWidth = Math.max(.6, r * .05); ctx.beginPath();
    ctx.moveTo(-r * .7, r * .55); ctx.lineTo(-r * .4, r * .7); ctx.lineTo(-r * .25, r * .55); ctx.moveTo(r * .35, r * .6); ctx.lineTo(r * .55, r * .75); ctx.stroke();
  } else if (ev === "plaga") {
    ctx.fillStyle = "rgba(168,86,222,.8)";
    for (const [a, b, c] of [[-.55, -.5, .12], [.6, -.35, .09], [.1, .75, .1]]) { ctx.beginPath(); ctx.arc(a * r, b * r, c * r, 0, TAU); ctx.fill(); }
  }
}
// Anillo dorado de las colonias de Ámbar: la mitad de atrás va antes del cuerpo y la de delante después
function anillo(ctx, r, atras) {
  ctx.save(); ctx.rotate(-.32); ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.62, r * .46, 0, atras ? Math.PI : 0, atras ? TAU : Math.PI);
  ctx.strokeStyle = "rgba(240,176,63,.95)"; ctx.lineWidth = Math.max(1.1, r * .17); ctx.stroke();
  ctx.strokeStyle = "rgba(255,228,160,.85)"; ctx.lineWidth = Math.max(.5, r * .05); ctx.stroke();
  ctx.restore();
}
function orbitales(ctx, r, t) {
  ctx.strokeStyle = "rgba(195,139,242,.5)"; ctx.lineWidth = Math.max(.7, r * .07);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.42, 0, TAU); ctx.stroke();
  ctx.fillStyle = "#DCC0FA";
  for (let i = 0; i < 3; i++) { const a = t / 1600 + i * TAU / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42, Math.max(1, r * .12), 0, TAU); ctx.fill(); }
}
function corona(ctx, r) {
  const y = -r * .98, w = r * .56, h = r * .4;
  ctx.fillStyle = "#F0B03F"; ctx.strokeStyle = "#FFE3A0"; ctx.lineWidth = Math.max(.5, r * .04); ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(-w / 2, y - h * .6); ctx.lineTo(-w / 4, y - h * .25); ctx.lineTo(0, y - h); ctx.lineTo(w / 4, y - h * .25); ctx.lineTo(w / 2, y - h * .6); ctx.lineTo(w / 2, y); ctx.closePath();
  ctx.fill(); ctx.stroke();
}
function birrete(ctx, r) {
  const y = -r * .92;
  ctx.fillStyle = "#1A2233"; ctx.fillRect(-r * .3, y - r * .02, r * .6, r * .22);
  ctx.beginPath(); ctx.moveTo(0, y - r * .34); ctx.lineTo(r * .66, y - r * .1); ctx.lineTo(0, y + r * .13); ctx.lineTo(-r * .66, y - r * .1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#F0B03F"; ctx.lineWidth = Math.max(.7, r * .06); ctx.beginPath(); ctx.moveTo(0, y - r * .1); ctx.lineTo(r * .52, y + r * .04); ctx.lineTo(r * .52, y + r * .34); ctx.stroke();
}
function corazon(ctx, x, y, s, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y, x - s * .7, y - s * .9, x, y - s * .25); ctx.bezierCurveTo(x + s * .7, y - s * .9, x + s * 1.4, y, x, y + s * .9); ctx.fill();
}
function flor(ctx, x, y, s) {
  ctx.fillStyle = "#F7A8C8";
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * .6, y + Math.sin(a) * s * .6, s * .45, 0, TAU); ctx.fill(); }
  ctx.fillStyle = "#FFD86B"; ctx.beginPath(); ctx.arc(x, y, s * .38, 0, TAU); ctx.fill();
}
function destello(ctx, x, y, s, a) {
  ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = "#FFE7A8"; ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
  ctx.globalAlpha = 1;
}
// Luna con su fase real: la parte iluminada es un borde del disco más la línea de sombra
function luna(ctx, x, y, r, fase, sur) {
  const k = Math.cos(TAU * fase), rx = Math.abs(k) * r, crece = fase < .5;
  ctx.save(); ctx.translate(x, y); if (sur) ctx.scale(-1, 1);
  ctx.fillStyle = "#1B2B3A"; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = "#F3EFD8"; ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, !crece);
  ctx.ellipse(0, 0, Math.max(.01, rx), r, 0, Math.PI / 2, -Math.PI / 2, crece === (k > 0));
  ctx.fill(); ctx.restore();
}

// ---------- la galaxia ----------
const ORB = {
  ambar: { f: .4, per: 75000, color: "#F0B03F", name: "Ámbar" },
  oruz: { f: .66, per: 105000, color: "#C38BF2", name: "Oruz" },
  ciudadana: { f: .9, per: 150000, color: "#7FA6C9", name: "Ciudadanas" },
  muerta: { f: 1.04, per: 280000, color: "#4E5E66", name: "Dormidas" },
};
const TONO_AMBAR = { miel: "#E9B45A", dorado: "#F0B03F", cobre: "#D98A4E", "rubí": "#E0525E", esmeralda: "#4FC08D", "azul abisal": "#4B7BE0" };
const PERLA = { blanca: "#F4F1EA", crema: "#EFDDB4", rosa: "#F4B6C8", dorada: "#E9C25C", negra: "#6B6F86", azul: "#7FB2F5" };

function galaxia(cv, o = {}) {
  let W = null, sel = null, fondo = null, lay = null, tipK = null, hover = false, tAhora = 0, criaPos = null;
  let cartas = [], cartasVistas = null; // sobres en viaje y las cartas que ya se vieron
  const cuerpos = new Map(), titilan = [];
  let fugaz = null, proximaFugaz = 4000;
  const tip = o.tip;
  const s = lienzo(cv, () => { lay = disposicion(s.w, s.h); fondo = pintarFondo(); for (const b of cuerpos.values()) b.x = null; loop.ahora(); });
  const loop = bucle(cv, cuadro);

  function disposicion(w, h) {
    const ancho = w / h >= 1.25, k = clamp(Math.min(w, h * 1.25) / 400, .78, 1.45);
    const Rx = ancho ? Math.min(w * .3, h * .95) : Math.min(w * .41, h * .4), tilt = ancho ? .42 : .56;
    const P = ancho ? clamp(h * .085, 22, 46) : clamp(w * .075, 20, 36);
    return {
      w, h, ancho, k, cx: w / 2, cy: h * .52, Rx, Ry: Rx * tilt, P, R: 18 * k,
      mundos: ancho
        ? { oruz: { x: w * .115, y: h * .3, lado: "abajo" }, lumar: { x: w * .885, y: h * .68, lado: "abajo" } }
        : { oruz: { x: w * .2, y: h * .13, lado: "der" }, lumar: { x: w * .8, y: h * .86, lado: "izq" } },
    };
  }
  // Espacio profundo, nebulosas, estrellas fijas y los brazos de la galaxia: se pinta una vez por tamaño
  function pintarFondo() {
    const { w, h, d } = s, c = document.createElement("canvas"); c.width = Math.round(w * d); c.height = Math.round(h * d);
    const g = c.getContext("2d"); g.scale(d, d);
    const cielo = g.createLinearGradient(0, 0, 0, h); cielo.addColorStop(0, "#030810"); cielo.addColorStop(1, "#061722");
    g.fillStyle = cielo; g.fillRect(0, 0, w, h);
    const R = rng(20260928);
    for (const [col, x, y, r] of [["#1F8F80", .28, .32, .55], ["#7A3FB8", .78, .26, .5], ["#B8741C", .6, .86, .42], ["#2C5FA8", .12, .85, .4], ["#62D6B8", .5, .5, .3]]) {
      const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
      gr.addColorStop(0, rgba(col, .16)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    // brazos en espiral alrededor de VITA, en el mismo plano inclinado que las órbitas
    const { cx, cy, Rx, Ry } = lay;
    for (let brazo = 0; brazo < 2; brazo++) for (let i = 0; i < 520; i++) {
      const u = i / 520, rad = .12 + u * 1.35, a = brazo * Math.PI + u * 5.2 + (R() - .5) * .5, sp = (R() - .5) * .12 * (1 + u);
      const x = cx + Math.cos(a) * (rad + sp) * Rx, y = cy + Math.sin(a) * (rad + sp) * Ry;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      g.fillStyle = R() < .5 ? `rgba(160,235,220,${(1 - u) * .35 * R()})` : `rgba(210,180,255,${(1 - u) * .3 * R()})`;
      g.beginPath(); g.arc(x, y, .4 + R() * 1.1, 0, TAU); g.fill();
    }
    const n = Math.round(w * h / 1500);
    for (let i = 0; i < n; i++) {
      const tipo = R();
      g.fillStyle = `rgba(${tipo < .12 ? "255,226,180" : tipo < .28 ? "190,215,255" : "236,244,250"},${.2 + R() * .6})`;
      g.beginPath(); g.arc(R() * w, R() * h, R() ** 3 * 1.3 + .25, 0, TAU); g.fill();
    }
    titilan.length = 0;
    for (let i = 0; i < Math.round(w * h / 9000); i++) titilan.push({ x: R() * w, y: R() * h, r: .7 + R() * 1.1, ph: R() * TAU, v: .6 + R() * 1.4, c: R() < .3 ? "#FFE2B0" : "#DDEBFF" });
    return c;
  }

  function mundosActivos() {
    const m = [];
    if (W?.oruz?.regions?.length) m.push("oruz");
    if (W?.lumar?.regions?.length) m.push("lumar");
    return m;
  }
  // Reparte cada colonia en su órbita. Las aprendices de Oruz giran alrededor de su escuela.
  function asignar() {
    const grupos = { ambar: [], oruz: [], ciudadana: [], muerta: [], escuela: [] }, hay = new Set(mundosActivos());
    for (const c of W.colonies) {
      const L = look(c, W), g = !L.alive ? "muerta" : L.aprendiz && hay.has("oruz") ? "escuela" : (grupos[L.rank] ? L.rank : "ciudadana");
      grupos[g].push({ c, L });
    }
    const vivos = new Set();
    for (const [g, lista] of Object.entries(grupos)) {
      lista.sort((a, b) => (a.c.id > b.c.id ? 1 : -1));
      lista.forEach(({ c, L }, i) => {
        let b = cuerpos.get(c.id);
        if (!b) { b = { id: c.id, x: null, y: null, s: 1 }; cuerpos.set(c.id, b); }
        Object.assign(b, { g, c, L, off: i / lista.length * TAU + (g === "oruz" ? .5 : g === "ciudadana" ? 1.1 : 0) });
        vivos.add(c.id);
      });
    }
    for (const id of cuerpos.keys()) if (!vivos.has(id)) cuerpos.delete(id);
  }
  function destino(b, t) {
    const { cx, cy, Rx, Ry, P, mundos } = lay;
    if (b.g === "escuela") {
      const m = mundos.oruz, a = t / 22000 * TAU + b.off, rr = P + 15 * lay.k;
      return { x: m.x + Math.cos(a) * rr, y: m.y + Math.sin(a) * rr * .5, z: Math.sin(a), mira: Math.atan2(m.y - (m.y + Math.sin(a) * rr * .5), m.x - (m.x + Math.cos(a) * rr)) };
    }
    const ob = ORB[b.g], a = (REDUCE ? 0 : t / ob.per * TAU) + b.off;
    const x = cx + Math.cos(a) * Rx * ob.f, y = cy + Math.sin(a) * Ry * ob.f;
    return { x, y, z: Math.sin(a), mira: Math.atan2(cy - y, cx - x) };
  }
  const radio = b => (b.L.alive ? 9 + 7 * Math.sqrt(clamp(b.c.cells / (b.c.cap || 300), 0, 1)) : 7.5) * lay.k * (b.g === "escuela" ? .8 : 1);

  function cuadro(t, dt) {
    tAhora = t;
    if (!lay || !s.w) return;
    const ctx = s.ctx, { w, h, cx, cy, k } = lay;
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.drawImage(fondo, 0, 0, w, h);
    for (const st of titilan) { const a = .35 + .65 * (.5 + .5 * Math.sin(t / 1000 * st.v + st.ph)); ctx.globalAlpha = a; ctx.fillStyle = st.c; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    estrellaFugaz(ctx, t, dt);
    if (!W) return;
    // posiciones: cada cuerpo se acerca a su lugar en la órbita (así un ascenso de rango se ve como un vuelo)
    const suave = dt ? 1 - Math.exp(-dt / 450) : 1;
    for (const b of cuerpos.values()) {
      const d = destino(b, t);
      if (b.x == null || !dt) { b.x = d.x; b.y = d.y; } else { b.x += (d.x - b.x) * suave; b.y += (d.y - b.y) * suave; }
      b.z = d.z; b.mira = d.mira; b.r = radio(b) * (1 + .14 * d.z);
    }
    criaPos = posCria(t);
    orbitas(ctx);
    rutas(ctx, t);
    hilos(ctx, t);
    viajeCria(ctx, t);
    // de atrás hacia adelante: lo que está más arriba en la pantalla queda detrás
    const capas = [{ y: cy, f: () => estrella(ctx, t) }];
    const M = lay.mundos;
    if (W.oruz?.regions?.length) capas.push({ y: M.oruz.y, f: () => oruz(ctx, t) }, ...ambarEnOrbita(ctx, t));
    if (W.lumar?.regions?.length) capas.push({ y: M.lumar.y, f: () => lumar(ctx, t) }, ...perlasEnOrbita(ctx, t));
    for (const b of cuerpos.values()) capas.push({ y: b.y, f: () => colonia(ctx, b, t) });
    if (criaPos) capas.push({ y: criaPos.y, f: () => pintarCria(ctx, criaPos) });
    capas.sort((a, b) => a.y - b.y).forEach(c => c.f());
    sobres(ctx, t);
    etiquetas(ctx, t);
    if (tipK) moverTip();
  }
  function estrellaFugaz(ctx, t, dt) {
    if (REDUCE) return;
    if (!fugaz && t > proximaFugaz) { const R = Math.random; fugaz = { x: s.w * (.1 + R() * .6), y: s.h * R() * .35, vx: 380 + R() * 260, vy: 90 + R() * 120, vida: 0 }; }
    if (!fugaz) return;
    fugaz.vida += dt; const f = fugaz, a = Math.sin(Math.min(1, f.vida / 900) * Math.PI);
    const x = f.x + f.vx * f.vida / 1000, y = f.y + f.vy * f.vida / 1000;
    const gr = ctx.createLinearGradient(x, y, x - f.vx * .18, y - f.vy * .18);
    gr.addColorStop(0, `rgba(255,255,255,${.9 * a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - f.vx * .18, y - f.vy * .18); ctx.stroke();
    if (f.vida > 900) { fugaz = null; proximaFugaz = t + 7000 + Math.random() * 9000; }
  }
  function orbitas(ctx) {
    const { cx, cy, Rx, Ry, k } = lay, usadas = new Set([...cuerpos.values()].map(b => b.g));
    for (const [g, ob] of Object.entries(ORB)) {
      if (g === "muerta" && !usadas.has(g)) continue;
      ctx.beginPath(); ctx.ellipse(cx, cy, Rx * ob.f, Ry * ob.f, 0, 0, TAU);
      ctx.strokeStyle = rgba(ob.color, g === "muerta" ? .18 : .3); ctx.lineWidth = g === "ambar" ? 1.4 : 1;
      ctx.setLineDash(g === "ciudadana" ? [2 * k, 5 * k] : g === "muerta" ? [1, 6 * k] : []); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // Rutas de luz entre VITA y los otros mundos
  function rutas(ctx, t) {
    const { cx, cy, k, mundos } = lay;
    for (const m of mundosActivos()) {
      const p = mundos[m], col = m === "oruz" ? "#62D6B8" : "#7FB2F5", qx = (cx + p.x) / 2 + (p.y - cy) * .18, qy = (cy + p.y) / 2 - (p.x - cx) * .18;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(qx, qy, p.x, p.y);
      ctx.strokeStyle = rgba(col, .07); ctx.lineWidth = 7 * k; ctx.stroke();
      ctx.strokeStyle = rgba(col, .45); ctx.lineWidth = 1.2; ctx.setLineDash([2 * k, 8 * k]); ctx.lineDashOffset = REDUCE ? 0 : -t / 45; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  }
  // La curva entre dos cuerpos: la del hilo de luz de madre a hija, y la que siguen las cartas
  function curva(m, b) {
    const dx = b.x - m.x, dy = b.y - m.y, d = Math.hypot(dx, dy) || 1, k = (b.L.seed % 2 ? 1 : -1) * Math.min(.3 * d, 60 * lay.k);
    return [(m.x + b.x) / 2 - dy / d * k, (m.y + b.y) / 2 + dx / d * k];
  }
  // Hilos de luz: de cada madre a cada hija, con un pulso de luz que viaja hacia la hija
  function hilos(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const b of cuerpos.values()) {
      const m = b.c.parent && cuerpos.get(b.c.parent); if (!m) continue;
      const vivo = b.L.alive && m.L.alive, [qx, qy] = curva(m, b);
      const gr = ctx.createLinearGradient(m.x, m.y, b.x, b.y);
      gr.addColorStop(0, hsl(m.L.hue, 85, 72, vivo ? .75 : .2)); gr.addColorStop(1, hsl(b.L.hue, 85, 72, vivo ? .75 : .2));
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.quadraticCurveTo(qx, qy, b.x, b.y);
      ctx.strokeStyle = gr; ctx.globalAlpha = .18; ctx.lineWidth = 5 * lay.k; ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1.1 * lay.k; ctx.stroke();
      if (!vivo || REDUCE) continue;
      for (let j = 0; j < 4; j++) {
        const u = (((t / 2800 + (b.L.seed % 1000) / 1000) % 1) + 1) % 1 - j * .025; if (u < 0) continue;
        const v = 1 - u, x = v * v * m.x + 2 * v * u * qx + u * u * b.x, y = v * v * m.y + 2 * v * u * qy + u * u * b.y;
        luz(ctx, luzHue(b.L.hue, 90, 80), x, y, (7 - j * 1.4) * lay.k, Math.sin(u * Math.PI) * (1 - j * .22));
      }
    }
    ctx.restore();
  }
  function estrella(ctx, t) {
    const { cx, cy, R } = lay, vivas = W.colonies.filter(c => c.alive), salud = vivas.length ? vivas.reduce((a, c) => a + c.salud, 0) / vivas.length : 50;
    const pulso = 1 + .035 * Math.sin(t / 900);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    luz(ctx, luzHex("#62D6B8"), cx, cy, R * 6.2, .45 + salud / 400); luz(ctx, luzHex("#F0B03F"), cx, cy, R * 3.4, .55);
    ctx.translate(cx, cy);
    for (let capa = 0; capa < 2; capa++) {
      ctx.save(); ctx.rotate(REDUCE ? capa * .4 : (capa ? -t / 30000 : t / 21000) * TAU / 6);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8); const L = R * (capa ? 2.3 : 3.1) * (1 + .12 * Math.sin(t / 700 + i * 1.7)), a = R * (capa ? .12 : .16);
        const gr = ctx.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, `rgba(255,246,214,${capa ? .45 : .6})`); gr.addColorStop(1, "rgba(255,246,214,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -a); ctx.lineTo(L, 0); ctx.lineTo(0, a); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    const g = ctx.createRadialGradient(cx - R * .25, cy - R * .25, R * .1, cx, cy, R * pulso);
    g.addColorStop(0, "#FFFFFF"); g.addColorStop(.45, "#FFF6D6"); g.addColorStop(.82, "#F9CB6B"); g.addColorStop(1, "#E9982C");
    ctx.beginPath(); ctx.arc(cx, cy, R * pulso, 0, TAU); ctx.fillStyle = g; ctx.fill();
  }
  // Oruz: el mapa de sus siete regiones gira como un planeta visto desde el polo
  function oruz(ctx, t) {
    const O = W.oruz, p = lay.mundos.oruz, P = lay.P;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex("#62D6B8"), p.x, p.y, P * 2.1, .5); ctx.restore();
    if (O.fenomeno?.k === "aurora") aurora(ctx, p.x, p.y, P, t);
    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, P, 0, TAU); ctx.clip();
    ctx.fillStyle = "#10261F"; ctx.fillRect(p.x - P, p.y - P, P * 2, P * 2);
    const S = P * .52, rot = REDUCE ? 0 : t / 120000 * TAU;
    ctx.translate(p.x, p.y); ctx.rotate(rot);
    for (const c of mosaico(O.regions, S)) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); ctx.lineTo(c.x + c.s * Math.cos(a), c.y + c.s * Math.sin(a)); }
      ctx.closePath(); ctx.fillStyle = c.col; ctx.fill();
      if (c.borde) { ctx.strokeStyle = "rgba(6,20,16,.5)"; ctx.lineWidth = .8; ctx.stroke(); }
    }
    if (O.fenomeno?.k === "tormenta") { ctx.fillStyle = "rgba(40,50,70,.35)"; ctx.beginPath(); ctx.arc(S * .6, -S * .3, S * .9, 0, TAU); ctx.fill(); }
    ctx.setTransform(s.d, 0, 0, s.d, 0, 0);
    sombraEsfera(ctx, p.x, p.y, P);
    ctx.restore();
    ctx.strokeStyle = "rgba(98,214,184,.6)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, P, 0, TAU); ctx.stroke();
  }
  // Hexágonos chicos del mapa de Oruz: cada uno toma el color de su región, con un poco de relieve
  let mosaicoCache = null;
  function mosaico(regions, S) {
    const key = S.toFixed(2) + regions.map(R => R.color + (R.eq ?? .5).toFixed(2)).join();
    if (mosaicoCache?.key === key) return mosaicoCache.cells;
    const s2 = S / 2.6, cen = regions.map(R => ({ R, x: S * Math.sqrt(3) * (R.q + R.r / 2), y: S * 1.5 * R.r })), rnd = rng(77), cells = [];
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      if (Math.abs(q + r) > 6) continue;
      const x = s2 * Math.sqrt(3) * (q + r / 2), y = s2 * 1.5 * r; if (Math.hypot(x, y) > S * 2.1) continue;
      const orden = cen.map(c => ({ c, d: Math.hypot(c.x - x, c.y - y) })).sort((a, b) => a.d - b.d), R = orden[0].c.R, j = rnd();
      cells.push({ x, y, s: s2 - .4, col: rgba(R.color, (.45 + .45 * (R.eq ?? .5)) * (.8 + j * .3)), borde: orden[1] && orden[1].d - orden[0].d < s2 * 1.2 });
    }
    mosaicoCache = { key, cells };
    return cells;
  }
  function aurora(ctx, x, y, P, t) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = [`rgba(98,214,184,.35)`, `rgba(195,139,242,.3)`, `rgba(111,168,245,.25)`][i]; ctx.lineWidth = P * (.16 - i * .03);
      ctx.beginPath(); ctx.arc(x, y, P * (1.18 + i * .1), Math.PI * 1.1 + Math.sin(t / 1800 + i) * .1, Math.PI * 1.9 + Math.sin(t / 2100 + i) * .1); ctx.stroke();
    }
    ctx.restore();
  }
  function sombraEsfera(ctx, x, y, P) {
    const g = ctx.createRadialGradient(x - P * .4, y - P * .45, P * .15, x, y, P * 1.05);
    g.addColorStop(0, "rgba(255,255,255,.14)"); g.addColorStop(.5, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,4,10,.62)");
    ctx.fillStyle = g; ctx.fillRect(x - P, y - P, P * 2, P * 2);
  }
  function ambarEnOrbita(ctx, t) {
    const lib = W.oruz?.libres || [], p = lay.mundos.oruz, P = lay.P;
    return lib.map((q, i) => {
      const a = (REDUCE ? 0 : t / 16000 * TAU) + i * TAU / lib.length, x = p.x + Math.cos(a) * P * 1.5, y = p.y + Math.sin(a) * P * .5;
      return { y, f: () => gema(ctx, x, y, 3.4 * lay.k * (1 + .15 * Math.sin(a)), TONO_AMBAR[q.tono] || "#F0B03F", t + i * 500) };
    });
  }
  function gema(ctx, x, y, r, col, t) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex(col), x, y, r * 3.2, .55 + .25 * Math.sin(t / 500)); ctx.restore();
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.moveTo(x - r * .5, y - r * .1); ctx.lineTo(x, y - r * .75); ctx.lineTo(x + r * .1, y - r * .1); ctx.closePath(); ctx.fill();
  }
  // Lumar: un océano con las corrientes de sus regiones, su luna en la fase de hoy y las perlas libres
  function lumar(ctx, t) {
    const L = W.lumar, p = lay.mundos.lumar, P = lay.P;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex("#7FB2F5"), p.x, p.y, P * 2.1, .5); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, P, 0, TAU); ctx.clip();
    const base = ctx.createLinearGradient(p.x, p.y - P, p.x, p.y + P); base.addColorStop(0, "#0F4A7A"); base.addColorStop(1, "#061A33");
    ctx.fillStyle = base; ctx.fillRect(p.x - P, p.y - P, P * 2, P * 2);
    const S = P * .52, rot = REDUCE ? 0 : -t / 150000 * TAU;
    ctx.translate(p.x, p.y); ctx.rotate(rot);
    for (const R of L.regions) {
      const hx = S * Math.sqrt(3) * (R.q + R.r / 2), hy = S * 1.5 * R.r, g = ctx.createRadialGradient(hx, hy, 0, hx, hy, S * 1.1);
      g.addColorStop(0, rgba(R.color, .35 + .4 * (R.eq ?? .5))); g.addColorStop(1, rgba(R.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, S * 1.1, 0, TAU); ctx.fill();
    }
    ctx.setTransform(s.d, 0, 0, s.d, 0, 0);
    ctx.strokeStyle = "rgba(220,240,255,.16)"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y0 = p.y - P * .6 + i * P * .4; ctx.beginPath();
      for (let x = -P; x <= P; x += 3) ctx.lineTo(p.x + x, y0 + Math.sin(x / (P * .25) + (REDUCE ? 0 : t / 900) + i) * P * .04);
      ctx.stroke();
    }
    sombraEsfera(ctx, p.x, p.y, P);
    ctx.restore();
    ctx.strokeStyle = "rgba(127,178,245,.65)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, P, 0, TAU); ctx.stroke();
    // la luna de Lumar, con la fase de hoy
    const lu = L.luna; if (!lu) return;
    const a = (REDUCE ? -.6 : t / 40000 * TAU), mr = P * .3, mx = p.x + Math.cos(a) * P * 1.72, my = p.y + Math.sin(a) * P * .62;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex("#F3EFD8"), mx, my, mr * 3, .25 + lu.ilum * .35); ctx.restore();
    luna(ctx, mx, my, mr, lu.fase, o.sur);
  }
  function perlasEnOrbita(ctx, t) {
    const lib = W.lumar?.libres || [], p = lay.mundos.lumar, P = lay.P;
    return lib.map((q, i) => {
      const a = (REDUCE ? 0 : -t / 19000 * TAU) + i * TAU / lib.length, x = p.x + Math.cos(a) * P * 1.32, y = p.y + Math.sin(a) * P * .42;
      return { y, f: () => { const r = 2.8 * lay.k, col = PERLA[q.color] || "#F4F1EA"; ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex(col), x, y, r * 3.4, .5); ctx.restore(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .32, 0, TAU); ctx.fill(); } };
    });
  }
  function colonia(ctx, b, t) {
    const L = b.L, r = b.r, per = 3200 + L.seed % 3000, parpadeo = !REDUCE && (t + L.seed % 5000) % per < 140;
    if (L.alive) { ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHue(L.hue, 85, 65), b.x, b.y, r * 2.2, L.rank === "ambar" ? .55 : .35); ctx.restore(); }
    ctx.globalAlpha = L.alive ? 1 : .7;
    mini(ctx, b.x, b.y, r, L, { t, mira: b.mira, parpadeo });
    ctx.globalAlpha = 1;
    if (b.id === sel) {
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]); ctx.lineDashOffset = REDUCE ? 0 : -t / 90;
      ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.85 + Math.sin(t / 400) * 1.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  }

  // ---------- la cría del jugador ----------
  // Gira alrededor de su colonia hogar y, si salió de excursión, alrededor de la colonia que visita
  function posCria(t) {
    const K = W.cria; if (!K?.etapa) return null;
    const fuera = !!(K.excursion && K.excursion.vuelveEn > 0);
    const host = fuera ? [...cuerpos.values()].find(b => b.c.name === K.excursion.name) : K.hogar && cuerpos.get(K.hogar.id);
    const img = host && imagenCria(K, false, () => loop.ahora()); if (!img) return null;
    const a = REDUCE ? 2.4 : t / 6500 * TAU, rr = host.r + 15 * lay.k;
    return { x: host.x + Math.cos(a) * rr, y: host.y + Math.sin(a) * rr * .5, S: 40 * lay.k * (1 + .1 * Math.sin(a)), img, host, fuera, hue: K.ap?.hue ?? 160 };
  }
  function pintarCria(ctx, p) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHue(p.hue, 90, 72), p.x, p.y, p.S * .42, .6); ctx.restore();
    ctx.drawImage(p.img, p.x - p.S / 2, p.y - p.S * .57, p.S, p.S);
  }
  // De excursión: una línea de puntos une su hogar con la colonia que visita
  function viajeCria(ctx, t) {
    const p = criaPos, casa = p?.fuera && W.cria.hogar && cuerpos.get(W.cria.hogar.id);
    if (!casa || casa === p.host) return;
    ctx.save(); ctx.strokeStyle = hsl(p.hue, 90, 75, .6); ctx.lineWidth = 1.3; ctx.lineCap = "round";
    ctx.setLineDash([.5, 6 * lay.k]); ctx.lineDashOffset = REDUCE ? 0 : -t / 70;
    ctx.beginPath(); ctx.moveTo(casa.x, casa.y); ctx.lineTo(p.host.x, p.host.y); ctx.stroke(); ctx.restore();
  }

  // ---------- cartas de la familia ----------
  // Cada carta viaja como un sobre de luz desde quien la escribe (VITA o una colonia) hasta la colonia que la recibe;
  // entre madre e hija va por su hilo. Al abrir la página se ven llegar las tres últimas y después cada carta nueva.
  function nuevasCartas() {
    if (!Array.isArray(W.cartas)) return;
    const primera = !cartasVistas, vistas = cartasVistas || new Set();
    const nuevas = W.cartas.filter(k => k?.id && !vistas.has(k.id) && cuerpos.has(k.a) && (k.de === "VITA" || cuerpos.has(k.de)));
    cartasVistas = new Set(W.cartas.map(k => k?.id));
    if (REDUCE) return;
    nuevas.slice(0, primera ? 3 : 6).reverse().forEach((k, i) => cartas.push({ de: k.de, a: k.a, t0: tAhora + 700 + i * 1500 }));
  }
  function sobres(ctx, t) {
    for (const c of cartas) {
      if (t < c.t0) continue;
      const A = c.de === "VITA" ? { x: lay.cx, y: lay.cy } : cuerpos.get(c.de), B = cuerpos.get(c.a);
      if (!A || !B || A === B) { c.fin = true; continue; }
      c.dur ||= 2400 + Math.hypot(B.x - A.x, B.y - A.y) * 7;
      const p = (t - c.t0) / c.dur, hue = A.L ? A.L.hue : null, col = hue == null ? "#F0B03F" : hsl(hue, 85, 70), img = hue == null ? luzHex("#F0B03F") : luzHue(hue, 90, 75);
      if (p >= 1) { // llegó: un anillo de luz en la colonia que la recibe
        const q = (t - c.t0 - c.dur) / 900; if (q >= 1) { c.fin = true; continue; }
        ctx.strokeStyle = col; ctx.globalAlpha = (1 - q) * .8; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(B.x, B.y, B.r * (1.2 + 1.4 * q), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        continue;
      }
      // de hija a madre, el sobre recorre el mismo hilo al revés
      const inv = A.c?.parent === B.id, [qx, qy] = inv ? curva(B, A) : curva(A, B), P0 = inv ? B : A, P2 = inv ? A : B;
      const en = u => { const v = 1 - u; return [v * v * P0.x + 2 * v * u * qx + u * u * P2.x, v * v * P0.y + 2 * v * u * qy + u * u * P2.y]; };
      const e = p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2, a = Math.min(1, p * 8, (1 - p) * 8);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let j = 1; j <= 4; j++) { const u = Math.max(0, e - j * .025), [x, y] = en(inv ? 1 - u : u); luz(ctx, img, x, y, (5 - j) * 1.6 * lay.k, a * (.5 - j * .1)); }
      const [x, y] = en(inv ? 1 - e : e);
      luz(ctx, img, x, y, 12 * lay.k, a * .7); ctx.restore();
      sobre(ctx, x, y + Math.sin(t / 260) * 1.2, 7 * lay.k, col, a);
    }
    cartas = cartas.filter(c => !c.fin);
  }
  function sobre(ctx, x, y, s, col, a) {
    const w = s * 1.5, h = s;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y);
    ctx.fillStyle = "#FFF6E2"; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(0, h * .12); ctx.lineTo(w / 2, -h / 2); ctx.stroke();
    ctx.restore();
  }

  function texto(ctx, str, x, y, font, color, align = "center") {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "top";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(3,8,16,.85)"; ctx.lineJoin = "round"; ctx.strokeText(str, x, y);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function etiquetas(ctx) {
    const { k, cx, cy, R, mundos, P, ancho } = lay, f1 = `700 ${Math.round(12.5 * Math.min(k, 1.15))}px ${FONT.t}`, f2 = `${Math.round(10 * Math.min(k, 1.15))}px ${FONT.m}`;
    texto(ctx, "VITA", cx, cy + R * 1.35, `800 ${Math.round(13 * Math.min(k, 1.2))}px ${FONT.t}`, "#FFF4CF");
    const info = {
      oruz: W.oruz && [W.oruz.name || "Oruz", [W.oruz.cal?.estacion, (W.oruz.libres || []).length && `${W.oruz.libres.length} Ámbar libre${W.oruz.libres.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ")],
      lumar: W.lumar && [W.lumar.name || "Lumar", W.lumar.luna ? W.lumar.luna.name.toLowerCase() : ""],
    };
    for (const m of mundosActivos()) {
      const p = mundos[m], [nom, sub] = info[m], col = m === "oruz" ? "#9EEBD8" : "#AFCBF5";
      if (p.lado === "abajo") { texto(ctx, nom, p.x, p.y + P * 1.25, f1, col); if (sub) texto(ctx, sub, p.x, p.y + P * 1.25 + 16 * Math.min(k, 1.15), f2, "rgba(170,195,203,.95)"); }
      else {
        const al = p.lado === "der" ? "left" : "right", x = p.x + (p.lado === "der" ? P * 1.3 : -P * 1.3), y = p.y - 13;
        texto(ctx, nom, x, y, f1, col, al); if (sub) texto(ctx, sub, x, y + 16 * Math.min(k, 1.15), f2, "rgba(170,195,203,.95)", al);
      }
    }
    // nombres: todas si hay sitio, y siempre la elegida
    for (const b of cuerpos.values()) {
      if (!(ancho && s.w >= 640) && b.id !== sel) continue;
      texto(ctx, b.c.name, b.x, b.y + b.r * 1.45 + (b.L.rank === "ambar" ? 2 : 0), b.id === sel ? `700 ${Math.round(11.5 * Math.min(k, 1.15))}px ${FONT.t}` : `${Math.round(10 * Math.min(k, 1.15))}px ${FONT.m}`, b.id === sel ? "#FFFFFF" : "rgba(214,228,232,.8)");
    }
  }

  // ---------- toques ----------
  function queHay(x, y) {
    let best = null, bd = Infinity;
    const probar = (k, id, px, py, r) => { const d = Math.hypot(px - x, py - y); if (d < r && d < bd) { bd = d; best = { k, id }; } };
    for (const b of cuerpos.values()) probar("colonia", b.id, b.x, b.y, b.r + 12);
    if (criaPos) probar("cria", null, criaPos.x, criaPos.y, criaPos.S * .3 + 6);
    if (!lay) return best;
    probar("vita", null, lay.cx, lay.cy, lay.R * 1.6);
    for (const m of mundosActivos()) probar(m, null, lay.mundos[m].x, lay.mundos[m].y, lay.P * 1.25);
    return best;
  }
  function punto(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener("click", e => {
    const hit = queHay(...punto(e));
    if (!hit) return cerrarTip();
    if (hit.k === "colonia" && hit.id !== sel) o.onSelect?.(hit.id);
    abrirTip(hit);
  });
  cv.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; const h = !!queHay(...punto(e)); if (h !== hover) { hover = h; cv.style.cursor = h ? "pointer" : "default"; } });
  tip?.addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) o.onIr?.(b.dataset.ir); });
  function abrirTip(hit) { if (!tip) return; tipK = hit; pintarTip(); }
  function cerrarTip() { tipK = null; if (tip) tip.hidden = true; }
  function pintarTip() {
    if (!tip || !tipK || !W) return;
    let html = "";
    if (tipK.k === "colonia") {
      const c = W.colonies.find(x => x.id === tipK.id); if (!c) return cerrarTip();
      const madre = c.parent && W.colonies.find(x => x.id === c.parent), est = W.oruz?.estado?.[c.id]?.estado;
      html = `<div><b>${esc(c.name)}</b>${c.alive && c.rango ? ` <span class="rk rk-${esc(c.rango.k)}">${esc(c.rango.rango)}</span>` : ""}</div>
        <p>${c.alive ? `${c.cells} células · salud ${c.salud} · gen ${c.gen}` : "Extinta: duerme hasta que otra colonia pueda donarle células."}</p>
        <p>${madre ? `hija de ${esc(madre.name)}` : "fundadora"}${c.event ? ` · ${esc(c.event)}` : ""}${est === "aprendiz" ? " · estudia en Oruz" : ""}</p>
        <button class="sm primary" data-ir="colonia">Ver su mini mundo</button>`;
    } else if (tipK.k === "vita") {
      const v = W.colonies.filter(c => c.alive), n = k => v.filter(c => (c.rango?.k || "ciudadana") === k).length;
      html = `<div><b>VITA</b> <span class="note">la ley máxima</span></div><p>${v.length} colonias vivas: ${n("ambar")} en Ámbar, ${n("oruz")} en Oruz y ${n("ciudadana")} ciudadanas.</p><button class="sm" data-ir="rangos">Ver los rangos</button>`;
    } else if (tipK.k === "oruz") {
      const O = W.oruz, apr = (O.escuela || []).length, n = (O.libres || []).length;
      html = `<div><b>Oruz</b> <span class="note">el mundo paralelo</span></div><p>${O.cal ? `Estación de ${esc(O.cal.estacion)}. ` : ""}${n ? `${n} pieza${n > 1 ? "s" : ""} de Ámbar esperan dueño` : "No hay Ámbar libre ahora"} y ${apr ? `${apr} aprendiz${apr > 1 ? "es estudian" : " estudia"} en su escuela` : "su escuela está vacía"}.</p><button class="sm" data-ir="oruz">Ir a Oruz</button>`;
    } else if (tipK.k === "lumar") {
      const L = W.lumar, lu = L.luna;
      const n = (L.libres || []).length;
      html = `<div><b>Lumar</b> <span class="note">el mar de la luna</span></div><p>${lu ? `${esc(lu.name)}, ${Math.round(lu.ilum * 100)}% iluminada. ` : ""}${n ? `${n} perla${n > 1 ? "s esperan" : " espera"} en el mar.` : "No hay perlas libres ahora."}</p><button class="sm" data-ir="lumar">Ir a Lumar</button>`;
    } else if (tipK.k === "cria") {
      const K = W.cria; if (!K?.etapa) return cerrarTip();
      const fuera = K.excursion && K.excursion.vuelveEn > 0;
      html = `<div><b>${esc(K.nombre)}</b> <span class="note">tu cría · ${esc(String(K.etapaName || "").toLowerCase())}</span></div><p>${fuera ? `Está de excursión en ${esc(K.excursion.name)}.` : K.hogar ? `Vive en ${esc(K.hogar.name)}.` : ""}</p><button class="sm primary" data-ir="cria">Ver tu cría</button>`;
    }
    tip.innerHTML = html; tip.hidden = false; moverTip();
  }
  function moverTip() {
    if (!tip || tip.hidden || !tipK || !lay) return;
    let x, y, r;
    if (tipK.k === "colonia") { const b = cuerpos.get(tipK.id); if (!b) return cerrarTip(); x = b.x; y = b.y; r = b.r * 1.9; }
    else if (tipK.k === "vita") { x = lay.cx; y = lay.cy; r = lay.R * 1.4; }
    else if (tipK.k === "cria") { if (!criaPos) return cerrarTip(); x = criaPos.x; y = criaPos.y; r = criaPos.S * .35; }
    else { const p = lay.mundos[tipK.k]; x = p.x; y = p.y; r = lay.P * 1.2; }
    const tw = tip.offsetWidth, th = tip.offsetHeight, abajo = y + r + th + 8 < s.h;
    const left = clamp(x - tw / 2, 8, s.w - tw - 8), top = abajo ? y + r + 6 : Math.max(8, y - r - th - 6);
    tip.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  }

  function describir() {
    const v = W.colonies.filter(c => c.alive), by = k => v.filter(c => (c.rango?.k || "ciudadana") === k).map(c => c.name);
    const col = v.length === 1 ? "1 colonia" : `${v.length} colonias`;
    const partes = [`Galaxia VITA: ${col} ${v.length === 1 ? "viva" : "vivas"} alrededor de la estrella VITA`];
    if (by("ambar").length) partes.push(`en la órbita de Ámbar ${by("ambar").join(", ")}`);
    if (by("oruz").length) partes.push(`en la órbita de Oruz ${by("oruz").join(", ")}`);
    const m = mundosActivos(); if (m.length) partes.push(`planetas ${m.map(x => x === "oruz" ? "Oruz" : "Lumar").join(" y ")}`);
    cv.setAttribute("aria-label", partes.join("; ") + ". Toca una colonia o un planeta.");
    if (o.info) o.info.textContent = `${col} · ${m.length + 1} mundos`;
  }

  return {
    datos(w, s2) {
      W = w; sel = s2;
      if (!W?.colonies) return;
      asignar(); describir(); nuevasCartas();
      if (tipK) pintarTip();
      loop.ahora(); loop.pedir();
    },
  };
}

// ---------- la cría del jugador, dibujada por public/cria-arte.js ----------
// Su SVG se convierte en imagen una vez por aspecto. Sin CriaArte (o si falla) no se dibuja y nada más cambia.
const criaImgs = new Map();
function imagenCria(K, dormida, listo) {
  const arte = window.CriaArte; if (!arte?.cria || !K?.etapa) return null;
  const key = JSON.stringify([K.ap, K.etapa, K.rasgos, K.primera, K.humor, !!dormida]);
  let e = criaImgs.get(key);
  if (!e) {
    if (criaImgs.size > 8) criaImgs.clear();
    e = { img: new Image(), ok: false, avisar: new Set() };
    criaImgs.set(key, e);
    e.img.onload = () => { e.ok = true; for (const f of e.avisar) f(); e.avisar.clear(); };
    e.img.onerror = () => { e.fallo = true; e.avisar.clear(); };
    try { // sin su sombra: en la galaxia flota y en el mini mundo se pinta aparte
      const svg = arte.cria(K, { anim: false, dormida: !!dormida, label: "Cría de VITA" }).replace(/<ellipse class="cr-sombra"[^>]*\/>/, "");
      e.img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (err) { console.error("[galaxia] cría", err); }
  }
  if (!e.ok && !e.fallo && listo && e.avisar.size < 4) e.avisar.add(listo);
  return e.ok ? e.img : null;
}

// ---------- el mini mundo de una colonia ----------
// Cada célula es una criatura mini sobre el planeta de su colonia: comunes redondas, raras con antena,
// épicas de cristal y legendarias con forma de estrella. El cielo sigue la hora y el clima de la colonia,
// y las esporas doradas caen flotando: tócalas para minar VIT.
const TIPOS = 4, VARIANTES = 3;
function mundoColonia(cv, o = {}) {
  let C = null, W = null, L = null, lookKey = "", spr = null, estrellas = [], nubes = [];
  const bichos = new Map();
  let esporas = [], chispas = [], gotas = [], proxima = 2500;
  let criaP = null, criaSalto = -1e9, corazones = [], tAhora = 0;
  const s = lienzo(cv, () => { preparar(true); loop.ahora(); });
  const loop = bucle(cv, cuadro);

  function preparar(tam) {
    if (!s.w) return;
    const R = rng(hashStr(C?.id || "x"));
    if (tam || !estrellas.length) { estrellas = Array.from({ length: Math.round(s.w * s.h / 700) }, () => ({ x: R() * s.w, y: R() * s.h * .7, r: .3 + R() ** 2 * 1.3, ph: R() * TAU })); }
    if (tam || !nubes.length) { nubes = Array.from({ length: 7 }, (_, i) => ({ x: R() * s.w, y: s.h * (.08 + R() * .28), s: .6 + R() * .8, v: 4 + R() * 7, i })); }
    if (L && (tam || !spr)) spr = criaturas(L, s.d, base());
  }
  const base = () => clamp(s.w / 34, 11, 19);
  const suelo = () => { const R = s.w * 1.15; return { R, x: s.w / 2, y: s.h * .66 + R }; };

  function cuadro(t, dt) {
    tAhora = t;
    if (!s.w) return;
    const ctx = s.ctx, { w, h } = s, hora = minuto() / 60, noche = oscuridad(hora), cl = clima(), muerta = C && C.alive === false;
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    cielo(ctx, hora, muerta, cl);
    if (noche > .05) for (const st of estrellas) { ctx.globalAlpha = noche * (.35 + .65 * (.5 + .5 * Math.sin(t / 900 + st.ph))); ctx.fillStyle = "#EAF2FF"; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    astros(ctx, hora, noche);
    nubesYLluvia(ctx, t, dt, cl, muerta);
    if (!L) return;
    const g = suelo();
    terreno(ctx, g, t, muerta);
    if (!muerta) criaturasEnSuelo(ctx, g, t, dt, noche);
    criaP = muerta ? null : criaEnSuelo(ctx, g, t);
    if (L.event === "helada" || (cl.nieve && !muerta)) copos(ctx, t);
    if (L.event === "plaga" && !muerta) motas(ctx, g, t);
    if (!muerta) esporasDoradas(ctx, g, t, dt);
    for (const c of chispas) { c.vida += dt; const u = c.vida / 700; ctx.globalAlpha = Math.max(0, 1 - u); ctx.fillStyle = "#FFD978"; ctx.beginPath(); ctx.arc(c.x + c.vx * u * 30, c.y + c.vy * u * 30, 2.2 * (1 - u) + .4, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1; chispas = chispas.filter(c => c.vida < 700);
    for (const c of corazones) { c.vida += dt; if (c.vida < 0) continue; const u = c.vida / 1100; ctx.globalAlpha = Math.max(0, 1 - u); corazon(ctx, c.x + Math.sin(u * 6 + c.ph) * 5, c.y - u * 34, c.s, "#F47A9B"); }
    ctx.globalAlpha = 1; corazones = corazones.filter(c => c.vida < 1100);
  }
  const minuto = () => C?.minuto ?? W?.minuto ?? ((480 + (W?.tick || 0) * 10) % 1440);
  const oscuridad = hr => { const sol = Math.sin((hr - 6) / 12 * Math.PI); return clamp(.55 - sol * 1.6, 0, 1); };
  function clima() {
    const x = W?.weather || {}, nub = clamp((1 - (x.luz ?? .9)) / .6, 0, 1);
    return { nub, lluvia: x.lluvia || 0, nieve: (x.lluvia || 0) > 0 && (x.temp ?? 10) < 1.5 };
  }
  // Colores del cielo según la hora: noche, amanecer, día y atardecer
  const CIELO = [[0, "#030814", "#0B1631"], [5, "#08112C", "#1B2A55"], [6.6, "#2A2F6A", "#E7936B"], [8.2, "#1B5A88", "#6FB0BE"], [13, "#17689C", "#7FC6CD"], [18, "#2A5B8C", "#E3A06E"], [19.6, "#2A2258", "#D8675A"], [21, "#0B1230", "#1B2350"], [24, "#030814", "#0B1631"]];
  function mezcla(a, b, u) { const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u)).join(",")})`; }
  function cielo(ctx, hr, muerta, cl) {
    let i = 0; while (i < CIELO.length - 2 && CIELO[i + 1][0] <= hr) i++;
    const [h0, a0, b0] = CIELO[i], [h1, a1, b1] = CIELO[i + 1], u = clamp((hr - h0) / (h1 - h0), 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, s.h);
    g.addColorStop(0, mezcla(a0, a1, u)); g.addColorStop(1, mezcla(b0, b1, u));
    ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
    const gris = (muerta ? .55 : 0) + cl.nub * .35 + (L?.event === "sequia" ? .1 : 0);
    if (gris > 0) { ctx.fillStyle = L?.event === "sequia" ? `rgba(150,95,50,${gris * .5})` : `rgba(40,48,58,${gris})`; ctx.fillRect(0, 0, s.w, s.h); }
  }
  function astros(ctx, hr, noche) {
    const { w, h } = s;
    if (hr >= 6 && hr <= 20) {
      const u = (hr - 6) / 14, x = w * (.08 + .84 * u), y = h * (.5 - .4 * Math.sin(u * Math.PI));
      ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex("#FFD98A"), x, y, h * .22, .8); ctx.restore();
      ctx.fillStyle = "#FFF3C8"; ctx.beginPath(); ctx.arc(x, y, h * .045, 0, TAU); ctx.fill();
    }
    if (noche > .3) {
      const hh = hr < 12 ? hr + 24 : hr, u = clamp((hh - 19) / 11, 0, 1), x = w * (.1 + .8 * u), y = h * (.45 - .33 * Math.sin(u * Math.PI));
      ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex("#F3EFD8"), x, y, h * .13, .45 * noche); ctx.restore();
      ctx.globalAlpha = Math.min(1, noche * 1.4); luna(ctx, x, y, h * .045, W?.lumar?.luna?.fase ?? .5, o.sur); ctx.globalAlpha = 1;
    }
  }
  function nubesYLluvia(ctx, t, dt, cl, muerta) {
    const n = Math.round(cl.nub * 6 + (cl.lluvia ? 1 : 0));
    for (const nu of nubes.slice(0, n)) {
      nu.x += nu.v * dt / 1000; if (nu.x - 90 * nu.s > s.w) nu.x = -90 * nu.s;
      const img = luzHex(cl.lluvia || muerta ? "#7E8A96" : "#EEF4F8");
      for (const [dx, dy, r] of [[0, 0, 34], [26, -9, 28], [48, 3, 24], [-24, 5, 22], [12, 8, 26]]) luz(ctx, img, nu.x + dx * nu.s, nu.y + dy * nu.s, r * nu.s, cl.lluvia || muerta ? .75 : .55);
    }
    if (!cl.lluvia || cl.nieve || REDUCE) return;
    const quiero = Math.round(30 + cl.lluvia * 110);
    while (gotas.length < quiero) gotas.push({ x: Math.random() * s.w * 1.2, y: Math.random() * s.h, v: 380 + Math.random() * 220 });
    ctx.strokeStyle = "rgba(190,215,235,.45)"; ctx.lineWidth = 1; ctx.beginPath();
    for (const d of gotas) { d.y += d.v * dt / 1000; d.x -= d.v * .18 * dt / 1000; if (d.y > s.h) { d.y = -10; d.x = Math.random() * s.w * 1.2; } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 2.2, d.y - 11); }
    ctx.stroke();
  }
  function copos(ctx, t) {
    ctx.fillStyle = "rgba(240,248,255,.8)";
    for (let i = 0; i < 40; i++) { const x = (i * 97.3 + Math.sin(t / 1300 + i) * 18 + t * .012 * (i % 3 + 1)) % (s.w + 20) - 10, y = (i * 53.7 + t * .03 * (1 + i % 4) / 2) % s.h; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * .6, 0, TAU); ctx.fill(); }
  }
  function motas(ctx, g, t) {
    ctx.fillStyle = "rgba(176,96,230,.55)";
    for (let i = 0; i < 18; i++) { const x = (i * 71.1 + Math.sin(t / 900 + i) * 20) % s.w, y = g.y - g.R - 8 - (i * 13.7 + t * .01) % (s.h * .35); ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
  }
  // El suelo es el mini planeta de la colonia: el mismo color y el mismo dibujo que en la galaxia
  function terreno(ctx, g, t, muerta) {
    const H = L.hue, S = muerta ? 6 : L.sat * .75, Li = muerta ? 26 : L.lig - 16;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const at = ctx.createRadialGradient(g.x, g.y, g.R * .985, g.x, g.y, g.R * 1.09);
    at.addColorStop(0, hsl(H, 80, 72, muerta ? .08 : .35)); at.addColorStop(1, hsl(H, 80, 72, 0));
    ctx.fillStyle = at; ctx.fillRect(0, 0, s.w, s.h); ctx.restore();
    const gr = ctx.createRadialGradient(g.x - g.R * .2, g.y - g.R, g.R * .05, g.x, g.y - g.R * .55, g.R * .75);
    gr.addColorStop(0, hsl(H, S, Li + 16)); gr.addColorStop(1, hsl(H, S * .8, Li - 12));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.x, g.y, g.R, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(g.x, g.y, g.R, 0, TAU); ctx.clip();
    // bandas y cráteres del genoma, y flores si la colonia está en floración
    ctx.strokeStyle = hsl(L.hue2, S, Li + 8, .25); ctx.lineWidth = s.h * .05;
    for (let i = 0; i < L.bands; i++) { ctx.beginPath(); ctx.arc(g.x, g.y, g.R - s.h * (.06 + i * .09), 0, TAU); ctx.stroke(); }
    const R = rng(L.seed + 7);
    for (let i = 0; i < 9 + L.spots * 2; i++) {
      const a = (R() - .5) * 1.1, d = s.h * (.03 + R() * .28), x = g.x + Math.sin(a) * (g.R - d), y = g.y - Math.cos(a) * (g.R - d), r = s.h * (.012 + R() * .025);
      ctx.fillStyle = hsl(L.hue2, S, Li + 18, .35); ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * .6, a, 0, TAU); ctx.fill();
      if (L.event === "floracion" && !muerta && i % 2 === 0) flor(ctx, x, y - r, r * 1.2);
    }
    if (L.event === "helada" && !muerta) { ctx.strokeStyle = "rgba(225,242,255,.7)"; ctx.lineWidth = s.h * .025; ctx.beginPath(); ctx.arc(g.x, g.y, g.R - ctx.lineWidth / 2, 0, TAU); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = hsl(H, 70, 80, muerta ? .15 : .5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(g.x, g.y, g.R, 0, TAU); ctx.stroke();
  }

  // Criaturas pintadas una vez por colonia (4 tipos × 3 tonos × ojos abiertos/cerrados)
  function criaturas(L, d, b) {
    const P = Math.ceil(b * 2 * d), out = [];
    for (let tipo = 0; tipo < TIPOS; tipo++) for (let v = 0; v < VARIANTES; v++) for (let cerr = 0; cerr < 2; cerr++) {
      const c = document.createElement("canvas"); c.width = c.height = P;
      const g = c.getContext("2d"); g.scale(P / 40, P / 40); criatura(g, tipo, v, !!cerr, L); out.push(c);
    }
    return out;
  }
  const idx = (tipo, v, cerr) => (tipo * VARIANTES + v) * 2 + (cerr ? 1 : 0);
  // Dibuja una criatura en una caja de 40×40, con los pies en y = 36
  function criatura(g, tipo, v, cerr, L) {
    const H = (L.hue + (v - 1) * 14 + 360) % 360, Li = L.lig + (v - 1) * 8, cuerpo = (path, c0, c1, glow) => {
      if (glow) { g.save(); g.globalCompositeOperation = "lighter"; const gl = g.createRadialGradient(20, 22, 2, 20, 22, 20); gl.addColorStop(0, glow); gl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gl; g.fillRect(0, 0, 40, 40); g.restore(); }
      const gr = g.createRadialGradient(15, 17, 1, 20, 24, 15); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      path(); g.fillStyle = gr; g.fill();
    };
    if (tipo === 0 || tipo === 1) {
      g.fillStyle = "rgba(8,16,20,.55)"; for (const x of [15, 25]) { g.beginPath(); g.ellipse(x, 35.5, 3.2, 1.6, 0, 0, TAU); g.fill(); }
      if (tipo === 1) { g.strokeStyle = "#9CC4F7"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(20, 16); g.quadraticCurveTo(21, 9, 26, 6); g.stroke(); const gl = g.createRadialGradient(26, 6, 0, 26, 6, 6); gl.addColorStop(0, "rgba(160,205,255,1)"); gl.addColorStop(1, "rgba(111,168,245,0)"); g.fillStyle = gl; g.fillRect(18, -2, 16, 16); g.fillStyle = "#EAF3FF"; g.beginPath(); g.arc(26, 6, 2, 0, TAU); g.fill(); }
      cuerpo(() => { g.beginPath(); g.ellipse(20, 25, 11.5, 10.5, 0, 0, TAU); }, hsl(H, L.sat, Math.min(90, Li + 24)), hsl(H, L.sat, Li - 14));
      if (tipo === 1) { g.strokeStyle = "rgba(111,168,245,.9)"; g.lineWidth = 1.3; g.stroke(); }
      ojos(g, 20, 24, 3.2, cerr);
    } else if (tipo === 2) {
      cuerpo(() => { g.beginPath(); g.moveTo(20, 8); g.lineTo(31, 22); g.lineTo(20, 36); g.lineTo(9, 22); g.closePath(); }, "#F1E2FF", "#8C52D6", "rgba(195,139,242,.7)");
      g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = .8; g.beginPath(); g.moveTo(9, 22); g.lineTo(31, 22); g.moveTo(20, 8); g.lineTo(16, 22); g.lineTo(20, 36); g.stroke();
      ojos(g, 20, 25, 2.8, cerr);
    } else {
      cuerpo(() => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.2 : 14; g.lineTo(20 + Math.cos(a) * r, 23 + Math.sin(a) * r); } g.closePath(); }, "#FFF6D2", "#E39A22", "rgba(240,176,63,.85)");
      g.strokeStyle = "rgba(255,230,160,.9)"; g.lineWidth = 1.2; g.beginPath(); g.ellipse(20, 5.5, 6, 1.8, 0, 0, TAU); g.stroke();
      ojos(g, 20, 24, 2.7, cerr);
    }
  }
  function ojos(g, x, y, r, cerr) {
    for (const s of [-1, 1]) {
      const cx = x + s * r * 1.35;
      if (cerr) { g.strokeStyle = "rgba(8,16,20,.85)"; g.lineWidth = 1.1; g.lineCap = "round"; g.beginPath(); g.moveTo(cx - r * .8, y); g.quadraticCurveTo(cx, y + r * .7, cx + r * .8, y); g.stroke(); continue; }
      g.fillStyle = "#fff"; g.beginPath(); g.ellipse(cx, y, r * .8, r, 0, 0, TAU); g.fill();
      g.fillStyle = "#0B1418"; g.beginPath(); g.arc(cx + r * .12, y + r * .15, r * .5, 0, TAU); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(cx - r * .08, y - r * .2, r * .18, 0, TAU); g.fill();
    }
  }

  // Cuántas criaturas caben: primero las tuyas y luego una muestra fija del resto, para que se vea la mezcla real
  const MAXB = () => s.w < 520 ? 150 : 260;
  function sincronizar() {
    if (!C) return;
    const R = rng(hashStr(C.id)), vistos = new Set(), maxV = s.w < 520 ? 14 : 24;
    let vuelan = [...bichos.values()].filter(b => b.alt).length;  // pocas vuelan, para que el cielo no se llene
    const lista = [...(C.dots || [])].map(d => [hashStr(d[0]), d]).sort((a, b) => (b[1][3] - a[1][3]) || a[0] - b[0]).slice(0, MAXB()).map(x => x[1]);
    for (const [id, rar, fer, mine] of lista) {
      vistos.add(id);
      let b = bichos.get(id);
      if (!b) {
        const h = hashStr(id);
        b = { a: (R() - .5) * 1.25, d: R() ** 1.4, v: ((h % 7) - 3) * .0012 + (R() - .5) * .002, ph: R() * TAU, alt: rar >= 2 && h % 5 < 2 && vuelan < maxV ? (vuelan++, .14 + R() * .42) : 0, var: h % VARIANTES, sueno: h % 10 < 7, nace: 1 };
        bichos.set(id, b);
      }
      Object.assign(b, { rar, fer, mine });
    }
    for (const id of bichos.keys()) if (!vistos.has(id)) bichos.delete(id);
  }
  function criaturasEnSuelo(ctx, g, t, dt, noche) {
    if (!spr) return;
    const b0 = base(), lista = [...bichos.entries()].sort((a, b) => a[1].d - b[1].d || (a[1].alt > 0) - (b[1].alt > 0));
    const vis = Math.asin(Math.min(1, (s.w / 2 + 30) / g.R));
    let zz = 0;
    for (const [id, b] of lista) {
      const duerme = noche > .7 && b.sueno && b.rar < 2;
      if (!REDUCE && dt && !duerme) { b.a += b.v * dt / 16; if (b.a > vis) b.a = -vis; else if (b.a < -vis) b.a = vis; }
      if (b.nace > 0) b.nace = Math.max(0, b.nace - dt / 600);
      const rr = g.R - b.d * s.h * .2, esc = (.62 + .55 * b.d) * (1 - b.nace * .8), sz = b0 * esc * (b.rar === 3 ? 1.25 : b.rar === 2 ? 1.12 : 1);
      let x = g.x + Math.sin(b.a) * rr, y = g.y - Math.cos(b.a) * rr;
      if (b.alt) y -= s.h * b.alt + Math.sin(t / 700 + b.ph) * 4;
      else if (!duerme && !REDUCE) y -= Math.abs(Math.sin(t / (380 + b.fer * 25) + b.ph)) * (2 + b.fer * .45) * esc;
      const parp = duerme || (!REDUCE && (t + b.ph * 1000) % (2600 + (b.ph * 400 | 0)) < 130);
      const img = spr[idx(b.rar, b.var, parp)];
      const resp = duerme ? 1 + .04 * Math.sin(t / 900 + b.ph) : 1;
      ctx.drawImage(img, x - sz * resp, y - sz * 1.8 * resp, sz * 2 * resp, sz * 2 * resp);
      if (b.mine) corazon(ctx, x, y - sz * 2.05, sz * .28, "#F0B03F");
      if (duerme && zz < 3 && b.d > .6 && Math.abs(b.a) < .3 && (b.ph * 10 | 0) % 3 === 0) { zz++; ctx.font = `600 ${Math.round(sz * .7)}px ${FONT.m}`; ctx.fillStyle = `rgba(220,230,255,${.5 + .3 * Math.sin(t / 800 + b.ph)})`; ctx.textAlign = "left"; ctx.fillText("z", x + sz * .6, y - sz * 1.7 - (t / 60 % 8)); }
    }
  }
  // La cría del jugador pasea por su colonia hogar, o por la que visita de excursión. Duerme de 23 a 7, como en su panel.
  function criaEnSuelo(ctx, g, t) {
    const K = W?.cria; if (!K?.etapa || !C) return null;
    const fuera = !!(K.excursion && K.excursion.vuelveEn > 0);
    if (fuera ? K.excursion.name !== C.name : K.hogar?.id !== C.id) return null;
    const hr = new Date().getHours(), duerme = !fuera && (hr >= 23 || hr < 7);
    const img = imagenCria(K, duerme, () => loop.ahora()); if (!img) return null;
    const E = clamp(.48 + .1 * K.etapa, .6, 1), S = base() * 6, fase = REDUCE ? .6 : t / 16000 * TAU;
    const x = duerme ? g.x - s.w * .14 : g.x + Math.sin(fase) * s.w * .27, suelo = g.y - Math.sqrt(Math.max(0, g.R * g.R - (x - g.x) ** 2));
    const salto = t - criaSalto < 650 ? Math.sin((t - criaSalto) / 650 * Math.PI) * S * .3 : 0;
    const y = suelo - salto - (duerme || REDUCE ? 0 : Math.abs(Math.sin(t / 320)) * S * .025), izq = !duerme && Math.cos(fase) < 0;
    ctx.fillStyle = "rgba(4,10,14,.35)"; ctx.beginPath(); ctx.ellipse(x, suelo + 1, S * .2 * E * (1 - salto / S), S * .035, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); if (izq) ctx.scale(-1, 1);
    ctx.drawImage(img, -S / 2, -S * (.61 + .2 * E), S, S); // los pies de su cuerpo sobre el suelo
    ctx.restore();
    const top = y - S * (.5 * E + .1) - 4, fs = Math.round(clamp(S * .16, 10, 13));
    ctx.font = `700 ${fs}px ${FONT.t}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(3,8,16,.8)"; ctx.strokeText(K.nombre, x, top); ctx.fillStyle = "#FFFFFF"; ctx.fillText(K.nombre, x, top);
    if (duerme && !REDUCE) { ctx.font = `600 ${fs}px ${FONT.m}`; ctx.fillStyle = `rgba(220,230,255,${.55 + .3 * Math.sin(t / 700)})`; ctx.textAlign = "left"; ctx.fillText("z", x + S * .22, top - (t / 70 % 9)); }
    return { x, y: y - S * .25 * E, r: S * .25 * E };
  }
  // Esporas doradas: bajan flotando; si llegan al suelo se apagan
  function esporasDoradas(ctx, g, t, dt) {
    if (!REDUCE && t > proxima && esporas.length < 2 && C?.alive) { esporas.push({ x: s.w * (.1 + Math.random() * .8), y: -12, ph: Math.random() * TAU, v: 14 + Math.random() * 10, vida: 0 }); proxima = t + 3500 + Math.random() * 5000; }
    for (const e of esporas) {
      e.vida += dt; e.y += e.v * dt / 1000;
      const x = e.x + Math.sin(t / 900 + e.ph) * 12, suelo = g.y - Math.sqrt(Math.max(0, g.R * g.R - (x - g.x) ** 2));
      e.fin = e.y > suelo - 6; e.px = x;
      const a = e.fin ? 0 : Math.min(1, e.vida / 500);
      // un destello dorado que gira despacio: se distingue del sol y se ve bien para tocarlo
      ctx.save(); ctx.globalCompositeOperation = "lighter"; luz(ctx, luzHex("#F0B03F"), x, e.y, 22, .85 * a); ctx.restore();
      ctx.save(); ctx.translate(x, e.y); ctx.rotate(t / 1600 + e.ph); destello(ctx, 0, 0, 8.5, a); ctx.rotate(Math.PI / 4); destello(ctx, 0, 0, 4.5, a * .8); ctx.restore();
      ctx.globalAlpha = a; ctx.fillStyle = "#FFF8E0"; ctx.beginPath(); ctx.arc(x, e.y, 2.2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    esporas = esporas.filter(e => !e.fin);
  }
  cv.addEventListener("pointerdown", e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (criaP && !REDUCE && Math.hypot(criaP.x - x, criaP.y - y) < criaP.r + 10) { // la cría salta y suelta corazones
      criaSalto = tAhora; for (let k = 0; k < 3; k++) corazones.push({ x: criaP.x + (k - 1) * 10, y: criaP.y - criaP.r, s: 3.2 + k % 2, ph: k * 2, vida: -k * 140 });
      loop.ahora(); return;
    }
    const i = esporas.findIndex(sp => Math.hypot(sp.px - x, sp.y - y) < 28);
    if (i < 0) return;
    const sp = esporas.splice(i, 1)[0];
    for (let k = 0; k < 10; k++) { const a = k * TAU / 10; chispas.push({ x: sp.px, y: sp.y, vx: Math.cos(a), vy: Math.sin(a), vida: 0 }); }
    loop.ahora(); o.onSpore?.();
  });

  return {
    datos(c, w) {
      W = w; C = c;
      if (!C) return;
      const nuevo = look(C, W), key = `${nuevo.id}|${nuevo.hue}|${nuevo.sat}|${nuevo.lig}`;
      if (C.id !== L?.id) { bichos.clear(); esporas = []; preparar(true); }
      L = nuevo;
      if (key !== lookKey) { lookKey = key; spr = criaturas(L, s.d, base()); }
      sincronizar(); loop.ahora(); loop.pedir();
    },
  };
}

// ---------- mini retratos en las tarjetas ----------
// Pone el mini planeta de cada colonia en los botones que la eligen (tarjetas de la federación y rangos)
function minis(root, W) {
  if (!root || !W?.colonies) return;
  const por = new Map(W.colonies.map(c => [c.id, c])), d = Math.min(2, devicePixelRatio || 1);
  for (const el of root.querySelectorAll('[data-a="col"][data-id]')) {
    const c = por.get(el.dataset.id); if (!c) continue;
    const grande = el.classList.contains("col"), px = grande ? 52 : 20;
    let cv = el.querySelector(":scope > canvas.mini");
    if (!cv) { cv = document.createElement("canvas"); cv.className = "mini"; cv.setAttribute("aria-hidden", "true"); el.prepend(cv); if (grande) el.classList.add("con-mini"); }
    cv.width = cv.height = Math.round(px * d); cv.style.width = cv.style.height = px + "px";
    const ctx = cv.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, px, px);
    const L = look(c, W);
    const amb = L.rank === "ambar";
    mini(ctx, px / 2, px / 2 + (amb && grande ? 2 : 0), px * (grande ? (amb ? .27 : .34) : (amb ? .28 : .4)), L, { mira: .9 });
  }
}

window.Galaxia = { galaxia, colonia: mundoColonia, minis, look, mini };
})();
