/* Asistente Clau — front. Sin build, sin framework. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const estado = {
  datos: null,
  brief: null,
  vista: 'hoy',
  hablando: false,
  escuchando: false,
};

// ─── API ────────────────────────────────────────────────────────────────
async function api(ruta, opciones = {}) {
  const res = await fetch(`/api${ruta}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (res.status === 401) {
    mostrarLogin();
    throw new Error('Sesión vencida');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─── Avisos ─────────────────────────────────────────────────────────────
let avisoTimer;
function aviso(texto, tipo = '') {
  $('#aviso')?.remove();
  const el = document.createElement('div');
  el.id = 'aviso';
  el.className = tipo;
  el.textContent = texto;
  document.body.appendChild(el);
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.remove(), 3200);
}

// ─── Voz: hablar ────────────────────────────────────────────────────────
let vozElegida = null;

function elegirVoz() {
  const voces = speechSynthesis.getVoices();
  if (!voces.length) return null;
  const es = voces.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  // Preferimos español de Latinoamérica, y dentro de eso una voz "natural"
  const prioridad = ['es-AR', 'es-MX', 'es-US', 'es-CL', 'es-CO', 'es-419', 'es-ES'];
  for (const lang of prioridad) {
    const v = es.find((x) => x.lang.toLowerCase() === lang.toLowerCase() && /google|natural|premium|neural/i.test(x.name));
    if (v) return v;
  }
  for (const lang of prioridad) {
    const v = es.find((x) => x.lang.toLowerCase() === lang.toLowerCase());
    if (v) return v;
  }
  return es[0] ?? null;
}

speechSynthesis?.addEventListener?.('voiceschanged', () => {
  vozElegida = elegirVoz();
});
vozElegida = elegirVoz();

function hablarNavegador(texto, { alTerminar } = {}) {
  if (!('speechSynthesis' in window)) {
    aviso('Este navegador no puede hablar. Probá con Chrome.', 'mal');
    alTerminar?.();
    return;
  }
  speechSynthesis.cancel();
  if (!vozElegida) vozElegida = elegirVoz();

  // Cortamos en frases: los motores TTS se atragantan con textos largos.
  const frases = texto.match(/[^.!?…]+[.!?…]*/g) ?? [texto];
  const trozos = [];
  let buffer = '';
  for (const f of frases) {
    if ((buffer + f).length > 180) {
      if (buffer) trozos.push(buffer.trim());
      buffer = f;
    } else buffer += f;
  }
  if (buffer.trim()) trozos.push(buffer.trim());

  estado.hablando = true;
  trozos.forEach((trozo, i) => {
    const u = new SpeechSynthesisUtterance(trozo);
    if (vozElegida) u.voice = vozElegida;
    u.lang = vozElegida?.lang || 'es-AR';
    u.rate = 1.02;
    u.pitch = 1;
    if (i === trozos.length - 1) {
      u.onend = u.onerror = () => {
        estado.hablando = false;
        alTerminar?.();
      };
    }
    speechSynthesis.speak(u);
  });
}

/* El audio de ElevenLabs se guarda por texto: volver a tocar play no vuelve
   a pedirlo, ni al servidor ni a la API. */
const audiosLocales = new Map();
let audioSonando = null;

/**
 * Lee un texto en voz alta. Usa la voz de ElevenLabs si está configurada;
 * si falla por lo que sea, cae en la del navegador en vez de quedarse muda.
 */
async function hablar(texto, { alTerminar, alGenerar } = {}) {
  callar();
  if (!estado.datos?.vozNube) return hablarNavegador(texto, { alTerminar });

  try {
    let url = audiosLocales.get(texto);
    if (!url) {
      alGenerar?.(true);
      const res = await fetch('/api/voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `error ${res.status}`);
      }
      url = URL.createObjectURL(await res.blob());
      audiosLocales.set(texto, url);
      alGenerar?.(false);
    }

    const audio = new Audio(url);
    audioSonando = audio;
    estado.hablando = true;
    audio.onended = audio.onerror = () => {
      estado.hablando = false;
      audioSonando = null;
      alTerminar?.();
    };
    await audio.play();
  } catch (err) {
    alGenerar?.(false);
    aviso(`Voz en la nube: ${err.message}. Uso la del navegador.`, 'mal');
    hablarNavegador(texto, { alTerminar });
  }
}

function callar() {
  speechSynthesis?.cancel();
  if (audioSonando) {
    audioSonando.pause();
    audioSonando = null;
  }
  estado.hablando = false;
  $$('.escuchar').forEach((b) => b.classList.remove('sonando'));
}

// ─── Voz: escuchar ──────────────────────────────────────────────────────
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;

function escuchar({ alTexto, alParcial, alCerrar }) {
  if (!Reconocimiento) {
    aviso('Tu navegador no reconoce voz. Escribí la pregunta.', 'mal');
    alCerrar?.();
    return null;
  }
  callar();
  recog = new Reconocimiento();
  recog.lang = 'es-AR';
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 1;

  let final = '';
  recog.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else parcial += t;
    }
    alParcial?.(final + parcial);
  };
  recog.onerror = (e) => {
    if (e.error === 'not-allowed') aviso('Necesito permiso para el micrófono.', 'mal');
    else if (e.error !== 'aborted' && e.error !== 'no-speech') aviso(`Micrófono: ${e.error}`, 'mal');
    alCerrar?.();
  };
  recog.onend = () => {
    estado.escuchando = false;
    $('#mic')?.classList.remove('grabando');
    if (final.trim()) alTexto?.(final.trim());
    else alCerrar?.();
  };

  estado.escuchando = true;
  recog.start();
  return recog;
}

function dejarDeEscuchar() {
  try {
    recog?.stop();
  } catch {}
  estado.escuchando = false;
  $('#mic')?.classList.remove('grabando');
}

// ─── Login ──────────────────────────────────────────────────────────────
function mostrarLogin() {
  $('#login').classList.remove('oculto');
  $('#app').classList.add('oculto');
  $('#nav').classList.add('oculto');
  $('#mic').classList.add('oculto');
}

function mostrarApp() {
  $('#login').classList.add('oculto');
  $('#app').classList.remove('oculto');
  $('#nav').classList.remove('oculto');
  $('#mic').classList.remove('oculto');
}

$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('#clave').value;
  $('#errorLogin').textContent = '';
  try {
    await api('/login', { method: 'POST', body: { password: clave } });
    $('#clave').value = '';
    mostrarApp();
    await cargar();
  } catch (err) {
    $('#errorLogin').textContent = err.message;
  }
});

// ─── Encabezado ─────────────────────────────────────────────────────────
const ETIQUETAS_VENTANA = {
  abierta: (v) => `<b>Las dos oficinas despiertas.</b> Es el momento de mandar lo que necesite ida y vuelta.`,
  'sede-dormida': (v) =>
    `<b>Paraguay está durmiendo.</b> Lo que escribas ahora lo leen al abrir${
      v.horasParaSede != null ? `, en unas ${v.horasParaSede} h` : ''
    }.`,
  'sede-despierta': (v) => `<b>La sede está trabajando y vos ya cerraste el día.</b> Dejá pendiente lo que no sea urgente.`,
  'todos-durmiendo': (v) => `<b>Nadie está en línea.</b> Buen momento para dejar todo escrito.`,
};

function pintarEncabezado(d) {
  const nombre = d.ella?.nombre?.split(' ')[0] || '';
  const h = d.reloj.her.h;
  const saludo = h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  $('#saludo').innerHTML = `${saludo}${nombre ? `, <em>${esc(nombre)}</em>` : ''}`;
  $('#fecha').textContent = d.reloj.fecha;

  const her = $('#relojHer');
  her.querySelector('.hora').textContent = d.reloj.her.hora;
  her.classList.toggle('duerme', d.reloj.her.h < 6 || d.reloj.her.h >= 22);

  const hq = $('#relojHq');
  hq.querySelector('.hora').textContent = d.reloj.hq.hora;
  hq.classList.toggle('duerme', d.reloj.hq.h < 8 || d.reloj.hq.h >= 18);

  const v = $('#ventana');
  v.innerHTML = (ETIQUETAS_VENTANA[d.reloj.estado] ?? (() => ''))(d.reloj);
  v.classList.toggle('abierta', d.reloj.estado === 'abierta');

  const badge = $('#badgeHablaron');
  badge.textContent = d.contadores.teHablaron;
  badge.classList.toggle('oculto', d.contadores.teHablaron === 0);
}

// ─── Tarjetas ───────────────────────────────────────────────────────────
const iniciales = (n = '') =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';

const claseAvatar = (t) =>
  t.categoria === 'interno' ? 'interno' : ['calidad', 'proveedor', 'muestra'].includes(t.categoria) ? 'fabrica' : '';

function tarjeta(t, { compacta = false } = {}) {
  const datos = (t.datos_clave ?? []).slice(0, 3);
  const piden = (t.te_piden ?? []).slice(0, compacta ? 1 : 3);

  return `
  <article class="tarjeta ${t.urgencia || 'baja'} ${t.fijado ? 'fijado' : ''}" data-id="${esc(t.id)}">
    <div class="cab" data-abrir="${esc(t.id)}">
      <div class="avatar ${claseAvatar(t)}">${esc(iniciales(t.de?.nombre || t.quien))}</div>
      <div class="quien">
        <b>${esc(t.titulo || t.asunto)}</b>
        <small>${esc(t.quien || t.de?.nombre || t.de?.email)}</small>
      </div>
      <div class="meta"><div class="hace">${esc(t.hace)}</div></div>
    </div>

    ${t.resumen ? `<p class="resumen">${esc(t.resumen)}</p>` : ''}

    ${piden.length ? `<ul class="piden">${piden.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}

    ${t.consejo ? `<div class="consejo"><span class="lampara">💡</span><span>${esc(t.consejo)}</span></div>` : ''}

    <div class="chips">
      ${t.urgencia === 'alta' ? `<span class="chip alta">urgente</span>` : ''}
      ${t.fecha_limite ? `<span class="chip fecha">vence ${esc(t.fecha_limite)}</span>` : ''}
      ${t.categoria ? `<span class="chip">${esc(t.categoria)}</span>` : ''}
      ${datos.map((d) => `<span class="chip dato">${esc(d.etiqueta)}: ${esc(d.valor)}</span>`).join('')}
    </div>

    <div class="acciones">
      <button class="pri" data-abrir="${esc(t.id)}">Ver y responder</button>
      <button data-listo="${esc(t.id)}">Listo</button>
      <button class="${t.fijado ? 'on' : ''}" data-fijar="${esc(t.id)}">${t.fijado ? '★' : '☆'}</button>
    </div>
  </article>`;
}

const vacio = (emo, txt) => `<div class="vacio"><span class="emo">${emo}</span>${esc(txt)}</div>`;

// ─── Vistas ─────────────────────────────────────────────────────────────
function vistaHoy() {
  const d = estado.datos;
  const b = estado.brief;

  // Sin correo conectado no hay nada que resumir: mostramos una bienvenida
  // en vez de dejar el resumen girando para siempre.
  const correoConectado = d.demo || Boolean(d.outlook?.email);
  if (!correoConectado) {
    const nombre = d.ella?.nombre?.split(' ')[0] || '';
    return `
      <div class="bienvenida">
        <div class="globo">📬</div>
        <h3>${nombre ? `Hola ${esc(nombre)}, ` : ''}conectá tu correo para empezar</h3>
        <p>Apenas conectes tu Outlook, voy a leer tus mensajes y armarte el resumen del día. Toma un minuto.</p>
        ${
          d.outlookConfigurado
            ? `<a class="cta" href="/auth/login">Conectar mi Outlook</a>`
            : `<p style="color:var(--gris-suave)">Falta un último paso de configuración en el servidor. Avisale a quien te armó esto.</p>`
        }
      </div>`;
  }

  const lista = (items, titulo, clase = '') => {
    if (!items?.length) return '';
    return `
      <h2 class="seccion ${clase}">${titulo}<span class="n">${items.length}</span></h2>
      ${items
        .map((i) => {
          const t = b.porId?.[i.conversation_id];
          if (!t) return `<div class="tarjeta baja"><p class="resumen">${esc(i.linea)}</p></div>`;
          return tarjeta({ ...t, resumen: i.linea }, { compacta: true });
        })
        .join('')}`;
  };

  if (!b) {
    const cuerpo = !d.claudeConfigurado
      ? vacio('🔑', 'Cargá ANTHROPIC_API_KEY en el .env y reiniciá: sin eso no puedo leer ni resumir.')
      : `<div class="cargando"><div class="spinner"></div><span>Armando tu resumen del día…</span></div>`;
    return `${avisosSetup(d)}${cuerpo}`;
  }

  const briefHtml = `
    <section class="brief">
      <span class="animo ${esc(b.animo)}">${esc(b.animo)}</span>
      <div class="titular">${esc(b.titular)}</div>
      <button class="escuchar" id="btnBrief">
        <span class="icono">▶</span>
        <span class="txt"><b>Escuchá tu resumen</b><small>${b.guion_voz.split(/\s+/).length} palabras · ~${Math.max(
        20,
        Math.round((b.guion_voz.split(/\s+/).length / 150) * 60)
      )} seg</small></span>
        <span class="onda"><i></i><i></i><i></i><i></i><i></i></span>
      </button>
      <p class="guion" id="guionTexto" title="Tocá para ver todo">${esc(b.guion_voz)}</p>
    </section>

    ${lista(b.primero_esto, 'Primero esto', 'urgente')}
    ${lista(b.antes_de_que_cierre_la_sede, 'Antes de que cierre la sede')}
    ${lista(b.puede_esperar, 'Puede esperar')}
    ${lista(b.estas_esperando, 'Estás esperando respuesta')}
    ${lista(b.se_te_puede_estar_pasando, 'Se te puede estar pasando')}
  `;

  return `${avisosSetup(d)}${briefHtml}`;
}

function vistaHablaron() {
  const d = estado.datos;
  if (!d.teHablaron.length) return vacio('🎉', 'Nadie está esperando nada de vos. Bandeja al día.');
  const urgentes = d.teHablaron.filter((t) => t.urgencia === 'alta');
  const resto = d.teHablaron.filter((t) => t.urgencia !== 'alta');
  return `
    ${urgentes.length ? `<h2 class="seccion urgente">No puede esperar<span class="n">${urgentes.length}</span></h2>${urgentes.map((t) => tarjeta(t)).join('')}` : ''}
    ${resto.length ? `<h2 class="seccion">El resto<span class="n">${resto.length}</span></h2>${resto.map((t) => tarjeta(t)).join('')}` : ''}`;
}

function vistaEsperando() {
  const d = estado.datos;
  if (!d.esperando.length) return vacio('⏳', 'No hay nadie debiéndote respuesta.');
  return `
    <h2 class="seccion">Respondiste y no te contestaron<span class="n">${d.esperando.length}</span></h2>
    ${d.esperando.map((t) => tarjeta(t)).join('')}`;
}

function vistaAjustes() {
  const d = estado.datos;
  const cuenta = d.outlook?.demo
    ? 'Modo demo: correos de mentira'
    : d.outlook?.email
    ? `Conectada como ${d.outlook.email}`
    : 'Outlook sin conectar';

  const tema = temaGuardado();
  return `
    <h2 class="seccion">Apariencia</h2>
    <div class="bloque">
      <h3>Tema</h3>
      <div class="tema-toggle" id="temaToggle">
        <button data-tema="claro" class="${tema === 'claro' ? 'on' : ''}"><span class="ico">☀️</span> Claro</button>
        <button data-tema="oscuro" class="${tema === 'oscuro' ? 'on' : ''}"><span class="ico">🌙</span> Oscuro</button>
        <button data-tema="auto" class="${tema === 'auto' ? 'on' : ''}"><span class="ico">📱</span> Auto</button>
      </div>
    </div>

    <h2 class="seccion">Conexión</h2>
    <div class="bloque">
      <h3>Correo</h3>
      <p>${esc(cuenta)}</p>
      ${
        !d.outlook?.demo && !d.outlook?.email && d.outlookConfigurado
          ? `<div class="acciones"><a class="pri" href="/auth/login" style="font-size:.8rem;padding:9px 14px;border-radius:9px;background:linear-gradient(90deg,var(--dorado),var(--verde));color:#0B0B0C;font-weight:600;text-decoration:none;display:inline-block;margin-top:12px">Conectar Outlook</a></div>`
          : ''
      }
      ${
        d.outlook?.email
          ? `<div class="acciones"><button id="btnDesconectar">Desconectar</button></div>`
          : ''
      }
    </div>

    <div class="bloque">
      <h3>Última revisión</h3>
      <p>${d.sync.lastSync ? esc(new Date(d.sync.lastSync).toLocaleString('es-AR')) : 'Todavía no revisó'}</p>
      ${d.sync.lastError ? `<p style="color:var(--rojo);margin-top:8px">${esc(d.sync.lastError)}</p>` : ''}
      <p style="margin-top:8px;color:var(--gris-suave)">${d.contadores.total} hilos guardados${
    d.sync.pendingAnalysis ? ` · ${d.sync.pendingAnalysis} sin analizar` : ''
  }</p>
      <div class="acciones">
        <button id="btnSyncAjustes" class="pri">Revisar ahora</button>
        <button id="btnRefrescarBrief">Rehacer el resumen del día</button>
      </div>
    </div>

    <div class="bloque">
      <h3>Voz</h3>
      <p>${
        d.vozNube
          ? 'Está usando una voz de ElevenLabs. Suena como una persona.'
          : d.vozConfigurable
          ? 'ElevenLabs está conectado pero falta elegir una voz. Tocá "Cambiar voz".'
          : `Voz del navegador: ${esc(vozElegida?.name || 'la del sistema')}. Suena robótica. Para que suene humana, cargá ELEVENLABS_API_KEY en el .env.`
      }</p>
      <div class="acciones">
        <button id="btnProbarVoz">Probar cómo suena</button>
        ${d.vozConfigurable ? '<button id="btnCambiarVoz">Cambiar voz</button>' : ''}
        <button id="btnCallar">Callar</button>
      </div>
      <div id="listaVoces"></div>
    </div>

    ${
      d.hechos?.length
        ? `<h2 class="seccion">Marcados como listos<span class="n">${d.hechos.length}</span></h2>
           ${d.hechos.map((t) => tarjeta(t, { compacta: true })).join('')}`
        : ''
    }

    <div class="bloque" style="margin-top:20px">
      <h3>Instalar en el teléfono</h3>
      <p>En Android, menú del navegador → <b>Instalar aplicación</b>.<br>
      En iPhone, compartir → <b>Agregar a inicio</b>.</p>
    </div>`;
}

function avisosSetup(d) {
  const faltas = [];
  if (d.demo && !d.claudeConfigurado)
    faltas.push('Modo demo con análisis precargado. Poné ANTHROPIC_API_KEY para que Claude lea de verdad.');
  else if (!d.claudeConfigurado)
    faltas.push('Falta la clave de Claude (ANTHROPIC_API_KEY): sin eso no puede leer ni hablar.');
  if (!d.demo && !d.outlookConfigurado) faltas.push('Falta configurar Microsoft para conectar Outlook.');
  if (!d.demo && d.outlookConfigurado && !d.outlook?.email)
    faltas.push('Outlook todavía no está conectado. Andá a Ajustes → Conectar Outlook.');
  if (!faltas.length) return '';
  return `<div class="setup">${faltas.map((f) => `<div>⚠ ${esc(f)}</div>`).join('')}</div>`;
}

const VISTAS = { hoy: vistaHoy, hablaron: vistaHablaron, esperando: vistaEsperando, ajustes: vistaAjustes };

function pintar() {
  if (!estado.datos) return;
  pintarEncabezado(estado.datos);
  $('#vista').innerHTML = VISTAS[estado.vista]();
  $$('nav .tab').forEach((b) => b.classList.toggle('activo', b.dataset.vista === estado.vista));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ─── Carga ──────────────────────────────────────────────────────────────
async function cargar({ conBrief = true } = {}) {
  estado.datos = await api('/estado');
  pintar();
  if (conBrief && (estado.datos.claudeConfigurado || estado.datos.demo)) {
    try {
      estado.brief = await api('/brief');
      if (estado.vista === 'hoy') pintar();
    } catch (err) {
      aviso(`No pude armar el resumen: ${err.message}`, 'mal');
    }
  }
}

// ─── Detalle de hilo ────────────────────────────────────────────────────
async function abrirHilo(id) {
  const cont = document.createElement('div');
  cont.id = 'detalle';
  cont.innerHTML = `<div class="cargando"><div class="spinner"></div><span>Abriendo…</span></div>`;
  document.body.appendChild(cont);
  document.body.style.overflow = 'hidden';

  let t;
  try {
    t = await api(`/hilo/${encodeURIComponent(id)}`);
  } catch (err) {
    cerrarHilo();
    aviso(err.message, 'mal');
    return;
  }

  cont.innerHTML = `
    <div class="top">
      <button id="cerrarHilo">←</button>
      <b>${esc(t.titulo || t.asunto)}</b>
      <button data-escuchar="${esc(t.id)}">🔊</button>
    </div>
    <div class="cuerpo">
      ${
        t.consejo
          ? `<div class="bloque consejo-bloque"><h3>💡 Mi consejo</h3><p>${esc(t.consejo)}</p></div>`
          : ''
      }
      <div class="bloque">
        <h3>Qué está pasando</h3>
        <p>${esc(t.resumen || 'Sin análisis todavía.')}</p>
        <div class="chips" style="margin-top:12px">
          ${t.urgencia ? `<span class="chip ${t.urgencia === 'alta' ? 'alta' : ''}">${esc(t.urgencia)}</span>` : ''}
          ${t.categoria ? `<span class="chip">${esc(t.categoria)}</span>` : ''}
          ${t.fecha_limite ? `<span class="chip fecha">vence ${esc(t.fecha_limite)}</span>` : ''}
          ${(t.datos_clave ?? []).map((d) => `<span class="chip dato">${esc(d.etiqueta)}: ${esc(d.valor)}</span>`).join('')}
        </div>
      </div>

      ${
        t.te_piden?.length
          ? `<div class="bloque"><h3>Te piden</h3><ul>${t.te_piden.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${
        t.preguntas_abiertas?.length
          ? `<div class="bloque"><h3>Preguntas sin responder</h3><ul>${t.preguntas_abiertas
              .map((x) => `<li>${esc(x)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
      ${
        t.lo_que_dijeron?.length
          ? `<div class="bloque"><h3>Lo que dijeron</h3><ul>${t.lo_que_dijeron.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${
        t.riesgo_si_no_responde
          ? `<div class="bloque" style="border-color:rgba(224,86,74,.35)"><h3>Si lo dejás pasar</h3><p>${esc(
              t.riesgo_si_no_responde
            )}</p></div>`
          : ''
      }

      <div class="bloque">
        <h3>Responder</h3>
        <input class="instruccion" id="instruccion" placeholder="Opcional: decile qué querés contestar…">
        <div class="acciones" style="margin-bottom:12px">
          <button class="pri" id="btnRedactar">Redactar respuesta</button>
          <button id="btnDictarInstruccion">🎙 Dictar</button>
        </div>
        <textarea class="borrador oculto" id="borrador"></textarea>
        <div class="acciones oculto" id="accionesBorrador">
          <button class="pri" id="btnGuardarOutlook">Guardar en Borradores de Outlook</button>
          <button id="btnCopiar">Copiar</button>
        </div>
      </div>

      <div class="bloque">
        <h3>Los correos, tal cual</h3>
        ${t.mensajesCompletos
          .map(
            (m) => `
          <div class="msg ${m.deElla ? 'deElla' : ''}">
            <div class="quien">${esc(m.deElla ? 'Vos' : m.de.nombre || m.de.email)}<small>${esc(m.hace)}</small></div>
            <div class="txt">${esc(m.cuerpo)}</div>
            <button class="mas">Ver todo</button>
          </div>`
          )
          .join('')}
      </div>

      <div class="acciones" style="margin-top:8px">
        <button data-listo="${esc(t.id)}">Marcar como listo</button>
        <button data-posponer="${esc(t.id)}">Posponer 1 día</button>
      </div>
    </div>`;

  $('#cerrarHilo').onclick = cerrarHilo;

  $$('#detalle .mas').forEach((b) => {
    const txt = b.previousElementSibling;
    if (txt.scrollHeight <= 180) {
      b.remove();
      txt.classList.add('abierto');
      return;
    }
    b.onclick = () => {
      txt.classList.toggle('abierto');
      b.textContent = txt.classList.contains('abierto') ? 'Ver menos' : 'Ver todo';
    };
  });

  $('#btnDictarInstruccion').onclick = () => {
    const inp = $('#instruccion');
    inp.placeholder = 'Escuchando…';
    escuchar({
      alParcial: (txt) => (inp.value = txt),
      alTexto: (txt) => {
        inp.value = txt;
        inp.placeholder = 'Opcional: decile qué querés contestar…';
      },
      alCerrar: () => (inp.placeholder = 'Opcional: decile qué querés contestar…'),
    });
  };

  $('#btnRedactar').onclick = async () => {
    const btn = $('#btnRedactar');
    btn.disabled = true;
    btn.textContent = 'Escribiendo…';
    try {
      const r = await api(`/hilo/${encodeURIComponent(t.id)}/borrador`, {
        method: 'POST',
        body: { instruccion: $('#instruccion').value },
      });
      $('#borrador').value = r.texto;
      $('#borrador').classList.remove('oculto');
      $('#accionesBorrador').classList.remove('oculto');
      btn.textContent = 'Rehacer';
    } catch (err) {
      aviso(err.message, 'mal');
      btn.textContent = 'Redactar respuesta';
    } finally {
      btn.disabled = false;
    }
  };

  $('#btnGuardarOutlook').onclick = async () => {
    const btn = $('#btnGuardarOutlook');
    btn.disabled = true;
    try {
      const r = await api(`/hilo/${encodeURIComponent(t.id)}/borrador`, {
        method: 'POST',
        body: { instruccion: $('#borrador').value, guardarEnOutlook: true },
      });
      aviso(r.demo ? 'En modo demo no se guarda en Outlook.' : 'Listo, está en tus Borradores.', 'bien');
    } catch (err) {
      aviso(err.message, 'mal');
    } finally {
      btn.disabled = false;
    }
  };

  $('#btnCopiar').onclick = async () => {
    await navigator.clipboard.writeText($('#borrador').value);
    aviso('Copiado.', 'bien');
  };
}

function cerrarHilo() {
  $('#detalle')?.remove();
  document.body.style.overflow = '';
}

// ─── Preguntar ──────────────────────────────────────────────────────────
function abrirVoz({ arrancarEscuchando = false } = {}) {
  if ($('#voz')) return;
  const cont = document.createElement('div');
  cont.id = 'voz';
  cont.innerHTML = `
    <div class="hoja">
      <div class="agarre"></div>
      <div class="conv" id="conv"></div>
      <div class="escuchando oculto" id="indicador"><span class="onda"><i></i><i></i><i></i><i></i><i></i></span><span id="parcial">Escuchando…</span></div>
      <div class="entrada">
        <button class="sec" id="cerrarVoz">✕</button>
        <input id="pregunta" placeholder="¿Qué querés saber?" autocomplete="off">
        <button id="enviarPregunta">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>
        </button>
      </div>
    </div>`;
  document.body.appendChild(cont);

  cont.addEventListener('click', (e) => {
    if (e.target === cont) cerrarVoz();
  });
  $('#cerrarVoz').onclick = cerrarVoz;
  $('#enviarPregunta').onclick = () => enviarPregunta($('#pregunta').value, false);
  $('#pregunta').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enviarPregunta($('#pregunta').value, false);
  });

  cargarChat();
  if (arrancarEscuchando) dictarPregunta();
  else setTimeout(() => $('#pregunta')?.focus(), 250);
}

function cerrarVoz() {
  dejarDeEscuchar();
  callar();
  $('#voz')?.remove();
}

function burbuja(rol, texto, refs = []) {
  const conv = $('#conv');
  if (!conv) return null;
  const el = document.createElement('div');
  el.className = `burbuja ${rol === 'user' ? 'yo' : 'el'}`;
  el.textContent = texto;
  if (refs.length) {
    const cont = document.createElement('div');
    cont.className = 'refs';
    refs.forEach((id) => {
      const b = document.createElement('button');
      b.textContent = 'Abrir hilo';
      b.onclick = () => {
        cerrarVoz();
        abrirHilo(id);
      };
      cont.appendChild(b);
    });
    el.appendChild(cont);
  }
  conv.appendChild(el);
  conv.scrollTop = conv.scrollHeight;
  return el;
}

async function cargarChat() {
  try {
    const historia = await api('/chat');
    if (!historia.length) {
      burbuja(
        'assistant',
        'Preguntame lo que quieras del correo. Por ejemplo: "¿qué me pidió Rodrigo?", "¿alguien mencionó el contenedor?", "¿qué es lo más urgente ahora?".'
      );
      return;
    }
    historia.forEach((c) => burbuja(c.rol === 'user' ? 'user' : 'assistant', c.texto, c.refs));
  } catch {}
}

function dictarPregunta() {
  const ind = $('#indicador');
  const parcial = $('#parcial');
  ind?.classList.remove('oculto');
  $('#mic')?.classList.add('grabando');
  escuchar({
    alParcial: (txt) => {
      if (parcial) parcial.textContent = txt || 'Escuchando…';
    },
    alTexto: (txt) => {
      ind?.classList.add('oculto');
      enviarPregunta(txt, true);
    },
    alCerrar: () => ind?.classList.add('oculto'),
  });
}

let preguntando = false;
async function enviarPregunta(texto, porVoz) {
  const pregunta = texto?.trim();
  if (!pregunta || preguntando) return;
  preguntando = true;
  $('#pregunta').value = '';
  burbuja('user', pregunta);

  const cargando = document.createElement('div');
  cargando.className = 'pensando';
  cargando.innerHTML = '<i></i><i></i><i></i>';
  $('#conv')?.appendChild(cargando);
  $('#conv').scrollTop = $('#conv').scrollHeight;

  try {
    const r = await api('/preguntar', { method: 'POST', body: { pregunta, voz: porVoz } });
    cargando.remove();
    // El id del hilo va entre corchetes: lo sacamos del texto hablado.
    const limpio = r.texto.replace(/\s*\[[A-Za-z0-9_+/=\-]{8,}\]/g, '').trim();
    burbuja('assistant', limpio, r.refs);
    if (porVoz) hablar(limpio);
  } catch (err) {
    cargando.remove();
    burbuja('assistant', `Se me complicó: ${err.message}`);
  } finally {
    preguntando = false;
  }
}

// ─── Elegir la voz ──────────────────────────────────────────────────────
async function mostrarVoces() {
  const cont = $('#listaVoces');
  if (!cont) return;
  if (cont.dataset.abierto === '1') {
    cont.innerHTML = '';
    cont.dataset.abierto = '0';
    return;
  }
  cont.dataset.abierto = '1';
  cont.innerHTML = '<div class="cargando" style="padding:24px 0"><div class="spinner"></div><span>Buscando voces…</span></div>';

  let voces;
  try {
    voces = await api('/voces');
  } catch (err) {
    cont.innerHTML = `<p style="color:var(--rojo);font-size:.82rem;margin-top:12px">${esc(err.message)}</p>`;
    return;
  }

  if (!voces.length) {
    cont.innerHTML = '<p style="color:var(--gris);font-size:.82rem;margin-top:12px">Tu cuenta de ElevenLabs no tiene ninguna voz.</p>';
    return;
  }

  cont.innerHTML = `
    <p style="color:var(--gris-suave);font-size:.76rem;margin:14px 0 10px">
      Tocá ▶ para escucharla, y "Usar esta" para dejarla fija.
    </p>
    ${voces
      .map(
        (v) => `
      <div class="voz-fila ${v.elegida ? 'elegida' : ''}">
        <button class="voz-muestra" data-muestra="${esc(v.muestra)}" aria-label="Escuchar ${esc(v.nombre)}">▶</button>
        <div class="voz-datos">
          <b>${esc(v.nombre)}</b>
          <small>${esc([v.idioma, v.descripcion].filter(Boolean).join(' · ') || 'sin etiquetas')}</small>
        </div>
        ${
          v.elegida
            ? '<span class="voz-marca">en uso</span>'
            : `<button class="voz-usar" data-usar="${esc(v.id)}">Usar esta</button>`
        }
      </div>`
      )
      .join('')}`;
}

let muestraSonando = null;
function probarMuestra(url) {
  muestraSonando?.pause();
  if (!url) return aviso('Esa voz no trae muestra.', 'mal');
  muestraSonando = new Audio(url);
  muestraSonando.play().catch(() => aviso('No pude reproducir la muestra.', 'mal'));
}

// ─── Eventos globales ───────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const abrir = e.target.closest('[data-abrir]');
  if (abrir) return abrirHilo(abrir.dataset.abrir);

  const esc_ = e.target.closest('[data-escuchar]');
  if (esc_) {
    const id = esc_.dataset.escuchar;
    const t =
      estado.datos?.teHablaron.concat(estado.datos.esperando, estado.datos.alDia, estado.datos.hechos ?? []).find((x) => x.id === id) ??
      estado.brief?.porId?.[id];
    if (!t) return;
    if (estado.hablando) return callar();
    hablar(t.una_linea_para_voz || t.resumen || t.asunto);
    return;
  }

  const listo = e.target.closest('[data-listo]');
  if (listo) {
    await api(`/hilo/${encodeURIComponent(listo.dataset.listo)}/estado`, { method: 'POST', body: { estado: 'hecho' } });
    aviso('Marcado como listo.', 'bien');
    cerrarHilo();
    return cargar({ conBrief: false });
  }

  const posponer = e.target.closest('[data-posponer]');
  if (posponer) {
    const hasta = new Date(Date.now() + 86_400_000).toISOString();
    await api(`/hilo/${encodeURIComponent(posponer.dataset.posponer)}/estado`, {
      method: 'POST',
      body: { estado: 'pospuesto', hasta },
    });
    aviso('Lo vemos mañana.', 'bien');
    cerrarHilo();
    return cargar({ conBrief: false });
  }

  const fijar = e.target.closest('[data-fijar]');
  if (fijar) {
    const id = fijar.dataset.fijar;
    const actual = fijar.classList.contains('on');
    await api(`/hilo/${encodeURIComponent(id)}/fijar`, { method: 'POST', body: { fijado: !actual } });
    return cargar({ conBrief: false });
  }

  if (e.target.closest('#btnBrief')) {
    const btn = e.target.closest('#btnBrief');
    if (estado.hablando) {
      callar();
      btn.querySelector('.icono').textContent = '▶';
      return;
    }
    btn.classList.add('sonando');
    const icono = btn.querySelector('.icono');
    icono.textContent = '❚❚';
    hablar(estado.brief.guion_voz, {
      alGenerar: (generando) => { icono.textContent = generando ? '⋯' : '❚❚'; },
      alTerminar: () => {
        btn.classList.remove('sonando');
        icono.textContent = '▶';
      },
    });
    return;
  }

  const guion = e.target.closest('#guionTexto');
  if (guion) {
    guion.classList.toggle('abierto');
    return;
  }

  if (e.target.closest('#btnSync') || e.target.closest('#btnSyncAjustes')) {
    aviso('Revisando el correo…');
    try {
      await api('/sync', { method: 'POST' });
      await cargar({ conBrief: false });
      aviso('Al día.', 'bien');
    } catch (err) {
      aviso(err.message, 'mal');
    }
    return;
  }

  if (e.target.closest('#btnRefrescarBrief')) {
    aviso('Rehaciendo el resumen…');
    try {
      estado.brief = await api('/brief?refrescar=1');
      estado.vista = 'hoy';
      pintar();
      aviso('Listo.', 'bien');
    } catch (err) {
      aviso(err.message, 'mal');
    }
    return;
  }

  const btnTema = e.target.closest('#temaToggle [data-tema]');
  if (btnTema) {
    elegirTema(btnTema.dataset.tema);
    $$('#temaToggle button').forEach((b) => b.classList.toggle('on', b === btnTema));
    return;
  }

  if (e.target.closest('#btnProbarVoz')) {
    const btn = e.target.closest('#btnProbarVoz');
    const antes = btn.textContent;
    return hablar(
      'Hola. Así te voy a leer los correos cada mañana. Si esta voz no te gusta, cambiala acá abajo.',
      {
        alGenerar: (generando) => { btn.textContent = generando ? 'Generando…' : antes; },
        alTerminar: () => { btn.textContent = antes; },
      }
    );
  }

  if (e.target.closest('#btnCambiarVoz')) return mostrarVoces();

  const muestra = e.target.closest('[data-muestra]');
  if (muestra) return probarMuestra(muestra.dataset.muestra);

  const usar = e.target.closest('[data-usar]');
  if (usar) {
    try {
      await api('/voces/elegir', { method: 'POST', body: { voiceId: usar.dataset.usar } });
      audiosLocales.clear();          // la voz cambió: el audio viejo ya no sirve
      aviso('Voz cambiada.', 'bien');
      await cargar({ conBrief: false });
      estado.vista = 'ajustes';
      pintar();
      mostrarVoces();
    } catch (err) {
      aviso(err.message, 'mal');
    }
    return;
  }
  if (e.target.closest('#btnCallar')) return callar();

  if (e.target.closest('#btnDesconectar')) {
    await api('/desconectar', { method: 'POST' });
    aviso('Outlook desconectado.');
    return cargar({ conBrief: false });
  }

  const tab = e.target.closest('nav .tab');
  if (tab) {
    estado.vista = tab.dataset.vista;
    pintar();
  }
});

$('#mic').addEventListener('click', () => {
  if (estado.hablando) return callar();
  if (estado.escuchando) return dejarDeEscuchar();
  abrirVoz({ arrancarEscuchando: true });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#detalle')) cerrarHilo();
    else if ($('#voz')) cerrarVoz();
  }
});

// Los relojes siguen corriendo aunque no haya sincronización.
setInterval(() => {
  if (estado.datos) {
    const d = estado.datos.reloj;
    const ahora = new Date();
    const f = (tz) => new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora);
    $('#relojHer')?.querySelector('.hora') && ($('#relojHer').querySelector('.hora').textContent = f(d.her.tz));
    $('#relojHq')?.querySelector('.hora') && ($('#relojHq').querySelector('.hora').textContent = f(d.hq.tz));
  }
}, 30_000);

// Refresco al volver a la app
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && estado.datos) cargar({ conBrief: false }).catch(() => {});
});

// ─── Tema claro / oscuro ─────────────────────────────────────────────────
function aplicarTema(tema) {
  // tema: 'oscuro' | 'claro' | 'auto'
  const raiz = document.documentElement;
  let efectivo = tema;
  if (tema === 'auto') {
    efectivo = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
  }
  if (efectivo === 'claro') raiz.setAttribute('data-tema', 'claro');
  else raiz.removeAttribute('data-tema');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', efectivo === 'claro' ? '#F6F4EE' : '#0B0B0C');
}

function temaGuardado() {
  try {
    return localStorage.getItem('clau_tema') || 'oscuro';
  } catch {
    return 'oscuro';
  }
}

function elegirTema(tema) {
  try {
    localStorage.setItem('clau_tema', tema);
  } catch {}
  aplicarTema(tema);
}

aplicarTema(temaGuardado());
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (temaGuardado() === 'auto') aplicarTema('auto');
  });
}

// ─── Arranque ───────────────────────────────────────────────────────────
(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  try {
    const pub = await api('/publico/estado');
    if (pub.logueada) {
      mostrarApp();
      await cargar();
      if (new URLSearchParams(location.search).get('conectado') === '1') {
        aviso('Outlook conectado. Traigo tus correos…', 'bien');
        history.replaceState({}, '', '/');
      }
    } else {
      mostrarLogin();
    }
  } catch {
    mostrarLogin();
  }
})();
