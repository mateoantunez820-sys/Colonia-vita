// Clima real desde Open-Meteo (gratis, sin clave). Si no responde, se usa un clima simulado
// de temporada (marcado como "simulado") para que las colonias no se queden con un cielo fijo.
import { createHash } from "node:crypto";

const LAT = process.env.WEATHER_LAT || "40.4168";   // Madrid por defecto
const LON = process.env.WEATHER_LON || "-3.7038";
const CODES = { 0: "despejado", 1: "casi despejado", 2: "parcialmente nublado", 3: "nublado", 45: "niebla", 48: "niebla", 51: "llovizna", 61: "lluvia", 63: "lluvia", 65: "lluvia fuerte", 71: "nieve", 73: "nieve", 75: "nieve fuerte", 80: "chubascos", 95: "tormenta" };

export async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,cloud_cover,precipitation,weather_code,is_day`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const c = (await res.json()).current;
  return { ...toFactors(c), source: "open-meteo" };
}

export function toFactors(c) {
  const cloud = (c.cloud_cover ?? 0) / 100;
  return {
    luz: +(1 - cloud * 0.6).toFixed(2),                       // nubes restan luz
    frio: c.temperature_2m < 3 ? +Math.min(1, (3 - c.temperature_2m) / 10).toFixed(2) : 0,
    lluvia: c.precipitation > 0.2 ? +Math.min(1, c.precipitation / 5).toFixed(2) : 0,
    temp: c.temperature_2m, desc: CODES[c.weather_code] || `código ${c.weather_code}`, at: Date.now(),
  };
}

// Número pseudoaleatorio fijo para cada clave: el mismo día y la misma hora dan el mismo clima.
const rand = key => parseInt(createHash("sha256").update("vita-clima:" + key).digest("hex").slice(0, 8), 16) / 2 ** 32;
const clamp01 = x => Math.max(0, Math.min(1, x));

// Modelo de temporada parecido a Madrid: frío y nublado en invierno, seco y caluroso en verano.
// day = días desde 1970 (fecha local), minute = minuto del día local.
export function simulatedWeather(day, minute) {
  const d = new Date(day * 86400000);
  const doy = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
  const winter = Math.cos(2 * Math.PI * (doy - 15) / 365);   // 1 a mediados de enero, -1 a mediados de julio
  const h = minute / 60, slot = Math.floor(h / 3);
  const temp = 15.5 - 9.5 * winter + 5 * Math.sin(2 * Math.PI * (h - 9) / 24);
  const cloud = clamp01(0.4 + 0.2 * winter + (rand(day) - 0.5) * 0.8 + (rand(`${day}:${slot}`) - 0.5) * 0.3);
  const r = rand(`${day}:${slot}:lluvia`), wet = 0.6 + 0.4 * winter;
  const precipitation = cloud > 0.75 && r < 0.5 * wet ? +(0.3 + r * 6).toFixed(1) : 0;
  const code = precipitation ? (temp < 1 ? 71 : 61) : cloud > 0.85 ? 3 : cloud > 0.4 ? 2 : cloud > 0.15 ? 1 : 0;
  return { ...toFactors({ temperature_2m: +temp.toFixed(1), cloud_cover: Math.round(cloud * 100), precipitation, weather_code: code }), source: "simulado" };
}
