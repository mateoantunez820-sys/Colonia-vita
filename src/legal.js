// Términos de uso, privacidad y aviso de que VIT no es una inversión.
// El titular y su contacto se ponen en Render (LEGAL_TITULAR y LEGAL_CONTACTO),
// así no quedan datos personales en el código.

export const LEGAL_VERSION = "28 de septiembre de 2026";
export const VIT_NOTICE = "VIT y CEL son monedas y fichas del juego: no son una inversión ni un producto financiero, no tienen valor económico y no se pueden cambiar por dinero.";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function legalInfo(env = process.env) {
  const titular = String(env.LEGAL_TITULAR || "").trim().slice(0, 120);
  const contacto = String(env.LEGAL_CONTACTO || "").trim().slice(0, 120);
  return { titular, contacto, completo: !!(titular && contacto) };
}

function quien({ titular, contacto }) {
  const t = titular ? `ofrecido por <b>${esc(titular)}</b> («el titular»)` : "ofrecido por su titular («el titular»)";
  return `Colonia VITA, también llamada Federación VITA, es un juego en línea ${t}.${contacto ? ` Contacto: <b>${esc(contacto)}</b>.` : ""}`;
}

function terminos(info) {
  return `<h1>Términos de uso</h1>
<p class="v">Versión del ${LEGAL_VERSION}</p>
<p>${quien(info)} Al entrar en el juego aceptas estos términos.</p>

<h2>1. VIT y CEL no son dinero ni una inversión</h2>
<p class="aviso">${VIT_NOTICE}</p>
<ul>
<li>VIT es la moneda virtual del juego y CEL son sus células. Solo sirven dentro de Colonia VITA.</li>
<li>No son una criptomoneda: la «cadena de bloques» del juego es un registro interno, no una blockchain pública.</li>
<li>El titular no paga dinero por VIT ni por células, y no se pueden cambiar por dinero, bienes ni servicios fuera del juego.</li>
<li>Las carteras de la IA son una mecánica del juego: se juega con VIT, y lo que se gana o se pierde es VIT del juego.</li>
<li>No está permitido vender, comprar ni intercambiar VIT, células o cuentas por dinero u otros bienes fuera del juego.</li>
<li>El titular puede ajustar la economía del juego (precios, recompensas y eventos) para mantenerlo equilibrado.</li>
</ul>

<h2>2. Tu cuenta</h2>
<ul>
<li>Entras con un nombre de jugador. Tu clave de acceso se guarda en tu navegador.</li>
<li>Guarda tu código de recuperación: es la única forma de recuperar la cuenta si cambias de dispositivo o borras el navegador. Quien tenga el código puede entrar en tu cuenta, y el titular no puede recuperarla sin él.</li>
<li>Elige un nombre que no ofenda ni se haga pasar por otra persona. El titular puede retirar nombres ofensivos.</li>
<li>No crees cuentas en masa ni uses programas que jueguen por ti. El titular puede suspender cuentas que hagan trampas o abusos.</li>
</ul>

<h2>3. Compras</h2>
<ul>
<li>Si el juego ofrece paquetes de VIT, verás el precio y lo que recibes antes de pagar. El pago lo procesa un proveedor de pagos externo, y el juego no ve ni guarda los datos de tu tarjeta.</li>
<li>Comprar VIT es comprar un contenido digital para usar dentro del juego, que se entrega en cuanto se confirma el pago. Antes de pagar se te pedirá que aceptes la entrega inmediata y, si vives en la Unión Europea, que reconozcas que por eso pierdes el derecho de desistimiento.</li>
<li>Si eres menor de edad, necesitas el permiso de tu madre, padre o tutor para comprar.</li>
<li>Si algo falla con una compra, escribe al contacto del titular.</li>
</ul>

<h2>4. Anuncios</h2>
<p>El juego puede mostrar anuncios con recompensa que tú eliges ver. Las recompensas por anuncios tienen un tope diario.</p>

<h2>5. Hábitos de salud</h2>
<p>Los hábitos los marcas tú y nadie los comprueba. Son un juego para motivarte, no un consejo médico ni un servicio de salud. Para cualquier duda sobre tu salud, consulta a un profesional.</p>

<h2>6. Inteligencia artificial</h2>
<p>Las colonias las gestiona una IA: un autopiloto y, a veces, Claude, de Anthropic. Sus decisiones y mensajes son parte del juego y pueden equivocarse.</p>

<h2>7. Disponibilidad y cambios</h2>
<p>El juego es una simulación que puede tener fallos, pausas o reinicios. El titular puede cambiar el juego y estos términos, y la fecha de arriba indica la última versión. El juego se ofrece tal como está, en la medida en que la ley lo permita.</p>

<h2>8. Tus derechos</h2>
<p>Nada de estos términos limita los derechos que te reconozca como consumidor la ley de tu país.</p>`;
}

function privacidad(info) {
  return `<h1>Privacidad</h1>
<p class="v">Versión del ${LEGAL_VERSION}</p>
<p>${quien(info)} El titular es el responsable de los datos que se describen aquí.</p>

<h2>Qué datos se guardan</h2>
<ul>
<li>El nombre de jugador que eliges. Es público: aparece en el ranking y en las bitácoras de las colonias.</li>
<li>Una huella (hash) de tu clave de acceso y de tu código de recuperación. Ni la clave ni el código se guardan tal cual.</li>
<li>Lo que haces en el juego: tu VIT, tus células, tus participaciones, las misiones, los hábitos que marcas, los anuncios que ves y los días que entras.</li>
<li>Tu dirección IP se usa solo en la memoria del servidor para frenar abusos, como crear muchas cuentas desde la misma red, y no se guarda en el mundo del juego. El proveedor de alojamiento puede registrarla en sus registros técnicos.</li>
<li>Tu navegador guarda tu clave de acceso y la última colonia que viste. El juego no usa cookies propias.</li>
</ul>

<h2>Para qué</h2>
<p>Para que el juego funcione, para evitar trampas y abusos, y para equilibrar la economía del juego. No se venden datos a nadie.</p>

<h2>Con quién se comparten</h2>
<ul>
<li><b>Alojamiento:</b> el juego funciona en servidores de Render, en Estados Unidos.</li>
<li><b>Inteligencia artificial:</b> cuando está activa, el estado de cada colonia se envía a Anthropic para decidir su estrategia. Puede incluir nombres de jugadores que aparecen en la bitácora de la colonia.</li>
<li><b>Tipografías:</b> la página carga sus letras desde Google Fonts, así que tu navegador se conecta a Google.</li>
<li><b>Clima:</b> el servidor consulta el tiempo a Open-Meteo para una ubicación fija, sin enviar datos tuyos.</li>
<li><b>Pagos y anuncios:</b> si se activan, el pago lo procesa Stripe y los anuncios los sirve Google. Cada uno trata tus datos según su propia política.</li>
</ul>

<h2>Cuánto tiempo</h2>
<p>Mientras exista tu cuenta. Puedes pedir que se borre escribiendo al contacto del titular. Los mensajes antiguos de las bitácoras pueden mostrar tu nombre hasta que se renueven.</p>

<h2>Tus derechos</h2>
<p>Puedes pedir ver, corregir o borrar tus datos, oponerte a su uso o llevártelos, escribiendo al contacto del titular. También puedes reclamar ante la autoridad de protección de datos de tu país.</p>

<h2>Menores</h2>
<p>Si tienes menos de 14 años, pide permiso a tu madre, padre o tutor antes de jugar.</p>`;
}

const PAGES = { terminos, privacidad };

export function legalPage(kind, info = legalInfo()) {
  const body = PAGES[kind]?.(info);
  if (!body) return null;
  const title = kind === "terminos" ? "Términos de uso" : "Privacidad";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Colonia VITA</title>
<meta name="theme-color" content="#0A1519">
<style>
:root{color-scheme:dark;--bg:#0A1519;--surf:#11222A;--line:#24414D;--ink:#E4EEEF;--mute:#8AA4AD;--vit:#F0B03F}
html,body{background:var(--bg);color:var(--ink);margin:0}
body{font:16px/1.6 ui-sans-serif,system-ui,sans-serif;padding:24px 16px 48px}
main{max-width:720px;margin:0 auto}
h1{font-size:30px;line-height:1.15;margin:12px 0 4px}h2{font-size:18px;margin:28px 0 8px}
.v{color:var(--mute);margin:0 0 16px;font-size:14px}
.aviso{background:var(--surf);border:1px solid var(--line);border-left:3px solid var(--vit);border-radius:8px;padding:12px 14px}
a{color:var(--vit)}li{margin:4px 0}
nav{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}
</style>
</head>
<body>
<main>
<nav><a href="/">← Volver al juego</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></nav>
${body}
</main>
</body>
</html>`;
}
