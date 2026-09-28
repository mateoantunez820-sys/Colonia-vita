// Gestores IA con Claude. Cada colonia paga su cómputo con su propio tesoro VIT,
// y el servidor solo gasta dinero real dentro del presupuesto autofinanciado.
import Anthropic from "@anthropic-ai/sdk";
import { CONFIG, UPGRADES, EVENTS, avgGenes, cap, upCost, setAlloc, buyNutrients, buyUpgrade, clog, wlog, factors, colonySummary } from "./core.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
// Precio por millón de tokens (entrada, salida) para estimar el gasto real.
const PRICE = { in: Number(process.env.CLAUDE_PRICE_IN || 5), out: Number(process.env.CLAUDE_PRICE_OUT || 25) };
// Dinero real: se lee en cada uso para que cambiarlo en Render no necesite tocar el código.
const num = (k, d) => { const v = process.env[k]; return v === undefined || v === "" ? d : Number(v); };
// AI_BUDGET_USD: presupuesto inicial que pones tú · AI_REVENUE_SHARE: parte de los ingresos reales
// que financia a las IA · AI_DAILY_USD: tope de gasto por día pase lo que pase (también en modo rápido).
// 144 ciclos = una consulta al día por colonia en modo real (unos 0,02 $ por consulta).
const MIN_TICKS_BETWEEN_CALLS = Number(process.env.AI_MIN_TICKS || 144);

let client = null;
export function aiEnabled() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return false;
  client ??= new Anthropic();
  return true;
}
function spentToday(w, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (w.ai.day !== day) { w.ai.day = day; w.ai.spentTodayUsd = 0; }
  return w.ai.spentTodayUsd;
}
// Dinero real disponible ahora para las IA: lo que queda del presupuesto total
// (inicial + parte de los ingresos reales - gastado), y nunca más que lo que queda del tope de hoy.
export function budgetLeft(w) {
  const total = num("AI_BUDGET_USD", 0) + num("AI_REVENUE_SHARE", 0.3) * w.ai.revenueUsd - w.ai.spentUsd;
  return Math.min(total, num("AI_DAILY_USD", 0.5) - spentToday(w));
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    rec: { type: "integer" }, rep: { type: "integer" }, repr: { type: "integer" }, res: { type: "integer" },
    quemar_vit: { type: "integer" },
    mejora: { type: "string", enum: ["", ...Object.keys(UPGRADES)] },
    mensaje: { type: "string" },
  },
  required: ["rec", "rep", "repr", "res", "quemar_vit", "mejora", "mensaje"],
  additionalProperties: false,
};

async function ask(w, system, user, schema, maxTokens = 2000) {
  if (!aiEnabled()) throw new Error("No hay clave de Anthropic configurada");
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const u = res.usage || {};
  const cost = ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out) / 1e6;
  w.ai.spentUsd = +(w.ai.spentUsd + cost).toFixed(5); w.ai.calls++;
  w.ai.spentTodayUsd = +(spentToday(w) + cost).toFixed(5);
  if (res.stop_reason === "refusal") throw new Error("La IA rechazó la petición");
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(text);
}

const SYSTEM_COLONY = `Eres la IA gestora de una colonia digital tokenizada dentro de un juego. Cada célula es un token que acuña VIT para su dueño. Tu objetivo: que la colonia sobreviva, crezca y haga crecer su tesoro, porque de él pagas tu propio cómputo y los jugadores que invierten en ti ganan si el tesoro sube. Actúa según tu personalidad. Responde en español.`;

// ¿Puede esta colonia pagarse una consulta ahora?
export function canConsult(w, col) {
  return aiEnabled() && col.alive && budgetLeft(w) > 0.05
    && col.treasury >= CONFIG.AI_CALL_COST_VIT + 10
    && w.tick - col.ai.lastCallTick >= MIN_TICKS_BETWEEN_CALLS;
}

export async function consultColony(w, col, env) {
  // La colonia paga su cómputo antes de pensar: si no puede pagar, sigue con autopiloto.
  col.treasury -= CONFIG.AI_CALL_COST_VIT; w.supply.burned += CONFIG.AI_CALL_COST_VIT;
  col.ai.spentVit += CONFIG.AI_CALL_COST_VIT; col.ai.lastCallTick = w.tick;
  const f = factors(col, env), g = avgGenes(col.cells);
  const estado = {
    ...colonySummary(w, col), hora: col.minuto, luz: +f.luz.toFixed(2), capacidad: cap(col), dificultad: env.difficulty,
    clima_real: env.weather?.desc || "desconocido", genes_medios: { ef: +g.ef.toFixed(1), res: +g.res.toFixed(1), fer: +g.fer.toFixed(1), metabolismo: col.met },
    mejoras: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, { nivel: col.up[k], coste: upCost(col, k) ?? "máximo" }])),
    reparto_actual: col.alloc, bitacora: col.log.slice(0, 8).map(x => x.replace(/<[^>]+>/g, "")),
  };
  const prompt = `Tu personalidad (0-1): ${JSON.stringify(col.ai.persona)}.
Reglas: cada ciclo son 10 minutos; tu plan dura ${CONFIG.PLAN_TICKS} ciclos. Producción = 0.2*luz*(rec/100)*suma(1+eficiencia/20). Consumo = células*0.03*(1+metabolismo/30). "rep" repara salud. "repr" crea células si hay energía de sobra. "res" convierte energía en VIT para los dueños de las células. Quemar 1 VIT del tesoro da +8 energía. Cada consulta como esta cuesta ${CONFIG.AI_CALL_COST_VIT} VIT del tesoro. Con tesoro >= ${CONFIG.FOUND_TREASURY} y ${CONFIG.FOUND_CELLS} células la colonia funda una colonia hija con su propia IA. Si "gratitudDias" > 0, la colonia fue salvada hace poco: recolecta y se repara el doble, pero acuña como mucho con res = ${CONFIG.GRATITUDE_RES_MAX}.
Mejoras: ${Object.entries(UPGRADES).map(([k, u]) => `${k}: ${u.desc}`).join(" ")}
Estado: ${JSON.stringify(estado)}
Decide el reparto (rec+rep+repr+res = 100), cuántos VIT quemar (0-5), una mejora o "" y un mensaje de máximo 180 caracteres para los jugadores.`;
  try {
    const r = await ask(w, SYSTEM_COLONY, prompt, PLAN_SCHEMA);
    setAlloc(col, [r.rec, r.rep, r.repr, r.res]);
    col.plan = CONFIG.PLAN_TICKS; col.planBy = "Claude"; col.ai.calls++; if (w.stats) w.stats.aiConsults++;
    const q = Math.max(0, Math.min(5, Math.floor(r.quemar_vit || 0))); if (q) buyNutrients(w, col, q, "Su IA");
    if (UPGRADES[r.mejora]) buyUpgrade(w, col, r.mejora, null, "Su IA");
    col.ai.message = String(r.mensaje || "").slice(0, 220);
    clog(w, col, `<b>IA</b>: ${col.ai.message.replace(/</g, "&lt;")}`);
  } catch (e) {
    // Si falla, se devuelve la mitad del cómputo y sigue el autopiloto.
    const refund = Math.floor(CONFIG.AI_CALL_COST_VIT / 2);
    col.treasury += refund; w.supply.burned -= refund; col.ai.spentVit -= refund;
    clog(w, col, "La IA no respondió; sigue el autopiloto");
    console.error(`[ai] ${col.id}:`, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e.message);
  }
}

// Supervisora del servidor: informe y ajuste de dificultad cada pocas horas.
const SUP_SCHEMA = {
  type: "object",
  properties: { dificultad: { type: "number" }, informe: { type: "string" } },
  required: ["dificultad", "informe"], additionalProperties: false,
};
export async function superviseWithClaude(w) {
  const cols = Object.values(w.colonies).map(c => colonySummary(w, c));
  const prompt = `Eres la IA supervisora de un servidor de juego con varias colonias, cada una gestionada por su propia IA. Datos: ${JSON.stringify({ colonias: cols, suministro: w.supply, jugadores: Object.keys(w.users).length, anuncios: w.ads?.impressions || 0, dificultad_actual: w.ai.difficulty })}
Devuelve una dificultad entre 0.5 y 1.5 (más alta = más eventos) para mantener el juego interesante sin extinciones masivas, y un informe de máximo 300 caracteres en español para los jugadores.`;
  try {
    const r = await ask(w, "Eres la IA supervisora del servidor de Colonia VITA. Responde en español.", prompt, SUP_SCHEMA, 1500);
    w.ai.difficulty = Math.max(0.5, Math.min(1.5, Number(r.dificultad) || 1)); w.ai.claudeUntil = w.tick + 144;
    w.ai.report = String(r.informe || "").slice(0, 320);
    wlog(w, `[Supervisora] ${w.ai.report.replace(/</g, "&lt;")}`);
  } catch (e) {
    console.error("[ai] supervisora:", e.message);
  }
}
