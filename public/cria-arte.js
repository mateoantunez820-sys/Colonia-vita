// Arte de las crías de VITA: dibuja en SVG una cría (o su huevo) a partir de sus genes. Sin dependencias.
// CriaArte.cria(v, o) y CriaArte.huevo(ap, calor, o) devuelven el SVG como texto.
// v: { ap: {hue, forma, patron, ojos, antenas, marca}, etapa 1-5, rasgos: {ef, res, fer, brillo}, humor, primera }
// o: { anim: false para dibujarla quieta, dormida: true, label }
(() => {
  const TAU = Math.PI * 2, f = x => Math.round(x * 10) / 10;
  const hsl = (h, s, l) => `hsl(${Math.round(h) % 360} ${s}% ${l}%)`;
  let serie = 0;
  // Curva cerrada y suave que pasa por todos los puntos (Catmull-Rom convertida a Bézier)
  function suave(p) {
    let d = `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length], e = p[(i + 2) % p.length];
      d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
    }
    return d + "Z";
  }
  function azar(n) { let s = (Math.imul(n + 1, 2654435761) >>> 0) || 7; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  const ESCALA = [0.6, 0.6, 0.72, 0.84, 0.93, 1];
  // Radio del contorno en el ángulo t (0 = derecha, π/2 = abajo). La fase hace que el cuerpo respire.
  function radio(forma, R, t, fase) {
    const s = Math.sin(t);
    if (forma === 0) return R * (1 + 0.08 * s + 0.2 * Math.pow(Math.max(0, -s), 12) + 0.018 * Math.sin(3 * t + fase)); // gota
    if (forma === 1) return R * (1 + 0.06 * Math.sin(5 * t + fase) + 0.035 * Math.sin(3 * t - fase)); // ameba
    if (forma === 2) { const b = Math.max(0, s); return R * (1 - 0.2 * b + 0.055 * b * Math.cos(8 * t + fase) + 0.012 * Math.sin(2 * t + fase)); } // medusa
    return R * (1 + 0.11 * Math.cos(5 * (t + Math.PI / 2)) + 0.018 * Math.sin(2 * t + fase)); // estrella
  }
  const contorno = (forma, R, cx, cy, fase, k = 1) => suave(Array.from({ length: 40 }, (_, i) => {
    const t = i / 40 * TAU, r = radio(forma, R, t, fase) * k; return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  }));
  const punto = (forma, R, cx, cy, t, k = 1) => { const r = radio(forma, R, t, 0) * k; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
  const estrella = (x, y, r, color, cls = "cr-chispa", delay = 0) =>
    `<path class="${cls}" style="transform-origin:${f(x)}px ${f(y)}px;animation-delay:${delay}s" d="M${f(x)} ${f(y - r)}Q${f(x + r * .18)} ${f(y - r * .18)} ${f(x + r)} ${f(y)}Q${f(x + r * .18)} ${f(y + r * .18)} ${f(x)} ${f(y + r)}Q${f(x - r * .18)} ${f(y + r * .18)} ${f(x - r)} ${f(y)}Q${f(x - r * .18)} ${f(y - r * .18)} ${f(x)} ${f(y - r)}Z" fill="${color}"/>`;

  function cria(v, o = {}) {
    const ap = v.ap, et = Math.min(5, Math.max(1, v.etapa | 0)), g = v.rasgos || { ef: 4, res: 4, fer: 4, brillo: 0 };
    const id = "cr" + (++serie), h = ap.hue, R = 50 * ESCALA[et], cx = 100, cy = 122 - 10 * ESCALA[et];
    const anim = o.anim !== false, dormida = !!o.dormida, humor = v.humor || "feliz", rnd = azar(ap.marca * 31 + 7);
    const luz = hsl(h, 88, 82), medio = hsl(h, 72, 64), hondo = hsl(h, 62, 47), linea = hsl(h, 55, 23), acento = hsl(h + 28, 92, 87), pupila = hsl(h, 45, 13);
    const fases = [0, Math.PI / 2, Math.PI, 1.5 * Math.PI, 0].map(p => contorno(ap.forma, R, cx, cy, p));
    const respira = anim ? `<animate attributeName="d" dur="6s" repeatCount="indefinite" values="${fases.join(";")}"/>` : "";
    const top = punto(ap.forma, R, cx, cy, -Math.PI / 2);
    let s = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="cr${anim ? " cr-anim" : ""}" role="img" aria-label="${o.label || "Cría de VITA"}"><defs>`
      + `<radialGradient id="${id}b" cx="36%" cy="28%" r="82%"><stop offset="0" stop-color="${luz}"/><stop offset=".55" stop-color="${medio}"/><stop offset="1" stop-color="${hondo}"/></radialGradient>`
      + `<radialGradient id="${id}g"><stop offset="0" stop-color="${hsl(h, 95, 72)}" stop-opacity=".95"/><stop offset="1" stop-color="${hsl(h, 95, 72)}" stop-opacity="0"/></radialGradient>`
      + `<clipPath id="${id}c"><path d="${fases[0]}">${respira}</path></clipPath></defs>`;
    const brillo = Math.min(10, g.brillo || 0);
    s += `<circle class="cr-aura" style="transform-origin:${cx}px ${f(cy)}px" cx="${cx}" cy="${f(cy)}" r="${f(R * 1.8)}" fill="url(#${id}g)" opacity="${f(0.1 + brillo * 0.06)}"/>`;
    s += `<ellipse class="cr-sombra" cx="${cx}" cy="${f(cy + R * 1.08 + 12)}" rx="${f(R * 0.72)}" ry="${f(3.5 + R * 0.07)}" fill="#000" opacity=".3"/><g class="cr-flota">`;
    // Colas (agilidad) o tentáculos (medusa), detrás del cuerpo
    if (ap.forma === 2) {
      for (let i = 0; i < 5; i++) {
        const t = Math.PI * (0.22 + 0.14 * i), [x, y] = punto(2, R, cx, cy, t, 0.9), L = R * (0.55 + 0.1 * (i % 2)) + g.ef;
        s += `<path class="cr-cola" style="transform-origin:${f(x)}px ${f(y)}px;animation-delay:${-i * .3}s" d="M${f(x)} ${f(y)}c${f(-5)} ${f(L * .35)} ${f(6)} ${f(L * .6)} 0 ${f(L)}" stroke="${hondo}" stroke-width="3.4" stroke-linecap="round" fill="none"/>`;
      }
    } else {
      const n = 1 + Math.floor(g.ef / 4);
      for (let i = 0; i < n; i++) {
        const t = Math.PI / 2 + (i - (n - 1) / 2) * 0.42, [x, y] = punto(ap.forma, R, cx, cy, t, 0.9), L = 12 + g.ef * 0.9;
        const dx = Math.cos(t) * L, dy = Math.sin(t) * L;
        s += `<path class="cr-cola" style="transform-origin:${f(x)}px ${f(y)}px;animation-delay:${-i * .4}s" d="M${f(x)} ${f(y)}q${f(dx * .5 + 6)} ${f(dy * .5)} ${f(dx)} ${f(dy)}" stroke="${linea}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
      }
    }
    // Cuerpo, con la membrana más gruesa cuanta más fuerza
    s += `<path d="${fases[0]}" fill="url(#${id}b)" stroke="${linea}" stroke-width="${f(1.8 + g.res * 0.3)}" stroke-linejoin="round">${respira}</path>`;
    // Dibujo de la piel
    const ey = cy - R * 0.1, sep = R * 0.36;
    let p = "";
    if (ap.patron === 0) p = `<ellipse cx="${cx}" cy="${f(cy + R * .5)}" rx="${f(R * .66)}" ry="${f(R * .42)}" fill="${luz}" opacity=".55"/>`;
    else if (ap.patron === 1) {
      for (let i = 0, n = 5 + ap.marca % 4, k = 0; i < n && k < 60; k++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.9, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (Math.abs(y - ey) < R * .32 && Math.abs(x - cx) < sep + R * .3) continue; // la cara, libre
        p += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R * (0.07 + rnd() * 0.07))}" fill="${acento}" opacity=".75"/>`; i++;
      }
    } else if (ap.patron === 2) {
      for (let k = 0; k < 3; k++) { const y = cy + R * (0.34 + k * 0.24); p += `<path d="M${f(cx - R * 1.1)} ${f(y)}Q${cx} ${f(y + R * .22)} ${f(cx + R * 1.1)} ${f(y)}" stroke="${hondo}" stroke-width="${f(R * .1)}" fill="none" opacity=".45"/>`; }
    } else {
      for (let k = 0; k < 3; k++) p += `<ellipse cx="${cx}" cy="${f(cy + R * .5)}" rx="${f(R * (.28 + k * .24))}" ry="${f(R * (.16 + k * .15))}" stroke="${acento}" stroke-width="${f(R * .05)}" fill="none" opacity=".7"/>`;
    }
    s += `<g clip-path="url(#${id}c)">${p}</g>`;
    s += `<ellipse cx="${f(cx - R * .34)}" cy="${f(cy - R * .44)}" rx="${f(R * .25)}" ry="${f(R * .13)}" fill="#fff" opacity=".42" transform="rotate(-28 ${f(cx - R * .34)} ${f(cy - R * .44)})"/>`;
    // Coraza de las muy fuertes
    if (g.res >= 10) s += `<path d="${contorno(ap.forma, R, cx, cy, 0, 1.12)}" stroke="${hondo}" stroke-width="1.8" stroke-dasharray="3 5" stroke-linecap="round" fill="none" opacity=".55"/>`;
    // Brotes en el borde (vitalidad)
    const yemas = [-2.55, -0.6, 2.75, 0.4, -2.95, -0.2];
    for (let i = 0; i < Math.min(5, Math.floor(g.fer / 3)); i++) {
      const [x, y] = punto(ap.forma, R, cx, cy, yemas[i], 1.02);
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3.2 + R * .06)}" fill="url(#${id}b)" stroke="${linea}" stroke-width="1.5"/>`;
    }
    // Antenas o corona de cilios
    if (ap.antenas === 1 && et >= 2) {
      for (const sg of [-1, 1]) {
        const [x, y] = punto(ap.forma, R, cx, cy, -Math.PI / 2 + sg * 0.42, 0.96), L = 12 + et * 3;
        const ex = x + sg * L * .55, eY = y - L;
        s += `<g class="cr-antena" style="transform-origin:${f(x)}px ${f(y)}px;animation-delay:${sg * .5}s"><path d="M${f(x)} ${f(y)}Q${f(x + sg * 2)} ${f(y - L * .7)} ${f(ex)} ${f(eY)}" stroke="${linea}" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="${f(ex)}" cy="${f(eY)}" r="4.2" fill="${acento}" stroke="${linea}" stroke-width="1.5"/></g>`;
      }
    } else if (ap.antenas === 2 && et >= 2) {
      for (let i = -3; i <= 3; i++) {
        const t = -Math.PI / 2 + i * 0.2, [x, y] = punto(ap.forma, R, cx, cy, t, 0.98), L = 6 + et;
        s += `<path class="cr-antena" style="transform-origin:${f(x)}px ${f(y)}px;animation-delay:${i * .15}s" d="M${f(x)} ${f(y)}l${f(Math.cos(t) * L)} ${f(Math.sin(t) * L)}" stroke="${linea}" stroke-width="2.2" stroke-linecap="round"/>`;
      }
    }
    // Cara
    const er = R * (et === 1 ? 0.21 : 0.175), triste = humor === "triste" || humor === "con hambre", feliz = humor === "feliz" || humor === "volvió";
    const ojos = ap.ojos === 1 ? [[cx, ey, er * 1.35]] : ap.ojos === 2 ? [[cx - sep, ey, er], [cx + sep, ey, er]] : [[cx - sep, ey + 2, er], [cx + sep, ey + 2, er], [cx, ey - R * .32, er * .78]];
    for (const [x, y, r] of ojos) {
      if (dormida) s += `<path d="M${f(x - r)} ${f(y)}q${f(r)} ${f(r * .8)} ${f(2 * r)} 0" stroke="${linea}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
      else s += `<g class="cr-ojo"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#fff" stroke="${linea}" stroke-width="1.3"/><circle cx="${f(x + r * .06)}" cy="${f(y + r * (triste ? .3 : .12))}" r="${f(r * .58)}" fill="${pupila}"/><circle cx="${f(x - r * .14)}" cy="${f(y - r * (triste ? 0 : .16))}" r="${f(r * .22)}" fill="#fff"/></g>`
        + (triste ? `<path d="M${f(x - r * 1.05)} ${f(y - r * 1.25 - (x < cx ? -2 : 2))}L${f(x + r * 1.05)} ${f(y - r * 1.25 + (x < cx ? -2 : 2))}" stroke="${linea}" stroke-width="2" stroke-linecap="round"/>` : "");
    }
    const my = cy + R * (ap.ojos === 1 ? .38 : .3), mw = R * .2, boca = hsl(h, 50, 20);
    if (!triste && !dormida) {
      const mx = ap.ojos === 1 ? R * .5 : sep + er * .35;
      for (const sg of [-1, 1]) s += `<ellipse cx="${f(cx + sg * mx)}" cy="${f(ey + er * 1.45)}" rx="${f(er * .62)}" ry="${f(er * .36)}" fill="${hsl(h + 330, 92, 72)}" opacity=".55"/>`;
    }
    if (dormida) s += `<ellipse cx="${cx}" cy="${f(my + 2)}" rx="2.6" ry="2" fill="${boca}"/>`;
    else if (triste) s += `<path d="M${f(cx - mw)} ${f(my + mw * .45)}Q${cx} ${f(my - mw * .25)} ${f(cx + mw)} ${f(my + mw * .45)}" stroke="${boca}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`;
    else if (feliz) s += `<path d="M${f(cx - mw)} ${f(my)}Q${cx} ${f(my + mw * 1.5)} ${f(cx + mw)} ${f(my)}Z" fill="${boca}" stroke="${boca}" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="${cx}" cy="${f(my + mw * .52)}" rx="${f(mw * .42)}" ry="${f(mw * .22)}" fill="${hsl(350, 85, 72)}"/>`;
    else if (humor === "aburrida") s += `<path d="M${f(cx - mw * .6)} ${f(my + 2)}h${f(mw * 1.2)}" stroke="${boca}" stroke-width="2.6" stroke-linecap="round"/>`;
    else s += `<path d="M${f(cx - mw * .8)} ${f(my)}Q${cx} ${f(my + mw * .75)} ${f(cx + mw * .8)} ${f(my)}" stroke="${boca}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`;
    // Lo que trae cada etapa
    if (et === 1) s += estrella(cx + R * .8, cy - R * 1.02, 6, acento);
    if (et === 2) s += `<path d="M${f(top[0])} ${f(top[1] + 2)}q-1 -7 1 -13" stroke="${hsl(135, 45, 32)}" stroke-width="2.6" stroke-linecap="round" fill="none"/><path d="M${f(top[0] + 1)} ${f(top[1] - 9)}c4 -7 11 -7 14 -4c-4 5 -10 6 -14 4Z" fill="${hsl(120, 55, 52)}" stroke="${hsl(135, 45, 30)}" stroke-width="1.3"/><path d="M${f(top[0] + .5)} ${f(top[1] - 6)}c-4 -6 -10 -5 -12 -2c4 4 9 4 12 2Z" fill="${hsl(110, 55, 58)}" stroke="${hsl(135, 45, 30)}" stroke-width="1.3"/>`;
    const oro = "#F0B03F";
    if (v.primera) {
      const x = top[0], y = top[1] - 3;
      s += `<path d="M${f(x - 11)} ${f(y)}l-2.5 -12l7 6l6.5 -10l6.5 10l7 -6l-2.5 12Z" fill="${oro}" stroke="${hsl(35, 70, 32)}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${f(x)}" cy="${f(y - 5)}" r="2" fill="#fff" opacity=".9"/>`;
    }
    if (et === 5) {
      const y = top[1] - (v.primera ? 26 : 12);
      s += `<ellipse cx="${f(top[0])}" cy="${f(y)}" rx="${f(R * .42)}" ry="${f(R * .11)}" stroke="${oro}" stroke-width="3.2" fill="none" opacity=".95"/>`;
    }
    // Chispas de brillo (agua)
    const nb = brillo >= 8 ? 4 : brillo >= 4 ? 2 : brillo >= 1 ? 1 : 0;
    for (let i = 0; i < nb; i++) { const a = -Math.PI / 2 + (i % 2 ? 1 : -1) * (0.9 + 0.35 * i), d = R * (1.3 + rnd() * .2); s += estrella(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + rnd() * 3, "#fff", "cr-chispa", -i * .6); }
    s += `</g>`;
    if (dormida) s += `<g fill="currentColor" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800"><text class="cr-z" x="${f(cx + R * .7)}" y="${f(cy - R * .9)}" font-size="13">z</text><text class="cr-z" style="animation-delay:-1.1s" x="${f(cx + R * .95)}" y="${f(cy - R * 1.2)}" font-size="17">z</text><text class="cr-z" style="animation-delay:-2.2s" x="${f(cx + R * 1.25)}" y="${f(cy - R * 1.55)}" font-size="21">Z</text></g>`;
    return s + "</svg>";
  }

  function huevo(ap, calor = 0, o = {}) {
    const id = "hv" + (++serie), h = ap.hue, cx = 100, cy = 112, rx = 44, ry = 56, rnd = azar(ap.marca * 17 + 3);
    const d = suave(Array.from({ length: 40 }, (_, i) => { const t = i / 40 * TAU, s = Math.sin(t); return [cx + rx * Math.cos(t) * (1 - 0.14 * Math.max(0, -s)), cy + ry * s]; }));
    const mancha = hsl(h, 70, 70), borde = hsl(h, 45, 42), grieta = hsl(h, 40, 22);
    let s = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="hv" role="img" aria-label="${o.label || "Huevo de VITA"}"><defs>`
      + `<radialGradient id="${id}b" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${hsl(h, 70, 97)}"/><stop offset=".6" stop-color="${hsl(h, 55, 86)}"/><stop offset="1" stop-color="${hsl(h, 45, 70)}"/></radialGradient>`
      + `<radialGradient id="${id}g"><stop offset="0" stop-color="#F7B955" stop-opacity=".9"/><stop offset="1" stop-color="#F7B955" stop-opacity="0"/></radialGradient>`
      + `<clipPath id="${id}c"><path d="${d}"/></clipPath></defs>`;
    s += `<circle cx="${cx}" cy="${cy}" r="92" fill="url(#${id}g)" opacity="${f(0.14 + calor * 0.22)}"/>`;
    s += `<ellipse cx="${cx}" cy="${cy + ry + 8}" rx="34" ry="6" fill="#000" opacity=".3"/>`;
    s += `<g class="${calor ? `hv-t${Math.min(2, calor)}` : "hv-quieto"}" style="transform-origin:${cx}px ${cy + ry}px"><path d="${d}" fill="url(#${id}b)" stroke="${borde}" stroke-width="2"/><g clip-path="url(#${id}c)">`;
    if (ap.patron === 2 || ap.patron === 3) for (let k = 0; k < 2; k++) {
      const y = cy + 6 + k * 22;
      s += ap.patron === 2 ? `<path d="M${cx - rx} ${y}l11 -7l11 7l11 -7l11 7l11 -7l11 7l11 -7l11 7" stroke="${mancha}" stroke-width="5" fill="none" stroke-linejoin="round"/>` : `<rect x="${cx - rx}" y="${y - 4}" width="${2 * rx}" height="7" fill="${mancha}" opacity=".85"/>`;
    }
    else for (let i = 0; i < (ap.patron === 1 ? 7 : 12); i++) {
      const x = cx + (rnd() - .5) * rx * 1.7, y = cy + (rnd() - .4) * ry * 1.6;
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(ap.patron === 1 ? 4 + rnd() * 5 : 1.3 + rnd() * 1.4)}" fill="${mancha}" opacity="${ap.patron === 1 ? .85 : .7}"/>`;
    }
    s += `</g><ellipse cx="${cx - 16}" cy="${cy - 26}" rx="11" ry="17" fill="#fff" opacity=".5" transform="rotate(-20 ${cx - 16} ${cy - 26})"/>`;
    if (calor >= 1) s += `<path d="M${cx + 10} ${cy - 50}l-5 10l7 5l-6 11l6 6" stroke="${grieta}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    if (calor >= 2) s += `<path d="M${cx - 30} ${cy - 22}l9 4l3 -8l9 6l5 -7l9 5" stroke="${grieta}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M${cx + 18} ${cy - 18}l8 3l2 -7l9 3" stroke="${grieta}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    if (o.lazo) {
      const lz = "#E5484D", lzo = "#9E2A2F";
      s += `<g clip-path="url(#${id}c)"><rect x="${cx - 6}" y="${cy - ry}" width="12" height="${2 * ry}" fill="${lz}"/><rect x="${cx - rx}" y="${cy - 2}" width="${2 * rx}" height="12" fill="${lz}"/></g>`
        + `<path d="M${cx} ${cy - ry + 4}c-10 -14 -26 -12 -24 -2c2 8 14 6 24 2Zm0 0c10 -14 26 -12 24 -2c-2 8 -14 6 -24 2Z" fill="${lz}" stroke="${lzo}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy - ry + 4}" r="4.5" fill="${lz}" stroke="${lzo}" stroke-width="1.6"/>`;
    }
    return s + "</g></svg>";
  }

  // Nido vacío con las cáscaras de su huevo: la cría está de excursión
  function nido(ap, o = {}) {
    const h = ap.hue, rama = hsl(28, 38, 40), clara = hsl(32, 40, 58), oscura = hsl(26, 40, 24), rnd = azar(ap.marca + 11);
    let s = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="cr" role="img" aria-label="${o.label || "Nido vacío: tu cría está de excursión"}">`;
    s += `<path d="M104 104C118 70 136 62 158 64" stroke="currentColor" stroke-width="2.6" stroke-dasharray="1 9" stroke-linecap="round" fill="none" opacity=".7"/>`;
    s += `<path d="M156 58c0 -12 20 -12 20 0c0 10 -10 19 -10 19s-10 -9 -10 -19Z" fill="${hsl(h, 72, 64)}" stroke="${hsl(h, 55, 23)}" stroke-width="1.8"/><circle cx="166" cy="58" r="3.4" fill="#fff"/>`;
    s += `<ellipse cx="100" cy="150" rx="62" ry="11" fill="#000" opacity=".3"/>`;
    s += `<ellipse cx="100" cy="116" rx="60" ry="15" fill="${oscura}"/>`;
    // Las dos mitades de su cáscara, dentro del nido
    const cas = hsl(h, 55, 88), borde = hsl(h, 45, 42);
    s += `<path d="M70 124l3 -17l6 7l5 -10l6 8l5 -6l2 18Z" fill="${cas}" stroke="${borde}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<path d="M108 125l2 -15l6 6l5 -9l5 8l6 -5l1 15Z" fill="${cas}" stroke="${borde}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<path d="M40 116C42 152 158 152 160 116C150 128 50 128 40 116Z" fill="${rama}"/>`;
    for (let i = 0; i < 16; i++) {
      const x = 44 + i * 7.4, y = 118 + Math.sin(Math.PI * (x - 40) / 120) * (8 + rnd() * 16), sg = i % 2 ? 1 : -1;
      s += `<path d="M${f(x - 9)} ${f(y - 3 * sg)}q9 ${f(sg * 4 + rnd() * 3)} 18 ${f(sg * 5)}" stroke="${i % 3 ? clara : oscura}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
    }
    s += `<path d="M42 112l-12 -6M158 112l13 -7M150 120l16 4M50 121l-15 5" stroke="${clara}" stroke-width="2.4" stroke-linecap="round"/>`;
    return s + "</svg>";
  }

  window.CriaArte = { cria, huevo, nido };
})();
