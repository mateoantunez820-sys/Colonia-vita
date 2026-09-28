// Arranca el servidor de verdad en un puerto libre con un mundo temporal, para las pruebas de extremo a extremo.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

export async function startServer(env = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "vita-")), port = await freePort();
  let proc;
  async function start() {
    proc = spawn(process.execPath, ["src/server.js"], {
      cwd: ROOT, stdio: "ignore",
      env: { ...process.env, PORT: String(port), DATA_DIR: dir, SIM_MODE: "fast", TICK_MS: "3600000", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", WEATHER_LAT: "0", WEATHER_LON: "0", ...env },
    });
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("el servidor no arrancó");
  }
  async function stop() {
    if (!proc || proc.exitCode !== null) return;
    const done = new Promise(r => proc.once("exit", r));
    proc.kill("SIGTERM"); await done;
  }
  async function call(p, { token, body, raw, headers = {} } = {}) {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method: body || raw ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...headers },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  }
  // Un cierre brusco (SIGKILL): el servidor no tiene ocasión de guardar nada.
  async function crash() {
    if (!proc || proc.exitCode !== null) return;
    const done = new Promise(r => proc.once("exit", r));
    proc.kill("SIGKILL"); await done;
  }
  await start();
  return { call, stop, restart: async () => { await stop(); await start(); }, crashRestart: async () => { await crash(); await start(); }, close: async () => { await stop(); await rm(dir, { recursive: true, force: true }); } };
}
