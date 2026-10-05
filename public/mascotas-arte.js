// Arte de las mascotas de VITA: cada célula tiene la suya y cada una es distinta. Sin dependencias.
// MascotasArte.svg(e, s, o) devuelve el SVG como texto de una mascota de la especie e
// (luz · polen · guardia · ciclo) con la semilla s (8 cifras hexadecimales).
// o: { nivel 0-4 (lazo con su célula), anim: false para dibujarla quieta, label }
// MascotasArte.orbita(cx, x, y, rad, e, nivel, t, ph, mia) la dibuja diminuta en un canvas, junto a su célula.
(() => {
  const f = x => Math.round(x * 10) / 10;
  const hsl = (h, s, l, a) => `hsl(${Math.round(h + 360) % 360} ${s}% ${l}%${a != null ? ` / ${a}` : ""})`;
  const ESPECIES = ["luz", "polen", "guardia", "ciclo"];
  const COLOR = ["#F5E663", "#FFB067", "#F08BB0", "#C9A27E"];
  let serie = 0;
  // Lo que distingue a cada mascota de las de su especie sale de su semilla
  function rasgos(s) {
    const b = i => parseInt(String(s || "00000000").slice(i * 2, i * 2 + 2), 16) || 0;
    return { tono: (b(0) % 25) - 12, talla: 0.92 + (b(1) % 5) * 0.035, ojos: b(2) % 3, dibujo: b(3) % 3 };
  }
  // Ojos: 0 redondos, 1 sonrientes (cerrados de alegría), 2 grandes y brillantes
  function ojos(x, y, r, tipo, linea, pupila) {
    if (tipo === 1) return `<path d="M${f(x - r)} ${f(y + r * .25)}q${f(r)} ${f(-r * 1.3)} ${f(2 * r)} 0" stroke="${linea}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
    const k = tipo === 2 ? 1.18 : 1;
    return `<g class="ms-ojo"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * k)}" fill="#fff" stroke="${linea}" stroke-width="1.1"/>`
      + `<circle cx="${f(x + r * .08)}" cy="${f(y + r * .12)}" r="${f(r * .62 * k)}" fill="${pupila}"/>`
      + `<circle cx="${f(x - r * .18)}" cy="${f(y - r * .2)}" r="${f(r * .24 * k)}" fill="#fff"/>`
      + (tipo === 2 ? `<circle cx="${f(x + r * .3)}" cy="${f(y + r * .36)}" r="${f(r * .12)}" fill="#fff"/>` : "") + `</g>`;
  }
  const mejillas = (x1, x2, y, r, color) => [x1, x2].map(x => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * .55)}" fill="${color}" opacity=".55"/>`).join("");
  const sonrisa = (x, y, w, color) => `<path d="M${f(x - w)} ${f(y)}q${f(w)} ${f(w * .9)} ${f(2 * w)} 0" stroke="${color}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  // El lazo con su célula: un corazón junto a las inseparables y las almas gemelas
  const corazon = (x, y, r, lleno) => `<path class="ms-late" style="transform-origin:${f(x)}px ${f(y)}px" d="M${f(x)} ${f(y + r * .9)}C${f(x - r * 1.6)} ${f(y - r * .1)} ${f(x - r * .9)} ${f(y - r * 1.3)} ${f(x)} ${f(y - r * .45)}C${f(x + r * .9)} ${f(y - r * 1.3)} ${f(x + r * 1.6)} ${f(y - r * .1)} ${f(x)} ${f(y + r * .9)}Z" fill="${lleno ? "#FF7FA8" : "none"}" stroke="#FF7FA8" stroke-width="1.8" stroke-linejoin="round"/>`;

  // ---------- las cuatro especies, en un lienzo de 100 × 100 ----------
  function luciernaga(id, r) {
    const h = 165 + r.tono, cuerpo = hsl(h, 38, 34), claro = hsl(h, 42, 52), linea = hsl(h, 40, 16), luz = hsl(55 + r.tono * .4, 92, 66);
    let s = `<defs><radialGradient id="${id}l" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#FFFBD0"/><stop offset=".55" stop-color="${luz}"/><stop offset="1" stop-color="${hsl(48, 80, 46)}"/></radialGradient>`
      + `<radialGradient id="${id}h"><stop offset="0" stop-color="${luz}" stop-opacity=".75"/><stop offset="1" stop-color="${luz}" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id}c" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${claro}"/><stop offset="1" stop-color="${cuerpo}"/></radialGradient></defs>`;
    s += `<circle class="ms-brilla" cx="50" cy="68" r="34" fill="url(#${id}h)"/>`;
    s += `<g class="ms-flota">`;
    for (const sg of [-1, 1]) s += `<ellipse class="ms-ala" style="animation-delay:${sg > 0 ? -.14 : 0}s" cx="${50 + sg * 15}" cy="42" rx="13" ry="8.5" transform="rotate(${sg * -28} ${50 + sg * 15} 42)" fill="${hsl(195, 85, 94, .72)}" stroke="${hsl(195, 45, 78, .9)}" stroke-width="1.2"/>`;
    s += `<ellipse cx="50" cy="68" rx="14" ry="16" fill="url(#${id}l)" stroke="${hsl(45, 60, 34)}" stroke-width="1.6"/>`;
    for (let i = 0; i < r.dibujo + 1; i++) s += `<path d="M${38 + i} ${64 + i * 6}q12 4 24 0" stroke="${hsl(45, 70, 40)}" stroke-width="1.6" fill="none" opacity=".55"/>`;
    for (const sg of [-1, 1]) s += `<path class="ms-antena" style="transform-origin:${50 + sg * 5}px 30px" d="M${50 + sg * 5} 30q${sg * 2} -9 ${sg * 10} -14" stroke="${linea}" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="${50 + sg * 15}" cy="16" r="3" fill="${luz}" stroke="${linea}" stroke-width="1.2"/>`;
    s += `<circle cx="50" cy="42" r="15" fill="url(#${id}c)" stroke="${linea}" stroke-width="1.8"/>`;
    s += ojos(44, 41, 4.2, r.ojos, linea, linea) + ojos(56, 41, 4.2, r.ojos, linea, linea);
    s += mejillas(39.5, 60.5, 48, 2.8, hsl(350, 90, 75)) + sonrisa(47.5, 48.5, 2.5, linea);
    return s + `</g>`;
  }
  function abeja(id, r) {
    const h = 32 + r.tono, linea = hsl(h, 55, 18), raya = hsl(h - 8, 45, 24), polen = hsl(50, 95, 78);
    let s = `<defs><radialGradient id="${id}c" cx="36%" cy="30%" r="82%"><stop offset="0" stop-color="${hsl(h + 8, 100, 84)}"/><stop offset=".55" stop-color="${hsl(h, 98, 70)}"/><stop offset="1" stop-color="${hsl(h - 6, 80, 50)}"/></radialGradient>`
      + `<clipPath id="${id}k"><ellipse cx="50" cy="58" rx="23" ry="21"/></clipPath></defs>`;
    s += `<g class="ms-flota">`;
    for (const sg of [-1, 1]) s += `<ellipse class="ms-ala" style="animation-delay:${sg > 0 ? -.12 : 0}s" cx="${50 + sg * 14}" cy="33" rx="11" ry="13" transform="rotate(${sg * 24} ${50 + sg * 14} 33)" fill="${hsl(200, 90, 95, .75)}" stroke="${hsl(200, 45, 80, .9)}" stroke-width="1.2"/>`;
    s += `<ellipse cx="50" cy="58" rx="23" ry="21" fill="url(#${id}c)" stroke="${linea}" stroke-width="1.8"/>`;
    s += `<g clip-path="url(#${id}k)">`;
    const ys = r.dibujo === 0 ? [66] : r.dibujo === 1 ? [64, 75] : [61, 70, 79];
    for (const y of ys) s += `<path d="M24 ${y}q26 7 52 0v4.5q-26 7 -52 0Z" fill="${raya}" opacity=".85"/>`;
    s += `</g><ellipse cx="41" cy="46" rx="6" ry="3.4" fill="#fff" opacity=".45" transform="rotate(-25 41 46)"/>`;
    for (const sg of [-1, 1]) s += `<path class="ms-antena" style="transform-origin:${50 + sg * 6}px 39px" d="M${50 + sg * 6} 39q${sg * 1} -8 ${sg * 8} -12" stroke="${linea}" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="${50 + sg * 14}" cy="27" r="2.6" fill="${linea}"/>`;
    s += ojos(43, 52, 4.4, r.ojos, linea, linea) + ojos(57, 52, 4.4, r.ojos, linea, linea);
    s += mejillas(37.5, 62.5, 59, 2.9, hsl(355, 90, 70)) + sonrisa(47.3, 59.5, 2.7, linea);
    // Su cesta de polen
    s += `<circle cx="27" cy="69" r="4.2" fill="${polen}" stroke="${hsl(45, 70, 45)}" stroke-width="1.2"/><circle cx="73" cy="69" r="4.2" fill="${polen}" stroke="${hsl(45, 70, 45)}" stroke-width="1.2"/>`;
    return s + `</g>`;
  }
  function erizo(id, r) {
    const h = 338 + r.tono, linea = hsl(h, 45, 22), puas = hsl(h, 48, 50), cara = hsl(22, 85, 91);
    let s = `<defs><radialGradient id="${id}c" cx="38%" cy="30%" r="82%"><stop offset="0" stop-color="${hsl(h, 95, 88)}"/><stop offset=".6" stop-color="${hsl(h, 75, 74)}"/><stop offset="1" stop-color="${hsl(h, 55, 58)}"/></radialGradient></defs>`;
    s += `<g class="ms-flota">`;
    // Púas alrededor de la espalda: más cuanto más guardián
    const n = 9 + r.dibujo * 2;
    let d = "";
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (0.95 + 1.1 * i / n), b = Math.PI * (0.95 + 1.1 * (i + .5) / n);
      d += `${i ? "L" : "M"}${f(50 + Math.cos(a) * 25)} ${f(60 + Math.sin(a) * 23)}`;
      if (i < n) d += `L${f(50 + Math.cos(b) * 36)} ${f(60 + Math.sin(b) * 33)}`;
    }
    s += `<path d="${d}Z" fill="${puas}" stroke="${linea}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<ellipse cx="50" cy="62" rx="27" ry="23" fill="url(#${id}c)" stroke="${linea}" stroke-width="1.8"/>`;
    s += `<ellipse cx="51" cy="67" rx="17" ry="14" fill="${cara}" opacity=".95"/>`;
    s += ojos(44, 62, 4, r.ojos, linea, linea) + ojos(58, 62, 4, r.ojos, linea, linea);
    s += `<ellipse cx="51" cy="69" rx="3.4" ry="2.6" fill="${linea}"/><circle cx="50" cy="68.2" r=".9" fill="#fff" opacity=".8"/>`;
    s += mejillas(38.5, 63.5, 70, 2.8, hsl(350, 95, 72)) + sonrisa(48.4, 73.5, 2.6, linea);
    for (const x of [40, 60]) s += `<ellipse cx="${x}" cy="84" rx="5" ry="3" fill="${hsl(h, 55, 58)}" stroke="${linea}" stroke-width="1.4"/>`;
    return s + `</g>`;
  }
  function caracol(id, r) {
    const h = 28 + r.tono, linea = hsl(h, 45, 20), pie = hsl(95 + r.tono, 32, 80), pieO = hsl(95 + r.tono, 22, 56);
    let s = `<defs><radialGradient id="${id}c" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="${hsl(h + 6, 70, 84)}"/><stop offset=".6" stop-color="${hsl(h, 45, 64)}"/><stop offset="1" stop-color="${hsl(h - 4, 40, 42)}"/></radialGradient>`
      + `<linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pie}"/><stop offset="1" stop-color="${pieO}"/></linearGradient></defs>`;
    s += `<g class="ms-flota">`;
    // El pie y la cabeza, con sus ojos en lo alto de las antenas
    s += `<path d="M16 82C16 74 30 74 46 74H66C70 74 72 70 72 64V56C72 47 88 47 88 56V72C88 80 82 84 74 84H22C18 84 16 84 16 82Z" fill="url(#${id}p)" stroke="${linea}" stroke-width="1.8" stroke-linejoin="round"/>`;
    for (const [x, y, sg] of [[74, 34, -1], [86, 36, 1]]) s += `<path class="ms-antena" style="transform-origin:${f(80 + sg * 3)}px 50px" d="M${80 + sg * 3} 50Q${x + sg * -1} 44 ${x} ${y + 5}" stroke="${pieO}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` + ojos(x, y, 3.6, r.ojos === 1 ? 0 : r.ojos, linea, linea);
    s += mejillas(75, 85.5, 60, 2.3, hsl(350, 85, 75)) + sonrisa(77.8, 61, 2.4, linea);
    // Su concha, con la espiral del ciclo
    s += `<circle cx="42" cy="54" r="23" fill="url(#${id}c)" stroke="${linea}" stroke-width="1.8"/>`;
    const vueltas = 2 + r.dibujo * .5;
    let d = "";
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = -Math.PI / 2 + t * vueltas * 2 * Math.PI, rr = 19 * (1 - t * .92); d += `${i ? "L" : "M"}${f(42 + Math.cos(a) * rr)} ${f(54 + Math.sin(a) * rr)}`; }
    s += `<path d="${d}" stroke="${hsl(h - 6, 45, 32)}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".8"/>`;
    s += `<ellipse cx="34" cy="42" rx="6" ry="3.4" fill="#fff" opacity=".45" transform="rotate(-30 34 42)"/>`;
    return s + `</g>`;
  }
  const DIBUJO = { luz: luciernaga, polen: abeja, guardia: erizo, ciclo: caracol };

  function svg(e, s, o = {}) {
    const k = typeof e === "number" ? ESPECIES[e] : e, fn = DIBUJO[k] || luciernaga, r = rasgos(s), id = "ms" + (++serie), anim = o.anim !== false;
    const t = r.talla, nivel = o.nivel | 0;
    let out = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="ms${anim ? " ms-anim" : ""}" role="img" aria-label="${o.label || "Mascota de VITA"}">`;
    out += `<ellipse cx="50" cy="91" rx="${f(22 * t)}" ry="3.6" fill="#000" opacity=".28"/>`;
    out += `<g transform="translate(${f(50 - 50 * t)} ${f(88 - 88 * t)}) scale(${t})">${fn(id, r)}</g>`;
    if (nivel >= 3) out += corazon(85, 16, 7, nivel >= 4);
    return out + "</svg>";
  }

  // ---------- en el canvas de la colonia: diminuta, dando vueltas junto a su célula ----------
  // Cuanto más fuerte es su lazo, más cerca va. Las almas gemelas van unidas por un hilo de luz.
  const VEL = [0.0011, 0.0023, 0.0007, 0.00035]; // radianes por milisegundo: la abeja, la más rápida
  function orbita(cx, x, y, rad, e, nivel, t, ph, mia) {
    const d = rad + 3.2 + (4 - nivel) * 0.9, a = t * VEL[e] + ph * 3, s = mia ? 1.4 : 1;
    let px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.82;
    if (e === 1) { px += Math.sin(t / 45 + ph) * .7; py += Math.cos(t / 37 + ph) * .7; } // zumba
    if (nivel >= 4) { cx.strokeStyle = "rgba(255,127,168,.35)"; cx.lineWidth = .7; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(px, py); cx.stroke(); }
    if (e === 0) { // la luciérnaga se enciende y se apaga
      const b = .55 + .45 * Math.sin(t / 380 + ph * 5);
      cx.fillStyle = `rgba(245,230,99,${(.16 * b).toFixed(3)})`; cx.beginPath(); cx.arc(px, py, 4.4 * s, 0, 6.283); cx.fill();
      cx.fillStyle = `rgba(252,244,150,${(.55 + .45 * b).toFixed(3)})`; cx.beginPath(); cx.arc(px, py, 1.5 * s, 0, 6.283); cx.fill();
    } else if (e === 1) {
      cx.fillStyle = COLOR[1]; cx.beginPath(); cx.arc(px, py, 1.8 * s, 0, 6.283); cx.fill();
      cx.fillStyle = "rgba(90,58,34,.85)"; cx.fillRect(px - .4 * s, py - 1.7 * s, .8 * s, 3.4 * s);
    } else if (e === 2) {
      cx.fillStyle = COLOR[2]; cx.beginPath();
      for (let i = 0; i < 12; i++) { const q = i * Math.PI / 6 + a, rr = (i % 2 ? 1.3 : 2.5) * s; cx[i ? "lineTo" : "moveTo"](px + Math.cos(q) * rr, py + Math.sin(q) * rr); }
      cx.closePath(); cx.fill();
    } else {
      cx.fillStyle = COLOR[3]; cx.beginPath(); cx.arc(px, py, 1.9 * s, 0, 6.283); cx.fill();
      cx.strokeStyle = "rgba(110,76,46,.9)"; cx.lineWidth = .6; cx.beginPath(); cx.arc(px, py, .9 * s, 0, 4.8); cx.stroke();
    }
  }

  window.MascotasArte = { svg, orbita, ESPECIES, COLOR };
})();
