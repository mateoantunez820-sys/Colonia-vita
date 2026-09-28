import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.js";
import * as oruz from "../src/oruz.js";
import * as ret from "../src/retention.js";

const KEY = "clave-de-prueba";
const env = () => ({ weather: null, attention: 0, difficulty: 1 });
const T0 = Date.UTC(2026, 8, 28, 10); // lunes 28 de septiembre de 2026, 10:00 UTC
const H = 3600000, D = 24 * H;

test("la copia firmada devuelve la cuenta, sus células, sus fondos y su Ámbar tras un reinicio", () => {
  const w = core.createWorld(), o = oruz.ensure(w, "copia"), col = Object.values(w.colonies)[0];
  const ana = core.createUser(w, "Ana", core.hash("token-ana")); ana.vit = 200;
  const cells = col.cells.slice(0, 2);
  for (const c of cells) assert.equal(core.adopt(w, col, c.id, ana).ok, true);
  assert.equal(core.invest(w, col, ana, 20).ok, true);
  o.regions[0].resina = 1; w.tick++; oruz.step(w);
  const pieza = Object.values(o.ambar)[0];
  assert.equal(oruz.collectAmber(w, ana, pieza.id).ok, true);
  const vit = Math.floor(ana.vit), fondos = Math.floor(core.positions(w, ana)[0].value * 0.95);
  const save = ret.makeSave(w, ana, KEY);

  // El servidor se reinicia: mundo nuevo, sin nadie
  const w2 = core.createWorld(); oruz.ensure(w2, "copia");
  const minted = w2.supply.minted;
  assert.equal(ret.restoreSave(w2, save.slice(0, -2) + "xx", KEY).ok, false, "una firma alterada no vale");
  const [data, sig] = save.split(".");
  const trucha = Buffer.from(Buffer.from(data, "base64url").toString().replace(`"vit":${ana.vit}`, `"vit":99999`)).toString("base64url");
  assert.equal(ret.restoreSave(w2, `${trucha}.${sig}`, KEY).ok, false, "no se puede inflar el VIT");
  assert.equal(ret.restoreSave(w2, save, "otra-clave").ok, false, "otra clave no vale");
  const r = ret.restoreSave(w2, save, KEY);
  assert.equal(r.ok, true, r.error);
  const u = r.user;
  assert.equal(u.tokenHash, core.hash("token-ana"), "entra con el mismo token de siempre");
  assert.equal(Math.floor(u.vit), vit + fondos);
  assert.equal(w2.supply.minted - minted, vit + fondos, "el VIT recuperado queda contabilizado");
  const mine = Object.values(w2.colonies).flatMap(c => c.cells).filter(c => c.owner === u.id);
  assert.deepEqual(mine.map(c => c.g).sort((a, b) => a.ef - b.ef || a.res - b.res), cells.map(c => c.g).sort((a, b) => a.ef - b.ef || a.res - b.res));
  assert.deepEqual(oruz.amberOf(w2, u.id).map(p => p.id), [pieza.id], "el Ámbar conserva su código único");
  assert.equal(u.welcome.restaurada, true);
  assert.equal(ret.restoreSave(w2, save, KEY).ok, false, "la misma cuenta no se puede duplicar");
  // El código de recuperación le da otra clave a la cuenta, pero la copia vieja sigue sin poder duplicarla
  u.tokenHash = core.hash("token-nuevo");
  assert.equal(ret.restoreSave(w2, save, KEY).ok, false, "tampoco después de recuperar la cuenta con otra clave");
  ana.tokenHash = core.hash("token-nuevo-ana");
  assert.equal(ret.restoreSave(w, save, KEY).ok, false, "en su propio mundo la cuenta sigue ahí");
  const w3 = core.createWorld(); oruz.ensure(w3, "copia");
  const r3 = ret.restoreSave(w3, ret.makeSave(w2, u, KEY), KEY);
  assert.equal(r3.ok, true, r3.error);
  assert.equal(ret.restoreSave(w3, save, KEY).ok, false, "una copia de su mundo de origen tampoco vuelve dos veces");
  assert.ok(core.verifyChain(w2));
});

test("sin clave no hay copias", () => {
  const w = core.createWorld(), u = core.createUser(w, "Sol", "h");
  assert.equal(ret.makeSave(w, u, null), null);
  assert.equal(ret.restoreSave(w, "a.b", null).ok, false);
});

test("al volver tras unas horas, el jugador ve lo que acuñaron sus células y qué pasó", () => {
  const w = core.createWorld(), col = Object.values(w.colonies)[0];
  const u = core.createUser(w, "Iris", "h"); u.vit = 300;
  for (const c of col.cells.slice(0, 10)) core.adopt(w, col, c.id, u);
  ret.touch(w, u, T0);
  assert.equal(u.welcome, undefined);
  for (let i = 0; i < 144; i++) core.stepWorld(w, env);
  ret.touch(w, u, T0 + 5 * H);
  const r = u.welcome;
  assert.ok(r, "hay informe de regreso");
  assert.equal(r.horas, 5);
  assert.ok(r.acunado > 0, "sus células acuñaron VIT mientras no estaba");
  assert.equal(r.acunado, Math.floor(u.mined));
  assert.equal(r.colonias[0].name, col.name);
  ret.touch(w, u, T0 + 5 * H + 1000);
  assert.equal(u.welcome.at, r.at, "un informe por regreso, no uno por petición");
});

test("la liga suma puntos con tope diario y reparte células de premio al cerrar la semana", () => {
  const w = core.createWorld();
  const [a, b, c] = ["Ana", "Leo", "Mar"].map((n, i) => core.createUser(w, n, "h" + i));
  ret.leagueTick(w, T0);
  for (let i = 0; i < 20; i++) ret.award(w, a, "claim", T0);
  assert.equal(a.league.pts, ret.LEAGUE.cap, "el tope diario frena el farmeo");
  ret.award(w, a, "claim", T0 + D);
  assert.equal(a.league.pts, ret.LEAGUE.cap + ret.LEAGUE.pts.claim, "al día siguiente vuelve a sumar");
  ret.award(w, b, "habit", T0); ret.award(w, c, "ad", T0);
  const v = ret.leagueView(w, b, T0 + D);
  assert.deepEqual(v.top.map(x => x.name), ["Ana", "Leo", "Mar"]);
  assert.equal(v.yo.pos, 2);
  assert.equal(ret.leagueTick(w, T0 + 2 * D), null, "la semana sigue abierta");
  const top = ret.leagueTick(w, T0 + 7 * D);
  assert.deepEqual(top.map(x => x.premio), ["Legendaria", "Épica", "Épica"]);
  const cellOf = u => Object.values(w.colonies).flatMap(x => x.cells).find(x => x.id === u.premio.cell);
  assert.equal(core.rarIdx(cellOf(a)), 3);
  assert.equal(cellOf(b).owner, b.id);
  assert.equal(w.league.history[0].week, ret.weekKey(T0));
  assert.equal(ret.leagueView(w, a, T0 + 7 * D).yo.pts, 0, "la semana nueva empieza de cero");
  assert.ok(core.verifyChain(w));
});

test("las invitaciones pagan a los dos cuando el amigo juega 3 días distintos", () => {
  const w = core.createWorld();
  const ana = core.createUser(w, "Ana", "h1"); ret.touch(w, ana, T0);
  const code = ana.code;
  assert.match(code, /^[A-Z2-9]{6}$/);
  const leo = core.createUser(w, "Leo", "h2");
  assert.equal(ret.onJoin(w, leo, code.toLowerCase()), true);
  assert.equal(ret.onJoin(w, core.createUser(w, "Nadie", "h3"), "ZZZZZZ"), false, "un código desconocido no cuenta");
  const a0 = ana.vit, l0 = leo.vit;
  ret.touch(w, leo, T0); ret.touch(w, leo, T0 + 2 * H);
  ret.touch(w, leo, T0 + D);
  assert.equal(ana.vit, a0, "todavía no: solo 2 días");
  ret.touch(w, leo, T0 + 2 * D);
  assert.equal(leo.vit - l0, ret.INVITE.amigo);
  assert.equal(ana.vit - a0, ret.INVITE.tu);
  assert.equal(ana.inv.paid, 1);
  ret.touch(w, leo, T0 + 3 * D);
  assert.equal(ana.vit - a0, ret.INVITE.tu, "se paga una sola vez");
});

test("las métricas cuentan jugadores activos y cuántos vuelven al día siguiente y a la semana", () => {
  const w = core.createWorld();
  const mk = (name, created, days) => { const u = core.createUser(w, name, "h" + name); u.createdAt = created; u.days = days.map(t => new Date(t).toISOString().slice(0, 10)); return u; };
  const now = T0 + 10 * D;
  mk("A", T0, [T0, T0 + D, T0 + 7 * D, now]);
  mk("B", T0, [T0]);
  mk("C", T0 + 8 * D, [T0 + 8 * D, T0 + 9 * D]);
  mk("E", now, [now]);
  const m = ret.metrics(w, now);
  assert.equal(m.jugadores, 4);
  assert.equal(m.dau, 2);
  assert.equal(m.wau, 3);
  assert.deepEqual(m.d1, { base: 3, vuelven: 2, pct: 67 });
  assert.deepEqual(m.d7, { base: 2, vuelven: 1, pct: 50 });
});
