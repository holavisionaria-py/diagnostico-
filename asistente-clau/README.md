# Asistente Clau

Un asistente de correo para alguien que trabaja desde Indonesia con la sede en
Paraguay, coordinando producción y embarques de briquetas de coco.

El problema que resuelve no es "tener menos correos". Es este: cuando abrís la
bandeja con 40 mensajes, **no sabés dónde está lo importante hasta que los leés
todos**. Y para cuando terminás, la sede ya se durmió.

Entonces la app no es un cliente de correo. Es una capa arriba del correo que
responde tres preguntas, en este orden:

1. **¿Quién te dijo qué?** — cada hilo resumido en dos frases, con nombre y cara.
2. **¿Qué te toca a vos?** — separa lo que espera respuesta tuya de lo que
   esperás vos.
3. **¿Por dónde empiezo?** — un brief del día que se escucha en voz alta
   mientras te preparás el café.

Y encima de todo eso, un micrófono: le hablás, te contesta.

---

## Cómo se ve

- **Hoy** — dos relojes (el de ella y el de la sede), la ventana de solape, y el
  resumen del día con un botón grande de *escuchar*.
- **Te hablaron** — las tarjetas de lo que espera respuesta suya, con lo urgente
  arriba y los números clave (contenedor, factura, lote) ya extraídos.
- **Esperás** — hilos donde ella ya respondió y le deben contestación.
- **Micrófono flotante** — le habla, la app le contesta y se lo lee.

---

## Sobre qué está armado

Nada exótico, a propósito: cuanto menos piezas, menos se rompe.

| Pieza | Qué usa | Por qué |
|---|---|---|
| Correo | **Microsoft Graph API** (Outlook / Microsoft 365) | Es el correo que ella ya usa. `delta query` trae sólo lo que cambió, así que no relee todo cada vez. |
| Cerebro | **Claude Opus 5** vía `@anthropic-ai/sdk` | Analiza cada hilo, arma el brief y responde preguntas. Los análisis salen con **structured outputs**, así que vuelven como JSON validado, no como texto que hay que adivinar. |
| Servidor | **Node 22 + Fastify** | Un solo proceso. Sirve la app y la API. |
| Base | **SQLite** (`node:sqlite`, el módulo nativo de Node) | Un archivo. Cero dependencias compiladas, cero servidor de base de datos. |
| App | **PWA** en HTML/CSS/JS puro | Se instala en el celular con ícono propio. Sin build, sin npm en el front, sin framework que actualizar. |
| Voz que sale | **ElevenLabs** (`eleven_multilingual_v2`) | Es lo que hace que se sienta un asistente y no un lector de pantalla. La clave nunca sale del servidor y todo lo sintetizado queda cacheado en disco. Si no está configurada, cae en la voz del navegador. |
| Voz que entra | **Web Speech API** del navegador | El reconocimiento pasa en el teléfono. Gratis, y el audio de ella nunca se sube a ningún lado. |

### Cómo fluye

```
Outlook ──delta sync──> SQLite ──triage con Claude──> ficha JSON por hilo
                                                            │
                              ┌─────────────────────────────┤
                              ▼                             ▼
                     brief del día (voz)            tarjetas del panel
                              │                             │
                              └──────────► PWA ◄────────────┘
                                            ▲
                                            │ micrófono
                                     pregunta hablada
                                            │
                              Claude + herramientas
                       (leer_hilo, buscar_en_correos)
```

Cada hilo se analiza **una sola vez**. Si no llegó nada nuevo, no se vuelve a
gastar un token: se guarda un hash del contenido y sólo se re-analiza lo que
cambió.

---

## Qué devuelve el análisis de cada hilo

```json
{
  "titulo": "Booking del contenedor vence mañana",
  "quien": "Rodrigo Benítez, de la sede en Paraguay",
  "resumen": "La naviera da de baja el booking del MSKU7741203 mañana...",
  "te_piden": ["Mandar el packing list final con peso neto real por pallet"],
  "preguntas_abiertas": ["¿Están terminados los 18 pallets de 26mm?"],
  "datos_clave": [{ "etiqueta": "Contenedor", "valor": "MSKU7741203" }],
  "categoria": "logistica",
  "urgencia": "alta",
  "fecha_limite": "2026-08-27",
  "bola_en_su_cancha": true,
  "riesgo_si_no_responde": "Se pierde el contenedor y el embarque se atrasa 12 días",
  "respuesta_sugerida": "Rodrigo, perdón la demora. Te mando el packing list...",
  "una_linea_para_voz": "Rodrigo te está esperando el packing list del contenedor."
}
```

`bola_en_su_cancha` es el campo que hace todo el trabajo: es lo que separa
"tenés 40 correos" de "tenés 5 cosas que hacer".

---

## Probarlo ahora, sin conectar nada

```bash
cd asistente-clau
npm install
DEMO=1 APP_PASSWORD=probando SESSION_SECRET=cualquier-cosa-larga npm start
```

Abrí `http://localhost:3000`, clave `probando`.

Trae 6 hilos de mentira (un contenedor que se cae, una cotización a Turquía, un
control de calidad, una factura sin OK) con el análisis ya hecho. Sirve para ver
la app completa antes de tocar Outlook.

Si además ponés `ANTHROPIC_API_KEY`, los mismos correos falsos los analiza
Claude de verdad y el brief lo escribe él.

---

## Ponerlo en producción

> Si lo vas a dejar corriendo en una mini PC o un servidor propio, seguí
> **[DESPLIEGUE.md](./DESPLIEGUE.md)**: túnel de Cloudflare para llegar desde
> Indonesia sin abrir puertos, servicio de systemd, respaldo y mantenimiento.
> Lo de acá abajo son las credenciales que hacen falta en cualquier caso.


### 1. Claves

- **Claude**: `console.anthropic.com` → API Keys → va en `ANTHROPIC_API_KEY`.
- **ElevenLabs** (opcional, pero es la diferencia entre un robot y una persona):
  `elevenlabs.io` → Profile → API Key → va en `ELEVENLABS_API_KEY`. La voz se
  elige después desde la app, en **Ajustes → Voz**.

### 2. Registrar la app en Microsoft

Esto es el único trámite. Se hace una vez.

1. Entrá a [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID**
   → **App registrations** → **New registration**.
2. Nombre: `Asistente Clau`. En *Supported account types*, si la empresa tiene su
   propio Microsoft 365 elegí **Accounts in this organizational directory only**;
   si es una cuenta suelta, **Accounts in any organizational directory and
   personal Microsoft accounts**.
3. En *Redirect URI* elegí **Web** y poné `http://localhost:3000/auth/callback`
   (después agregás la URL real donde lo publiques).
4. Registrala. De la pantalla que aparece copiá el **Application (client) ID** y
   el **Directory (tenant) ID**.
5. **Certificates & secrets** → **New client secret** → copiá el *Value* (sólo
   se ve una vez).
6. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions** → agregá `Mail.Read`, `Mail.ReadWrite`,
   `Mail.Send`, `User.Read`, `offline_access`.

> Si el Microsoft 365 es de la empresa y no sos administrador, el paso 6 puede
> pedir aprobación del área de sistemas. Es una autorización estándar de
> delegación: la app entra **como ella**, con sus mismos permisos, nunca más que
> eso.

### 3. Configurar

```bash
cp .env.example .env
```

Llená `ANTHROPIC_API_KEY`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`,
`APP_PASSWORD`, `SESSION_SECRET`, `HER_NAME` y `HER_EMAIL`.

`HER_EMAIL` importa: es cómo la app sabe cuáles mensajes son de ella y cuáles no.

### 4. Arrancar y conectar

```bash
npm start
```

Entrá, andá a **Ajustes → Conectar Outlook**, iniciá sesión con la cuenta de
trabajo, aceptá los permisos. En un minuto empieza a traer los últimos 30 días.

### 5. Instalarlo en el teléfono

- **Android**: menú del navegador → *Instalar aplicación*.
- **iPhone**: compartir → *Agregar a inicio*.

Queda con ícono propio, pantalla completa, sin barra del navegador.

> Para que funcione desde el teléfono tiene que estar publicado con **HTTPS**
> (el micrófono no funciona en HTTP salvo en `localhost`). Cualquier VPS chico
> con un dominio y Caddy o Nginx alcanza; también sirve un túnel tipo Cloudflare
> Tunnel o Tailscale si querés que sea sólo para ella. Cuando lo publiques,
> agregá la URL nueva en *Redirect URI* de Azure y en `MS_REDIRECT_URI`.

---

## Dónde vive cada cosa

```
asistente-clau/
├── src/
│   ├── config.js          Todo lo que sale del .env
│   ├── db.js              SQLite: mensajes, hilos, briefs, chat
│   ├── sync.js            El loop: trae correo, arma hilos, manda a analizar
│   ├── server.js          Fastify: API + sesión + OAuth + estáticos
│   ├── graph/
│   │   ├── auth.js        MSAL: login, refresh, cache de tokens
│   │   └── mail.js        Delta sync, borradores, HTML a texto
│   ├── ai/
│   │   ├── client.js      Cliente de Claude + contexto del negocio
│   │   ├── triage.js      Análisis de un hilo → JSON validado
│   │   ├── brief.js       El resumen del día + el guion hablado
│   │   ├── ask.js         Preguntas con herramientas (leer y buscar)
│   │   └── draft.js       Redacta la respuesta imitando cómo escribe ella
│   ├── util/time.js       Los dos relojes y la ventana de solape
│   └── demo-data.js       Los correos de mentira
└── public/
    ├── index.html         El armazón
    ├── app.js             Toda la app (vanilla, sin build)
    ├── styles.css
    ├── sw.js              Service worker: abre al toque, sin señal
    └── manifest.webmanifest
```

---

## Decisiones que vale la pena entender

**La voz va por dos caminos distintos, a propósito.** Lo que ella *dice* se
reconoce en el navegador con la Web Speech API: gratis, y su audio nunca se
sube a ningún servidor. Lo que la app *le lee* pasa por ElevenLabs, porque la
voz del navegador suena a GPS de 2010 y eso arruina la sensación de tener un
asistente. La clave de ElevenLabs vive sólo en el servidor: el navegador le
pide el audio a esta app, no a ElevenLabs. La contra del reconocimiento: anda
muy bien en Chrome y Edge, aceptable en Safari, y nada en Firefox.

**El audio se cachea en disco.** Cada texto sintetizado se guarda en
`data/voz/` con un hash del texto, la voz y el modelo. Volver a tocar play en
el mismo resumen no vuelve a facturar. El cache se poda solo a los 60 archivos.

**Los correos se guardan localmente.** El SQLite tiene el cuerpo de los mensajes
para poder buscar y citar sin volver a pegarle a Graph. Ese archivo (`data/`) es
tan sensible como la bandeja de entrada: no lo subas a ningún lado, y si el
servidor es compartido, cifrá el disco.

**Nunca manda un correo solo.** `draftReply` redacta y, si ella lo pide, lo deja
en **Borradores** de Outlook. El botón de enviar sigue siendo de ella. Es a
propósito: un asistente que manda correos a un cliente sin revisión no es una
ayuda, es un riesgo.

**Cuando falta un dato, lo marca.** Los borradores dejan `[CONFIRMAR FECHA DE
EMBARQUE]` en vez de inventar una fecha. Prefiere quedar incompleto antes que
quedar mal.

**El costo real.** El triage corre a esfuerzo medio y sólo sobre hilos que
cambiaron; el brief, una vez cada tres horas. Con 40 hilos activos son unos
pocos centavos de dólar por día. Podés bajarlo con `TRIAGE_EFFORT=low`.

La voz se suma aparte: `eleven_multilingual_v2` cuesta USD 0,10 cada 1000
caracteres. Un resumen diario de unas 120 palabras son ~700 caracteres, o sea
unos 7 centavos por día si lo escucha una vez, y menos si repite (el cache no
vuelve a facturar). `eleven_flash_v2_5` sale la mitad, con algo menos de matiz.

---

## Lo que sigue

Ideas en orden de cuánto suman por lo que cuestan:

- **Resumen por WhatsApp a la mañana** — que no tenga ni que abrir la app.
- **Webhooks de Graph** en vez de revisar cada 10 minutos: el análisis
  aparecería a los segundos de llegar el correo.
- **Memoria de personas** — que aprenda que Rodrigo siempre apura y que Ahmad
  siempre pregunta dos cosas a la vez, y ajuste la urgencia con eso.
- **Detección de compromisos** — cuando ella escribe "te lo mando el jueves",
  que lo agende solo y le recuerde el miércoles.
- **Adjuntos** — leer el packing list en PDF y contestar preguntas sobre él.

---

## Variables de entorno

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de Claude. Sin esto no analiza nada. |
| `ANTHROPIC_MODEL` | Por defecto `claude-opus-5`. |
| `TRIAGE_EFFORT` | `low` / `medium` / `high`. Por defecto `medium`. |
| `ELEVENLABS_API_KEY` | Voz humana. Sin esto usa la del navegador. |
| `ELEVENLABS_VOICE_ID` | Valor inicial. Se cambia desde Ajustes → Voz. |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` (mejor) o `eleven_flash_v2_5` (mitad de precio). |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` | De Azure. |
| `MS_REDIRECT_URI` | Tiene que coincidir exacto con el de Azure. |
| `APP_PASSWORD` | La clave para entrar al panel. |
| `SESSION_SECRET` | Firma la cookie de sesión. Largo y aleatorio. |
| `HER_NAME`, `HER_EMAIL`, `HER_ROLE`, `COMPANY` | Contexto para Claude. |
| `TZ_HER`, `TZ_HQ` | Zonas horarias. Por defecto `Asia/Jakarta` y `America/Asuncion`. |
| `SYNC_INTERVAL_MIN` | Cada cuánto revisa. Por defecto 10. |
| `DEMO` | `1` para correos de mentira. |
| `PORT`, `HOST`, `DB_PATH`, `LOG_LEVEL` | Lo de siempre. |
