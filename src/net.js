// IP del cliente para los límites anti-abuso.
// Sin proxy (hops = 0) se usa la conexión y se ignora X-Forwarded-For, que el cliente puede inventar.
// Detrás de N proxies de confianza (Render = 1) se toma la IP que añadió el último de ellos:
// lo que el cliente ponga delante en la cabecera no sirve para hacerse pasar por otro.
export function clientIp(headers, remote, hops = 0) {
  if (hops > 0) {
    const xff = String(headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
    if (xff.length) return xff[Math.max(0, xff.length - hops)];
  }
  return remote || "";
}
