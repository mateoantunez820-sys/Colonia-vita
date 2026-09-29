// Anuncios con recompensa de Google AdSense para juegos web (H5 Games Ads, con la Ad Placement API).
// Están apagados hasta que el dueño pone su ADSENSE_CLIENT (ca-pub-...) en Render.
// En la web no hay una verificación del servidor como la de AdMob en las apps de móvil, así que
// el servidor da un vale al empezar el anuncio y solo paga si ese vale se canjea una vez, después
// de un mínimo de segundos y dentro del tope diario.
import { randomBytes } from "node:crypto";
import { ADS } from "./core.js";

export const AD_TTL_MS = 10 * 60000;

export function adsConfig(env = process.env) {
  const client = String(env.ADSENSE_CLIENT || "").trim(), ok = /^ca-pub-\d{10,20}$/.test(client);
  return { enabled: ok, client: ok ? client : "", test: env.ADSENSE_TEST === "1", minMs: Number(env.AD_MIN_MS || 5000) };
}

// Línea de /ads.txt que AdSense pide en la raíz del dominio.
export const adsTxt = cfg => `google.com, ${cfg.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;

// Lo que se añade al <head> de la web: la verificación del sitio y el script de anuncios.
export function adsHead(cfg) {
  return `<meta name="google-adsense-account" content="${cfg.client}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.client}" crossorigin="anonymous"${cfg.test ? ' data-adbreak-test="on"' : ""}></script>
<script>window.adsbygoogle = window.adsbygoogle || []; window.adBreak = window.adConfig = function (o) { adsbygoogle.push(o); }; adConfig({ preloadAdBreaks: "on", sound: "on" });</script>
`;
}

// Vales en memoria: si el servidor se reinicia en mitad de un anuncio, el jugador pide otro.
const tickets = new Map();
export function startAd(user, now = Date.now()) {
  // Caducan los vales viejos, y cada jugador tiene como mucho un anuncio abierto.
  for (const [k, t] of tickets) if (now - t.at > AD_TTL_MS || t.user === user.id) tickets.delete(k);
  if ((user.daily.ads || 0) >= ADS.perDay) return { ok: false, error: "Ya viste todos los anuncios de hoy" };
  if (user.lastAd && now - user.lastAd < ADS.cooldownMs) return { ok: false, error: "Espera unos segundos entre anuncios" };
  const id = randomBytes(12).toString("hex");
  tickets.set(id, { user: user.id, at: now });
  return { ok: true, ticket: id };
}
export function redeemAd(cfg, user, id, now = Date.now()) {
  const key = String(id || ""), t = tickets.get(key);
  if (!t || t.user !== user.id) return { ok: false, error: "Ese anuncio no está registrado" };
  if (now - t.at < cfg.minMs) return { ok: false, error: "El anuncio aún no ha terminado" };
  tickets.delete(key);
  if (now - t.at > AD_TTL_MS) return { ok: false, error: "El anuncio caducó; pide otro" };
  return { ok: true };
}
