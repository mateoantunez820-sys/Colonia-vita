// Servidor 24/7 de la Federación VITA: simula, guarda, sirve la web y la API.
import http from "node:http";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "./core.js";
import * as rangos from "./rangos.js";
import * as oruz from "./oruz.js";
import * as lumar from "./lumar.js";
import * as ret from "./retention.js";
import * as cria from "./cria.js";
import { aiEnabled, budgetLeft, canConsult, consultColony, superviseWithClaude } from "./ai.js";
import { fetchWeather, simulatedWeather } from "./weather.js";
import { clientIp } from "./net.js";
import { newRecoveryCode, recoveryHash, validCode } from "./cuentas.js";
import { legalInfo, legalPage } from "./legal.js";
import * as aura from "./aura.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const WORLD_FILE = path.join(DATA_DIR, "world.json");
const FAST = process.env.SIM_MODE === "fast";
// Modo real: 1 ciclo = 10 minutos reales y el sol sigue la hora local. Modo rápido: 1 ciclo cada 2 s.
const TICK_MS = Number(process.env.TICK_MS || (FAST ? 2000 : 600000));
const SUPERVISOR_EVERY = Number(process.env.SUPERVISOR_EVERY_TICKS || (FAST ? 540 : 36));
const TZ = process.env.GAME_TZ || "Europe/Madrid";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const DEMO_PURCHASES = process.env.DEMO_PURCHASES === "1";
// Proxies de confianza delante del servidor (Render = 1). Con 0 se ignora X-Forwarded-For.
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS || 0);
const JOIN_PER_HOUR = Number(process.env.JOIN_PER_HOUR || 60); // cuentas nuevas por hora en todo el servidor
const WEATHER_MAX_AGE_MS = 3600000;
// Clave de las copias firmadas: sin ella, las cuentas no sobreviven a que el servidor pierda su mundo.
// En Render, ADMIN_TOKEN se genera una vez y no cambia entre despliegues, así que sirve de base.
const SAVE_SECRET = process.env.SAVE_SECRET || ADMIN_TOKEN;
const SAVE_KEY = SAVE_SECRET ? core.hash("vita-save:" + SAVE_SECRET) : null;
// Con la misma semilla, Oruz renace con el mismo mapa si el mundo se crea de nuevo
const ORUZ_SEED = process.env.ORUZ_SEED || (SAVE_SECRET ? core.hash("oruz:" + SAVE_SECRET) : undefined);
const LUMAR_SEED = ORUZ_SEED ? core.hash("lumar:" + ORUZ_SEED) : undefined;

let world, dirty = false, realWeather = null, simWeather = null, aiBusy = false;
const activity = new Map(); // uid -> último acceso
const byToken = new Map();  // hash del token -> usuario
const byRecovery = new Map(); // hash del código de recuperación -> usuario

// ---------- persistencia ----------
async function load() {
  await mkdir(DATA_DIR, { recursive: true });
  try { world = JSON.parse(await readFile(WORLD_FILE, "utf8")); console.log(`Mundo cargado: ${Object.keys(world.colonies).length} colonias, ciclo ${world.tick}`); }
  catch { world = core.createWorld(); console.log("Mundo nuevo creado"); dirty = true; }
  const fixed = core.migrateWorld(world);
  if (fixed) { console.log(`Reparadas ${fixed} personalidades de IA dañadas`); dirty = true; }
  for (const u of Object.values(world.users)) { byToken.set(u.tokenHash, u); if (u.recoveryHash) byRecovery.set(u.recoveryHash, u); }
  if (!world.oruz) { oruz.ensure(world, ORUZ_SEED); dirty = true; }
  if (!world.lumar) { lumar.ensure(world, LUMAR_SEED, simNow()); dirty = true; }
}
async function save() {
  if (!dirty) return;
  dirty = false;
  const tmp = WORLD_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(world));
  await rename(tmp, WORLD_FILE);
}

// ---------- entorno ----------
// Fecha y hora locales del juego: { day: días desde 1970, minute: minuto del día }
const CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function realClock() {
  const p = Object.fromEntries(CLOCK.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000, minute: +p.hour * 60 + +p.minute };
}
function realMinute() { return realClock().minute; }
// En modo rápido el reloj del juego avanza 10 minutos por ciclo desde las 8:00 del día de creación.
function simClock() {
  const m = 8 * 60 + world.tick * 10;
  return { day: Math.floor(world.createdAt / 86400000) + Math.floor(m / 1440), minute: m % 1440 };
}
// La luna de Lumar es la real. En modo rápido avanza 10 minutos por ciclo, como el reloj del juego.
function simNow() { return FAST ? world.createdAt + world.tick * 600000 : Date.now(); }
function attention() {
  const now = Date.now(); let n = 0;
  for (const [, t] of activity) if (now - t < 120000) n++;
  return Math.min(1, n / 5);
}
function envFor(col) {
  const env = { minuto: FAST ? undefined : realMinute(), weather: currentWeather(), attention: attention(), difficulty: world.ai.difficulty };
  return col ? oruz.envFor(world, col, env) : env;
}
async function refreshWeather() {
  try { realWeather = await fetchWeather(); }
  catch (e) { console.warn(`Clima real no disponible (${e.message}); uso el clima simulado de temporada`); }
}
// Clima real si es reciente. Si Open-Meteo falla (o en modo rápido), clima simulado de temporada.
function currentWeather() {
  if (!FAST && realWeather && Date.now() - realWeather.at < WEATHER_MAX_AGE_MS) return realWeather;
  const t = FAST ? simClock() : realClock(), key = `${t.day}:${Math.floor(t.minute / 60)}`;
  if (simWeather?.key !== key) simWeather = { key, value: simulatedWeather(t.day, t.minute) };
  return simWeather.value;
}

// ---------- bucle principal ----------
const tickMs = { last: 0, max: 0 };
function tick() {
  const t0 = performance.now();
  core.stepWorld(world, envFor);
  oruz.step(world);
  lumar.step(world, simNow());
  rangos.step(world);
  ret.leagueTick(world);
  tickMs.last = performance.now() - t0; tickMs.max = Math.max(tickMs.max, tickMs.last);
  dirty = true;
  if (!aiBusy && aiEnabled()) {
    const col = Object.values(world.colonies).filter(c => canConsult(world, c)).sort((a, b) => a.salud - b.salud || a.ai.lastCallTick - b.ai.lastCallTick)[0];
    const sup = world.tick - world.ai.lastSupervisor >= SUPERVISOR_EVERY && budgetLeft(world) > 0.05;
    if (col || sup) {
      aiBusy = true;
      (async () => {
        if (col) await consultColony(world, col, envFor(col));
        if (sup) { world.ai.lastSupervisor = world.tick; await superviseWithClaude(world); }
      })().catch(e => console.error("[ai]", e.message)).finally(() => { aiBusy = false; dirty = true; });
    }
  }
}

// ---------- HTTP ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), h = hits.get(key) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n++; hits.set(key, h);
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.t > 3600000) hits.delete(k); }, 600000).unref();

function send(res, code, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(data);
}
async function readBody(req, max = 10000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error("too_large"); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function userFrom(req) {
  const m = /^Bearer ([a-f0-9]{48})$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const u = byToken.get(core.hash(m[1]));
  if (u) { activity.set(u.id, Date.now()); core.checkDay(world, u); ret.touch(world, u); dirty = true; }
  return u || null;
}
// Da al jugador un código de recuperación nuevo; el anterior deja de valer.
function newRecovery(u) {
  if (u.recoveryHash) byRecovery.delete(u.recoveryHash);
  const code = newRecoveryCode();
  u.recoveryHash = recoveryHash(code); byRecovery.set(u.recoveryHash, u); dirty = true;
  return code;
}

function roundSupply() { return Object.fromEntries(Object.entries(world.supply).map(([k, v]) => [k, Math.round(v)])); }
function worldView(u) {
  return {
    tick: world.tick, mode: FAST ? "rápido" : "tiempo real", minuto: FAST ? null : realMinute(), weather: currentWeather(), stats: world.stats,
    colonies: Object.values(world.colonies).map(c => ({ ...core.colonySummary(world, c), rango: rangos.tag(world, c) })),
    rangos: rangos.view(world),
    supply: roundSupply(), players: Object.keys(world.users).length, online: [...activity.values()].filter(t => Date.now() - t < 120000).length,
    ai: { enabled: aiEnabled(), calls: world.ai.calls, difficulty: world.ai.difficulty, report: world.ai.report, budgetOk: budgetLeft(world) > 0.05 },
    leaderboard: core.leaderboard(world), log: world.log.slice(0, 40), chainOk: core.verifyChain(world),
    chain: world.chain.slice(-12).reverse(), me: u ? { ...core.userView(world, u), hasRecovery: !!u.recoveryHash, ...ret.userExtras(world, u, SAVE_KEY) } : null,
    oruz: oruz.view(world, u), lumar: lumar.view(world, u), liga: ret.leagueView(world, u),
    cria: cria.view(world, u),
    habits: core.HABITS, ads: { ...core.ADS, enabled: true }, demoPurchases: DEMO_PURCHASES,
    aura: aura.view(world, u),
  };
}

async function handleAction(u, b) {
  const col = b.colony ? world.colonies[b.colony] : null;
  const needCol = () => col || { ok: false, error: "Colonia no encontrada" };
  switch (b.type) {
    case "adopt": return col ? core.adopt(world, col, b.cell, u) : needCol();
    case "sell": return col ? core.sellBack(world, col, b.cell, u) : needCol();
    case "feed": return col ? core.feed(world, col, u, 5) : needCol();
    case "upgrade": return col ? core.buyUpgrade(world, col, b.key, u, u.name) : needCol();
    case "invest": return col ? core.invest(world, col, u, Number(b.amount)) : needCol();
    case "withdraw": return col ? core.withdraw(world, col, u) : needCol();
    case "claim": return core.claimMission(world, u, b.key);
    case "habit": { const r = core.logHabit(world, u, col, b.key); if (r.ok) r.cria = cria.habito(world, u, b.key); return r; }
    case "ad": return core.watchedAd(world, u);
    case "spore": return core.mineSpore(world, u, 1 + Math.floor(Math.random() * 3));
    case "amber_collect": return oruz.collectAmber(world, u, String(b.id || ""));
    case "amber_infuse": return col ? oruz.infuseAmber(world, u, String(b.id || ""), col) : needCol();
    case "pearl_collect": return lumar.collectPearl(world, u, String(b.id || ""));
    // Sin código solo si se pide expresamente: un código olvidado no manda la perla a otra persona
    case "pearl_give": return lumar.givePearl(world, u, String(b.id || ""), b.azar === true ? null : String(b.code || ""));
    case "pearl_infuse": return col ? lumar.infusePearl(world, u, String(b.id || ""), col) : needCol();
    case "welcome_seen": u.welcome = null; u.premio = null; return { ok: true };
    case "cria": return cria.action(world, u, b);
    case "aura": return aura.elegir(world, u, String(b.key || ""), col);
    case "buy_demo": {
      if (!DEMO_PURCHASES) return { ok: false, error: "Los pagos aún no están activados" };
      core.grant(world, u, 50, "compra demo"); world.ai.demoRevenueUsd += 0.99;
      return { ok: true };
    }
    default: return { ok: false, error: "Acción desconocida" };
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://x");
  const ip = clientIp(req.headers, req.socket.remoteAddress, TRUSTED_PROXY_HOPS);
  if (url.pathname.startsWith("/api/") && limited("ip:" + ip, 240, 60000)) return send(res, 429, { ok: false, error: "Demasiadas peticiones" });

  if (url.pathname === "/healthz") return send(res, 200, { ok: true, tick: world.tick });
  if ((url.pathname === "/terminos" || url.pathname === "/privacidad") && req.method === "GET")
    return send(res, 200, legalPage(url.pathname.slice(1)), { "content-type": MIME[".html"], "cache-control": "public, max-age=300" });

  if (url.pathname === "/api/world" && req.method === "GET") return send(res, 200, worldView(userFrom(req)));

  const cm = /^\/api\/colony\/(COL-\d{3})$/.exec(url.pathname);
  if (cm && req.method === "GET") {
    const col = world.colonies[cm[1]]; if (!col) return send(res, 404, { ok: false, error: "Colonia no encontrada" });
    const u = userFrom(req);
    return send(res, 200, { ...core.colonyDetail(world, col, u?.id), rango: rangos.detail(world, col) });
  }

  if (url.pathname === "/api/join" && req.method === "POST") {
    if (limited("join:" + ip, 5, 3600000)) return send(res, 429, { ok: false, error: "Demasiadas cuentas nuevas desde tu red" });
    if (limited("join:all", JOIN_PER_HOUR, 3600000)) return send(res, 429, { ok: false, error: "Ahora mismo entran muchas cuentas nuevas; prueba en un rato" });
    const b = await readBody(req);
    const name = String(b.name || "").replace(/[<>]/g, "").trim().slice(0, 24);
    if (name.length < 2) return send(res, 400, { ok: false, error: "Elige un nombre de al menos 2 letras" });
    const token = randomBytes(24).toString("hex");
    const u = core.createUser(world, name, core.hash(token));
    byToken.set(u.tokenHash, u);
    ret.onJoin(world, u, b.ref);
    ret.touch(world, u);
    dirty = true;
    return send(res, 200, { ok: true, token, id: u.id, recovery: newRecovery(u) });
  }

  // Código de recuperación nuevo para la cuenta con la que se entra.
  if (url.pathname === "/api/account/recovery" && req.method === "POST") {
    const u = userFrom(req); if (!u) return send(res, 401, { ok: false, error: "Entra con tu nombre primero" });
    if (limited("recnew:" + u.id, 5, 3600000)) return send(res, 429, { ok: false, error: "Ya creaste varios códigos; prueba en un rato" });
    return send(res, 200, { ok: true, recovery: newRecovery(u) });
  }

  // Recuperar la cuenta en este dispositivo. La clave del dispositivo anterior deja de valer.
  if (url.pathname === "/api/recover" && req.method === "POST") {
    if (limited("rec:" + ip, 10, 3600000)) return send(res, 429, { ok: false, error: "Demasiados intentos; prueba en un rato" });
    const b = await readBody(req);
    if (!validCode(b.code)) return send(res, 400, { ok: false, error: "El código tiene 20 letras y números, en grupos de 5" });
    const u = byRecovery.get(recoveryHash(b.code));
    if (!u) return send(res, 404, { ok: false, error: "Ese código no corresponde a ninguna cuenta" });
    byToken.delete(u.tokenHash);
    const token = randomBytes(24).toString("hex");
    u.tokenHash = core.hash(token); byToken.set(u.tokenHash, u); dirty = true;
    return send(res, 200, { ok: true, token, id: u.id, name: u.name });
  }

  if (url.pathname === "/api/action" && req.method === "POST") {
    const u = userFrom(req); if (!u) return send(res, 401, { ok: false, error: "Entra con tu nombre primero" });
    if (limited("act:" + u.id, 60, 60000)) return send(res, 429, { ok: false, error: "Vas muy rápido" });
    const body = await readBody(req), r = await handleAction(u, body);
    if (r.ok) ret.award(world, u, body.type);
    dirty = true;
    return send(res, r.ok ? 200 : 400, r);
  }

  // Copia firmada de la cuenta: el navegador la guarda y la devuelve si el servidor se reinició
  if (url.pathname === "/api/save" && req.method === "GET") {
    // Sin 401: el navegador borra su token ante un 401 y entonces ya no podría recuperar la cuenta
    const u = userFrom(req); if (!u) return send(res, 200, { ok: false, error: "Este servidor no conoce tu cuenta" });
    const save = ret.makeSave(world, u, SAVE_KEY);
    return send(res, 200, save ? { ok: true, save } : { ok: false, error: "Las copias no están activadas" });
  }
  if (url.pathname === "/api/restore" && req.method === "POST") {
    if (limited("restore:" + ip, 10, 3600000)) return send(res, 429, { ok: false, error: "Demasiados intentos desde tu red" });
    const r = ret.restoreSave(world, (await readBody(req, 200000)).save, SAVE_KEY);
    if (!r.ok) return send(res, 400, r);
    byToken.set(r.user.tokenHash, r.user);
    if (r.user.recoveryHash) byRecovery.set(r.user.recoveryHash, r.user);
    dirty = true;
    return send(res, 200, { ok: true, id: r.user.id, cells: r.cells, vit: r.vit, amber: r.amber, pearls: r.pearls });
  }

  // Certificado de origen de una pieza de Ámbar de Oruz
  const am = /^\/api\/oruz\/ambar\/(AMB-[0-9A-F]{8})$/.exec(url.pathname);
  if (am && req.method === "GET") {
    const c = oruz.certificate(world, am[1]);
    return c ? send(res, 200, c) : send(res, 404, { ok: false, error: "Esa pieza de Ámbar no existe en este mundo" });
  }

  // Certificado de origen de una Perla de Lumar
  const pm = /^\/api\/lumar\/perla\/(PRL-[0-9A-F]{8})$/.exec(url.pathname);
  if (pm && req.method === "GET") {
    const c = lumar.certificate(world, pm[1]);
    return c ? send(res, 200, c) : send(res, 404, { ok: false, error: "Esa perla no existe en este mundo" });
  }

  // Panel del dueño: métricas y registro de ingresos reales (que financian a las IA).
  if (url.pathname.startsWith("/api/admin")) {
    if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return send(res, 401, { ok: false });
    if (url.pathname === "/api/admin/metrics") {
      const mem = process.memoryUsage();
      return send(res, 200, {
        ai: world.ai, budgetLeftUsd: +budgetLeft(world).toFixed(4), supply: roundSupply(), stats: world.stats, rangos: world.rangos?.stats, players: Object.keys(world.users).length,
        ads: world.ads || {}, colonies: Object.keys(world.colonies).length, alive: Object.values(world.colonies).filter(c => c.alive).length,
        tick: world.tick, weather: currentWeather(), memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
        worldKb: Math.round(JSON.stringify(world).length / 1024), tickMs: { last: +tickMs.last.toFixed(2), max: +tickMs.max.toFixed(2) },
        legalCompleto: legalInfo().completo, retention: ret.metrics(world), saves: !!SAVE_KEY, crias: cria.metrics(world),
      });
    }
    // Para calibrar TRUSTED_PROXY_HOPS tras desplegar: "ip" debe ser tu IP pública.
    if (url.pathname === "/api/admin/whoami") return send(res, 200, { ip, remote: req.socket.remoteAddress, xff: req.headers["x-forwarded-for"] || null, trustedProxyHops: TRUSTED_PROXY_HOPS });
    if (url.pathname === "/api/admin/revenue" && req.method === "POST") {
      const b = await readBody(req); const usd = Number(b.usd);
      if (!(usd > 0 && usd < 100000)) return send(res, 400, { ok: false, error: "usd inválido" });
      world.ai.revenueUsd += usd; dirty = true;
      core.wlog(world, `Ingresos reales registrados: ${usd.toFixed(2)} $. Parte financia a las IA.`);
      return send(res, 200, { ok: true, revenueUsd: world.ai.revenueUsd, budgetLeftUsd: budgetLeft(world) });
    }
  }

  if (req.method === "GET") {
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.join(ROOT, "public", path.normalize(rel));
    if (!file.startsWith(path.join(ROOT, "public"))) return send(res, 403, "Prohibido");
    try {
      const data = await readFile(file);
      return send(res, 200, data, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "public, max-age=300" });
    } catch { /* cae al 404 */ }
  }
  send(res, 404, { ok: false, error: "No encontrado" });
}

// ---------- arranque ----------
await load();
if (rangos.step(world)) dirty = true; // primer consejo de VITA si el mundo aún no tenía rangos
await refreshWeather();
setInterval(refreshWeather, 15 * 60000).unref();
setInterval(tick, TICK_MS);
setInterval(() => save().catch(e => console.error("Guardado falló:", e.message)), 30000);
const server = http.createServer((req, res) => route(req, res).catch(e => {
  if (e.message === "too_large") return send(res, 413, { ok: false, error: "Petición demasiado grande" });
  if (e instanceof SyntaxError) return send(res, 400, { ok: false, error: "JSON inválido" });
  console.error(e); send(res, 500, { ok: false, error: "Error interno" });
}));
server.listen(PORT, () => console.log(`Colonia VITA en http://localhost:${PORT} · modo ${FAST ? "rápido" : "tiempo real"} · IA ${aiEnabled() ? "activa" : "solo autopiloto"} · copias ${SAVE_KEY ? "firmadas" : "desactivadas (falta ADMIN_TOKEN o SAVE_SECRET)"}`));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, async () => { dirty = true; await save().catch(() => {}); process.exit(0); });
