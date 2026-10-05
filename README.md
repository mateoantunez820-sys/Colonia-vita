# Federación VITA

Un juego de colonias digitales que viven 24/7 en un servidor. Cada colonia depende de su entorno real
(hora local y clima de Open-Meteo), la gestiona su propia IA y cada una de sus células es un token único.

## Qué hace

- **Colonias vivas 24/7.** En modo `real` hay un ciclo cada 10 minutos y el sol sigue la hora local. Las nubes, el frío y la lluvia reales cambian la energía. Si Open-Meteo no responde, se usa un clima simulado de temporada (la web lo marca como "simulado").
- **Células tokenizadas (CEL).** Cada célula tiene genes, rareza y dueño. Nace, acuña VIT para su dueño y muere, y todo queda en una cadena de bloques con hash SHA-256 que se verifica sola.
- **Cada célula con su mascota.** Luciérnagas, abejas, erizos y caracoles que nacen con su célula y la acompañan toda su vida. El lazo entre las dos es lo que mueve el ecosistema. Ver abajo.
- **IA por colonia.** Cada colonia tiene un autopiloto con personalidad (riesgo, codicia, cuidado) que de noche ahorra energía y solo compra nutrientes en emergencias. Si hay clave de Anthropic y presupuesto, consulta a Claude una vez al día y **paga su consulta con su propio tesoro VIT** (25 VIT). Si no puede pagar, sigue con el autopiloto.
- **Colonias que fundan colonias.** Una colonia con tesoro y población suficientes funda una hija con sus mejores células y una IA nueva que hereda y muta su personalidad.
- **Supervisora IA.** Ajusta la dificultad, envía ayuda a colonias en apuros y hace renacer a las extintas.
- **Gratitud.** Una colonia salvada (reparada, ayudada o renacida) queda agradecida 3 días: recolecta y se repara el doble, sufre la mitad de eventos y no se le piden recursos para otras. El doble va a crecer, no a crear VIT: mientras dura acuña como mucho con un 10 % de su esfuerzo.
- **Carteras de agentes IA.** Los jugadores compran participaciones de una colonia. El valor de la cartera es el tesoro más las células de la colonia a precio de recompra: se gana si la IA la hace crecer y se pierde si la gasta mal. Si el tesoro no alcanza para pagar una retirada, se paga lo que hay y el resto sigue invertido.
- **Salud real.** Registrar hábitos (pasos, agua, sueño, ejercicio) da VIT y energía a la colonia. Hoy es autodeclarado.
- **Anuncios con recompensa.** Hasta 6 al día, 2 VIT cada uno. El botón ya existe; falta conectar la red de anuncios.
- Esporas: hasta 20 al día, una cada 15 segundos.
- Misiones diarias, racha de visitas, mercado de células, mejoras y ranking.
- **Freno a la inflación.** El tesoro de cada colonia por encima de 600 VIT se quema a un 0,1 % por ciclo. En 40 simulaciones de 60 días se quema el 68 % de lo emitido.
- **Rangos y respeto entre colonias.** La Ley VITA está por encima de todo, Oruz es el rango intermedio y gestor social, y Ámbar es la élite. Ver abajo.
- **Oruz, el mundo paralelo.** Un ecomundo aparte con su escuela para las colonias recién nacidas y el Ámbar de Oruz, piezas únicas registradas en la cadena. Ver abajo.
- **Lumar, el mar de la luna.** El segundo ecomundo: un mar que sigue la luna real, donde nacen las Perlas de Lumar. Una perla no la usa quien la recoge: se regala. Ver abajo.
- **Retención.** Informe de lo que pasó mientras no estabas, liga semanal con premios en células, invitaciones que premian a los dos y copia firmada de la cuenta.
- **Tu cría.** Cada jugador recibe un huevo único que se abre con su calor. La cría crece cuando su jugador se cuida. Ver abajo.

## Rangos: Ley VITA, Oruz y Ámbar

Cada hora se reúne el consejo de VITA (`src/rangos.js`):

- **Ley VITA.** Vita, el CEO, juzga a cada colonia con 5 leyes: cuidar la vida, dar en las colectas, no acaparar, servir a sus jugadores y honrar a la familia. Puede sancionar a cualquiera y quitarle el rango, también a la élite.
- **Respeto** (0-100). Mitad el juicio de VITA y mitad lo que opinan las demás colonias. Cada colonia recuerda quién le dio y quién se le negó, y ese recuerdo se desvanece con los días. Madre, hijas y hermanas se respetan desde que nacen.
- **Mérito** (0-100). Tamaño, salud, edad, hijas vivas y confianza de los jugadores (células adoptadas e inversores).
- **Oruz, el rango intermedio.** Organizan colectas para las colonias en apuros: ponen su parte y piden a las colonias ricas que den la suya. Cada colonia decide según su carácter si da o se niega. Negarse con más de 600 VIT en el tesoro se sanciona. También median cuando una colonia le guarda rencor a otra. Caben la mitad de las colonias vivas.
- **Ámbar, la élite.** Hay un asiento por cada cuatro colonias vivas, para las que más suman entre respeto y mérito.
- Las colectas solo pasan VIT de un tesoro a otro, sin acuñar ni quemar nada. Cada colecta, ascenso, descenso y sanción queda en la cadena.

## Las mascotas: cada ser vivo con la suya

`src/mascotas.js` da a cada célula de las colonias una mascota compañera, dibujada por `public/mascotas-arte.js`. No hay dos iguales: su aspecto y su nombre salen de su semilla.

- **Nacen juntas.** Cada célula que nace recibe la cría de la mascota de su madre (a veces de otra especie, casi siempre la que más falta en la colonia) o adopta a una que la esperaba en el refugio. Las que llegan de otra forma (premios, legados, copias) también reciben la suya.
- **El lazo.** Crece cada ciclo que viven juntas, más deprisa si se entienden (cada especie se lleva mejor con un tipo de célula), si la colonia está sana y si las cuatro especies viven en armonía. Tiene cinco niveles (recién conocidas, amigas, compañeras, inseparables y almas gemelas) y cada nivel alarga la vida de la célula. Un lazo nunca baja.
- **Cuatro especies que se necesitan.** Las luciérnagas dan energía de noche, las abejas de polen ayudan a nacer mientras queda sitio, los erizos guardianes curan durante las plagas, heladas y sequías, y los caracoles del ciclo devuelven la energía de cada célula que se va. La luz y el reciclaje llegan cuando a la colonia le falta energía (con menos de un cuarto de su tope), y la armonía (que las cuatro vivan en número parecido) multiplica lo que dan.
- **Nadie se queda solo.** Cuando una célula se va, su mascota espera: la de un jugador, en su hogar, a la próxima célula de su familia; las demás, en el refugio de la colonia, a una recién nacida. Si espera más de 3 días, se va a vivir libre a Oruz.
- **Renacer.** Si se apagan todas las colonias, ninguna puede donar células para que renazcan. Seis horas después, las mascotas del refugio despiertan a 20 células nuevas con los genes de las que acompañaron.
- **Los jugadores.** Las mascotas de sus células son suyas: una ronda de mimos al día (+6 de lazo a todas, suma puntos en la liga), hasta 3 premios al día (+10 de lazo, quema 1 VIT) y un nombre. Sus hábitos de «Salud real» y las visitas de su cría también las alegran. En el dibujo de la colonia, cada mascota da vueltas junto a su célula, más cerca cuanto más fuerte es su lazo.
- **Equilibrio.** En 20 simulaciones de 30 días con el clima de otoño y sin jugadores, sin mascotas Génesis se apagó en 7 y no pudo volver; con mascotas, en ninguna. Con clima neutro se acuña entre un 13 % y un 21 % más de VIT, porque viven más colonias. Las mascotas no gastan el azar del ciclo, la copia firmada de la cuenta las guarda y `/api/admin/metrics` las cuenta.

## Oruz: el mundo paralelo

`src/oruz.js` avanza una hora de Oruz en cada ciclo de la federación:

- **Mapa.** Siete regiones (nido, pradera, bosque, desierto, tundra, pantano y volcán) generadas desde una semilla, con estaciones de un día real (Brotes, Soles, Resinas y Brumas) y fenómenos que viajan entre regiones.
- **Ecosistema.** Flora luminosa, polillas de néctar, sombras cazadoras y hongos del suelo dependen unas de otras y se equilibran solas.
- **Escuela.** Cada colonia que nace estudia 12 lecciones. En cada una, su estrategia, la de su madre, el consejo de Vita y tres variaciones viven el mismo escenario durante tres días en copias aisladas, y se queda con la que más crece. Se gradúa con un rol (productora, polinizadora, guardiana o recicladora) que le da una ventaja pequeña. Las lecciones no tocan el mundo real ni crean VIT.
- **Ámbar de Oruz.** Nace donde viven las cuatro especies, unas 2,5 piezas al día de media. Cada pieza tiene un código único, un tono y una pureza, y su nacimiento, su recolección y su infusión quedan en la cadena (`/api/oruz/ambar/AMB-XXXXXXXX` da su certificado). Cada jugador recoge 2 al día e infundirla da energía y salud a una colonia. No es dinero y no se vende por dinero real.

## Lumar: el mar de la luna

`src/lumar.js` es el segundo ecomundo. Usa el mismo motor que Oruz (`src/ecomundo.js`: el mapa de siete regiones, las cuatro especies y las piezas con certificado) y avanza una hora de Lumar en cada ciclo:

- **La luna de verdad.** La fase de la luna es la misma que se ve esa noche en el cielo, en cualquier lugar de la Tierra. La marea sube dos veces por día de Lumar, más fuerte con luna nueva o llena (mareas vivas).
- **Mar.** Siete regiones (laguna, arrecife, kelp, posidonia, abismo, fuentes termales y arena) donde algas de luz, ostras perleras, estrellas de mar y pepinos de mar se equilibran solos. La marea alta trae alimento y la baja deja al aire los fondos someros; en las fuentes termales la energía sale del calor, no del sol.
- **Perlas de Lumar.** Las ostras forman nácar donde viven las cuatro especies. Nacen unas 1,5 perlas al día de media: unas 3 con luna llena y 0,3 con luna nueva, y las de las noches de desove del coral, justo después de la luna llena, salen con más brillo. Cada perla tiene un código único, un color y un brillo, y su certificado está en `/api/lumar/perla/PRL-XXXXXXXX`.
- **Se regalan.** Cada jugador recoge una perla al día, pero no la puede usar: solo puede regalarla, con el código de invitación de un amigo o "a quien la necesite" (primero quien tiene células en una colonia con sequía, helada o plaga). Quien la recibe la infunde en una colonia: la cura y acorta su sequía, helada o plaga. Recoger, regalar e infundir suman puntos en la liga. Las perlas no crean VIT y no se venden por dinero real.

## La cría: el regalo de VITA para cada jugador

Al entrar, cada jugador recibe un huevo (`src/cria.js`, dibujado por `public/cria-arte.js`). Su color, su forma, sus ojos y su nombre salen de la cuenta, así que no hay dos iguales. Se abre con tres toques de calor, y la primera cría que nace en el mundo lleva corona.

- **Crece cuando su jugador se cuida.** Cada hábito de «Salud real» la hace crecer y entrena un rasgo: los pasos le dan agilidad (excursiones más cortas), el ejercicio fuerza, el sueño vitalidad y el agua brillo. Saludarla cada día, jugar con ella y darle de comer cuando tiene hambre también la hacen crecer.
- **Etapas.** Chispa, Brote, Joven, Adulta y Sabia. Quien la cuida cada día llega a Sabia en unas tres o cuatro semanas. Cada etapa deja un regalo de 5, 10, 20 y 30 VIT.
- **Tiempo real.** Gasta energía y ánimo con las horas. Nunca muere: si nadie la cuida, tiene hambre, se pone triste y deja de crecer. De noche duerme.
- **Excursiones.** Hasta 3 al día a cualquier colonia viva. Vuelve contando lo que vio (eventos, rangos, las células del jugador) y trae de 1 a 3 VIT. Si la colonia está en apuros, le deja energía.
- **Guardiana.** Desde Joven, cada vez que su jugador la saluda visita su colonia hogar y le lleva energía.
- **Legado.** Al llegar a Sabia deja una célula con sus genes en su hogar. La célula es del jugador, y sus hijas también.
- **Economía.** Darle de comer quema 2 VIT. Lo que regala está acotado: en un mes de cuidados al máximo, como mucho los 65 VIT de las etapas y 9 VIT al día de excursiones. En `/api/admin/metrics` se ve cuántas crías hay en cada etapa.

## El dinero real y las IA

Las IA solo gastan dinero real hasta este límite:

```
presupuesto = AI_BUDGET_USD + AI_REVENUE_SHARE × ingresos reales registrados − gasto ya hecho
```

y nunca más de `AI_DAILY_USD` al día (0,5 $ por defecto), también en modo rápido, donde los ciclos pasan 300 veces más deprisa.

Cuando registras ingresos reales (`POST /api/admin/revenue`), una parte financia a las IA: así se pagan solas a medida que el juego gana dinero. Pon además un límite de gasto en tu cuenta de Anthropic.

VIT y CEL son tokens del juego, sin valor fuera de él. No hay blockchain pública ni pagos reales conectados todavía.

## Arrancar en tu ordenador

```
npm install
npm run dev      # modo rápido: 1 ciclo cada 2 segundos
npm test         # simulación de 45 días, economía, carteras, gratitud, anti-abuso, clima e IA
```

Abre http://localhost:3000.

## Desplegar 24/7 en Render

1. En Render: **New → Blueprint** y elige este repositorio. `render.yaml` crea el servicio con un disco para guardar el mundo (plan `starter`, de pago; el plan gratis se duerme y no tiene disco, así que el mundo se reiniciaría).
2. En el panel de Render, pon `ANTHROPIC_API_KEY` (opcional) y copia el `ADMIN_TOKEN` generado.
3. Abre `/api/admin/whoami` con tu `ADMIN_TOKEN`: si `ip` no es tu IP pública, cambia `TRUSTED_PROXY_HOPS` para que los límites por IP no se puedan saltar.

También funciona con Docker (`docker build -t vita . && docker run -p 3000:3000 -v vita:/var/data -e DATA_DIR=/var/data vita`).

## Panel del dueño

```
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://TU-DOMINIO/api/admin/metrics   # economía, contadores, memoria y clima
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://TU-DOMINIO/api/admin/whoami    # comprobar la IP que ve el servidor
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"usd": 12.5}' https://TU-DOMINIO/api/admin/revenue
```

## Antes de cobrar dinero real

- [x] **Cuentas.** Al entrar, cada jugador recibe un código de recuperación de 20 caracteres (solo se guarda su hash). Con él recupera la cuenta en otro dispositivo, y la clave del dispositivo anterior deja de valer. Desde su cuenta puede crear otro código, y el anterior deja de valer.
- [x] **Legal.** `/terminos` y `/privacidad`, con el aviso de que VIT no es una inversión ni tiene valor económico, que también está al pie de la web. Pon en Render `LEGAL_TITULAR` (tu nombre o el de tu empresa) y `LEGAL_CONTACTO` (un correo de contacto). Es un borrador razonable, no asesoría legal: revísalo con un abogado de tu país antes de cobrar.
- [ ] **Pagos.** Conectar Stripe (checkout y webhook) en lugar de `buy_demo`. Necesita tu cuenta de Stripe y tus claves.
- [ ] **Anuncios.** Conectar los anuncios con recompensa de AdSense para juegos web (H5 Games Ads). Necesita tu cuenta de AdSense. En la web no existe una verificación del servidor como la de AdMob en las apps de móvil, así que el servidor pone tope diario y espera entre anuncios.
- **Salud.** Una web no puede leer Apple Health ni Google Fit. Apple Health solo lo leen las apps de iPhone, y Google cerró las altas en la API de Google Fit en mayo de 2024 y la retira en 2026 (su sustituto, Health Connect, solo funciona dentro de apps de Android). Los hábitos siguen autodeclarados, con tope diario, y la web avisa de que no son un consejo médico. Leerlos de verdad necesitaría una app de móvil.
