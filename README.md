# Federación VITA

Un juego de colonias digitales que viven 24/7 en un servidor. Cada colonia depende de su entorno real
(hora local y clima de Open-Meteo), la gestiona su propia IA y cada una de sus células es un token único.

## Qué hace

- **Colonias vivas 24/7.** En modo `real` hay un ciclo cada 10 minutos y el sol sigue la hora local. Las nubes, el frío y la lluvia reales cambian la energía. Si Open-Meteo no responde, se usa un clima simulado de temporada (la web lo marca como "simulado").
- **Células tokenizadas (CEL).** Cada célula tiene genes, rareza y dueño. Nace, acuña VIT para su dueño y muere, y todo queda en una cadena de bloques con hash SHA-256 que se verifica sola.
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

## El dinero real y las IA

Las IA solo gastan dinero real hasta este límite:

```
presupuesto = AI_BUDGET_USD + AI_REVENUE_SHARE × ingresos reales registrados − gasto ya hecho
```

Cuando registras ingresos reales (`POST /api/admin/revenue`), una parte financia a las IA: así se pagan solas a medida que el juego gana dinero. Pon además un límite de gasto en tu cuenta de Anthropic.

VIT y CEL son tokens del juego, sin valor fuera de él. No hay blockchain pública ni pagos reales conectados todavía.

## Arrancar en tu ordenador

```
npm install
npm run dev      # modo rápido: 1 ciclo cada 2 segundos
npm test         # simulación de 45 días, economía, carteras, gratitud, anti-abuso, clima e IA
```

Abre http://localhost:3000.

## Desplegar en Render

1. Abre https://render.com/deploy?repo=https://github.com/mateoantunez820-sys/Colonia-vita (o **New → Blueprint** y elige este repositorio). `render.yaml` usa el plan gratis en modo rápido: se duerme tras 15 minutos sin visitas y, sin disco, el mundo empieza de cero al reiniciarse.
2. Para tenerlo 24/7 con el mundo guardado, cambia a `starter` (de pago) siguiendo los comentarios de `render.yaml`.
3. Copia el `ADMIN_TOKEN` generado. `ANTHROPIC_API_KEY` es opcional: añádela en Environment cuando quieras que Claude gestione las colonias.
4. Abre `/api/admin/whoami` con tu `ADMIN_TOKEN`: si `ip` no es tu IP pública, cambia `TRUSTED_PROXY_HOPS` para que los límites por IP no se puedan saltar.

También funciona con Docker (`docker build -t vita . && docker run -p 3000:3000 -v vita:/var/data -e DATA_DIR=/var/data vita`).

## Panel del dueño

```
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://TU-DOMINIO/api/admin/metrics   # economía, contadores, memoria y clima
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://TU-DOMINIO/api/admin/whoami    # comprobar la IP que ve el servidor
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"usd": 12.5}' https://TU-DOMINIO/api/admin/revenue
```

## Pendiente antes de cobrar dinero real

- Pagos: conectar Stripe (checkout y webhook) en lugar de `buy_demo`.
- Anuncios: conectar AdMob o AdSense con verificación del lado del servidor.
- Salud: leer Google Fit o Apple Health en lugar de autodeclarar.
- Cuentas: ahora el acceso es un token guardado en el navegador; hace falta recuperación de cuenta.
- Legal: términos, privacidad y aviso de que VIT no es una inversión ni tiene valor económico.
