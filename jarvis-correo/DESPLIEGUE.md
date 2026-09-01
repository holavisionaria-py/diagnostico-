# Ponerlo a andar en la mini PC

Guía para dejarlo funcionando de verdad: la mini PC en Paraguay sirviendo la app,
y ella abriéndola desde el teléfono en Indonesia.

El problema a resolver no es correr el servidor — eso es un `npm start`. Es que
ese servidor sea **alcanzable desde Indonesia, con HTTPS, sin abrir puertos del
router**. Para eso usamos un túnel de Cloudflare: la mini PC sale hacia afuera y
Cloudflare le da una URL pública con certificado. Funciona incluso detrás del
NAT del proveedor, que es lo normal en una conexión hogareña.

```
Teléfono (Indonesia)  →  https://jarvis.tudominio.com  →  Cloudflare
                                                              │ túnel saliente
                                                              ▼
                                                   mini PC (Paraguay) :3000
                                                              │
                                                   Outlook + Claude
```

> **La mini PC tiene que quedar prendida.** Si se apaga, ella no tiene app. Es la
> contra de esta opción, y es real: revisá que no se suspenda sola.

---

## 1. Node 22

Hace falta 22.5 o mayor: el proyecto usa el SQLite que viene incluido en Node, y
así no hay nada que compilar.

```bash
node -v   # tiene que decir v22.5.0 o más
```

Si no lo tenés o es viejo:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Bajar el código

```bash
sudo mkdir -p /opt/jarvis && sudo chown $USER:$USER /opt/jarvis
git clone -b claude/email-assistant-novia-xft13u \
  https://github.com/holavisionaria-py/diagnostico-.git /opt/jarvis
cd /opt/jarvis/jarvis-correo
npm install --omit=dev
```

## 3. Probar que arranca

Antes de configurar nada, comprobá que la app levanta:

```bash
DEMO=1 APP_PASSWORD=probando SESSION_SECRET=cualquier-cosa-larga npm start
```

Entrá a `http://localhost:3000` desde la misma mini PC, clave `probando`. Tenés
que ver los seis correos de ejemplo. Cortá con `Ctrl+C`.

## 4. El archivo `.env`

**Acá va la clave de Claude, y en ningún otro lado.** No la pegues en un chat, ni
en un mensaje, ni la subas a GitHub — `.env` ya está en el `.gitignore`.

```bash
cp .env.example .env
nano .env
chmod 600 .env      # que sólo tu usuario pueda leerlo
```

Lo que tenés que completar:

```ini
ANTHROPIC_API_KEY=sk-ant-...          # console.anthropic.com → API Keys
MS_CLIENT_ID=...                      # los tres de Azure, paso 5
MS_CLIENT_SECRET=...
MS_TENANT_ID=...
MS_REDIRECT_URI=https://jarvis.tudominio.com/auth/callback

APP_PASSWORD=...                      # frase larga, mirá la nota de abajo
SESSION_SECRET=...                    # generala con el comando de acá abajo

HER_NAME=...                          # su nombre
HER_EMAIL=...                         # su correo de trabajo, en minúsculas
```

Para el `SESSION_SECRET`:

```bash
openssl rand -base64 48
```

> **Sobre `APP_PASSWORD`:** es lo único que separa a internet de su bandeja de
> entrada. Que sea una frase larga, no una palabra. Algo como
> `briquetas-de-coco-en-yakarta-2026` es mucho mejor que `jarvis123`.
>
> `HER_EMAIL` no es cosmético: es cómo la app distingue los mensajes que mandó
> ella de los que le mandaron. Si está mal, todo el "te toca a vos" se rompe.

## 5. Registrar la app en Azure

El paso a paso está en el [README](./README.md#2-registrar-la-app-en-microsoft).
Dos cosas que sólo aplican acá:

- En *Redirect URI* poné directamente la URL pública final
  (`https://jarvis.tudominio.com/auth/callback`), no la de localhost.
- Ese mismo valor va en `MS_REDIRECT_URI`. Tienen que coincidir **carácter por
  carácter** o Microsoft rechaza el login.

## 6. El túnel de Cloudflare

Necesitás un dominio administrado por Cloudflare. Si VisionarIA ya tiene uno,
usá un subdominio y listo.

```bash
# Instalar cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
sudo dpkg -i /tmp/cf.deb

# Autenticar (abre el navegador, elegís el dominio)
cloudflared tunnel login

# Crear el túnel
cloudflared tunnel create jarvis

# Apuntarle un subdominio
cloudflared tunnel route dns jarvis jarvis.tudominio.com
```

Configuración en `~/.cloudflared/config.yml`:

```yaml
tunnel: jarvis
credentials-file: /home/TU_USUARIO/.cloudflared/TU-TUNNEL-ID.json

ingress:
  - hostname: jarvis.tudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

Y que arranque solo con la máquina:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

> **Probar sin dominio.** Si querés ver si funciona antes de comprar nada:
> `cloudflared tunnel --url http://localhost:3000` te da una URL
> `*.trycloudflare.com` al instante. Sirve para probar, pero **cambia cada vez
> que reiniciás**, así que no sirve como regalo definitivo — y tampoco para
> Azure, que necesita una URL fija.

## 7. Que la app arranque sola

```bash
sudo tee /etc/systemd/system/jarvis.service > /dev/null <<'EOF'
[Unit]
Description=Jarvis del correo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=TU_USUARIO
WorkingDirectory=/opt/jarvis/jarvis-correo
ExecStart=/usr/bin/node --env-file-if-exists=.env src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Endurecimiento básico
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/opt/jarvis/jarvis-correo/data

[Install]
WantedBy=multi-user.target
EOF

sudo sed -i "s/TU_USUARIO/$USER/" /etc/systemd/system/jarvis.service
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis
sudo systemctl status jarvis
```

Los logs, cuando algo no ande:

```bash
journalctl -u jarvis -f          # en vivo
journalctl -u jarvis -n 100      # las últimas 100 líneas
```

## 8. Conectar Outlook

Entrá a `https://jarvis.tudominio.com`, poné la `APP_PASSWORD`, andá a
**Ajustes → Conectar Outlook** e iniciá sesión con la cuenta de trabajo de ella.

Ojo con esto: el login de Microsoft hay que hacerlo **con su cuenta**. O se lo
hacés con ella al lado, o le pasás el link y la clave y que lo haga ella desde su
teléfono. Es un minuto.

Desde ahí empieza a traer los últimos 30 días y a analizarlos. La primera
sincronización tarda unos minutos según cuántos hilos tenga.

---

## Cómo lo "instala" ella

No se descarga de ninguna tienda. Es una página web que se instala sola:

1. Le pasás el link `https://jarvis.tudominio.com` y la clave.
2. Lo abre en el teléfono y entra.
3. **Android:** menú del navegador → *Instalar aplicación*.
   **iPhone:** botón compartir → *Agregar a inicio*.

Queda con ícono propio en la pantalla de inicio, abre a pantalla completa, sin
barra de navegador. Se ve y se usa como cualquier otra app.

> **Sobre la voz:** el micrófono anda en Chrome y Edge, aceptable en Safari, y no
> anda en Firefox. Que la instale desde Chrome (Android) o Safari (iPhone). Que
> le lea el resumen en voz alta funciona en todos.

---

## Mantenimiento

**Actualizar** cuando haya cambios:

```bash
cd /opt/jarvis && git pull
cd jarvis-correo && npm install --omit=dev
sudo systemctl restart jarvis
```

**Respaldo.** Todo el estado vive en un solo archivo:

```bash
cp /opt/jarvis/jarvis-correo/data/jarvis.db ~/respaldo-jarvis-$(date +%F).db
```

Ese archivo tiene el cuerpo de los correos, así que **es tan sensible como su
bandeja de entrada**. No lo copies a un Drive compartido ni lo mandes por
WhatsApp. Si la mini PC tiene disco sin cifrar y está en una oficina con gente,
vale la pena cifrarlo.

**Si algo se rompe**, en orden:

```bash
systemctl status jarvis           # ¿está corriendo la app?
systemctl status cloudflared      # ¿está parado el túnel?
journalctl -u jarvis -n 50        # ¿qué dijo el último error?
curl -I localhost:3000            # ¿responde en local?
```

Si `curl` en local anda pero desde afuera no, el problema es el túnel, no la app.

---

## Si preferís no depender de la mini PC

La contra de esta opción es una sola: si la máquina se apaga, se corta la luz o
se reinicia el router mientras vos no estás, ella se queda sin app y del otro
lado del mundo no podés arreglarlo.

Si en algún momento eso molesta, mover esto a un VPS de 5 dólares al mes es
literalmente copiar estos mismos pasos en otra máquina — salvo el túnel, que ahí
se reemplaza por Caddy con un certificado automático. El código no cambia en nada.

---

## En Windows

Si la mini PC corre Windows, es lo mismo con dos cambios:

- **Que arranque sola:** en vez de systemd, usá
  [NSSM](https://nssm.cc/) (`nssm install Jarvis`) apuntando a `node.exe` con
  argumentos `--env-file-if-exists=.env src/server.js` y directorio de trabajo
  `C:\jarvis\jarvis-correo`.
- **El túnel:** `cloudflared service install` funciona igual en Windows y queda
  como servicio.

El resto — `.env`, Azure, la instalación en el teléfono — es idéntico.
