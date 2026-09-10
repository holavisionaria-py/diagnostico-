import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config } from './config.js';
import {
  allThreads,
  getThread,
  messagesOfThread,
  setThreadStatus,
  setThreadPinned,
  recentChat,
  clearChat,
  kv,
} from './db.js';
import { runSync, startSyncLoop, syncState } from './sync.js';
import { generateBrief } from './ai/brief.js';
import { ask } from './ai/ask.js';
import { draftReply } from './ai/draft.js';
import { sintetizar, listarVoces, elegirVoz, vozDisponible, vozActual } from './ai/voz.js';
import { getAuthUrl, handleCallback, connectedAccount, disconnect } from './graph/auth.js';
import { createReplyDraft } from './graph/mail.js';
import { overlapWindow, humanAgo, clockIn, longDate, dayKey } from './util/time.js';

const here = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'warn' } });

await app.register(fastifyCookie, { secret: config.sessionSecret });
await app.register(fastifyStatic, { root: join(here, '..', 'public'), index: 'index.html' });

// ── anti-caché ──────────────────────────────────────────────────────────────
// Cloudflare (y cualquier proxy o navegador en el medio) NO debe guardar las
// respuestas de la API ni el HTML: eso hacía que una respuesta de "sesión
// iniciada" quedara cacheada y se le sirviera a todo el mundo, rompiendo el
// login. Todo lo dinámico se marca como no-cacheable; los assets con hash de
// versión (?v=) sí pueden cachearse.
app.addHook('onSend', async (req, reply, payload) => {
  const p = req.url.split('?')[0];
  const dinamico =
    p.startsWith('/api') ||
    p.startsWith('/auth') ||
    p === '/' ||
    p.endsWith('.html') ||
    p.endsWith('/sw.js');
  if (dinamico) {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    reply.header('CDN-Cache-Control', 'no-store');
    reply.header('Cloudflare-CDN-Cache-Control', 'no-store');
  }
  return payload;
});

// ── sesión ────────────────────────────────────────────────────────────────
const SESSION_COOKIE = 'clau_sesion';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function isLoggedIn(req) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return false;
  const { valid, value } = app.unsignCookie(raw);
  return valid && value === 'ok';
}

/** Todo lo que cuelga de /api (menos login y estado público) pide sesión. */
app.addHook('preHandler', async (req, reply) => {
  const open = ['/api/login', '/api/publico'];
  if (!req.url.startsWith('/api') || open.some((p) => req.url.startsWith(p))) return;
  if (!isLoggedIn(req)) {
    reply.code(401).send({ error: 'Necesitás iniciar sesión' });
  }
});

app.post('/api/login', async (req, reply) => {
  const { password } = req.body ?? {};
  if (!password || !safeEqual(password, config.appPassword)) {
    await new Promise((r) => setTimeout(r, 600)); // freno para fuerza bruta
    return reply.code(401).send({ error: 'Clave incorrecta' });
  }
  reply.setCookie(SESSION_COOKIE, 'ok', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
    secure: req.protocol === 'https',
  });
  return { ok: true };
});

app.post('/api/logout', async (req, reply) => {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/publico/estado', async (req) => ({
  logueada: isLoggedIn(req),
  demo: config.demo,
  nombre: config.her.name,
}));

// ── datos ─────────────────────────────────────────────────────────────────
const ORDEN_URGENCIA = { alta: 0, media: 1, baja: 2 };

function serializeThread(t, now) {
  const a = t.analysis_json ? JSON.parse(t.analysis_json) : null;
  return {
    id: t.conversation_id,
    asunto: t.subject,
    ultimoAt: t.last_at,
    hace: humanAgo(t.last_at, now),
    ultimoDeElla: t.last_folder === 'sent',
    de: { nombre: t.last_from_name, email: t.last_from_email },
    mensajes: t.msg_count,
    estado: t.status,
    fijado: Boolean(t.pinned),
    pospuestoHasta: t.snoozed_until,
    analizado: Boolean(a),
    error: t.analysis_error,
    ...(a ?? {}),
  };
}

function agrupar(threads, now) {
  const activos = threads.filter(
    (t) => t.estado !== 'hecho' && (!t.pospuestoHasta || new Date(t.pospuestoHasta) <= now)
  );

  const cmp = (x, y) => {
    if (x.fijado !== y.fijado) return x.fijado ? -1 : 1;
    const u = (ORDEN_URGENCIA[x.urgencia] ?? 3) - (ORDEN_URGENCIA[y.urgencia] ?? 3);
    if (u !== 0) return u;
    return new Date(y.ultimoAt) - new Date(x.ultimoAt);
  };

  const teHablaron = activos.filter((t) => t.bola_en_su_cancha).sort(cmp);
  const esperando = activos
    .filter((t) => !t.bola_en_su_cancha && t.ultimoDeElla)
    .sort((x, y) => new Date(x.ultimoAt) - new Date(y.ultimoAt));
  const alDia = activos.filter((t) => !t.bola_en_su_cancha && !t.ultimoDeElla).sort(cmp);

  return { teHablaron, esperando, alDia };
}

app.get('/api/estado', async () => {
  const now = new Date();
  const threads = allThreads().map((t) => serializeThread(t, now));
  const grupos = agrupar(threads, now);

  return {
    demo: config.demo,
    ella: { nombre: config.her.name, email: config.her.email },
    outlook: config.demo ? { demo: true } : connectedAccount(),
    outlookConfigurado: config.ms.configured,
    // Correo genérico: puede venir por IMAP o por Outlook.
    correo: {
      proveedor: config.demo ? 'demo' : config.proveedorCorreo,
      conectado: config.demo || config.proveedorCorreo === 'imap' || Boolean(connectedAccount()?.email),
      cuenta: config.demo
        ? 'Correos de ejemplo'
        : config.proveedorCorreo === 'imap'
        ? config.imap.user
        : connectedAccount()?.email || '',
    },
    claudeConfigurado: config.anthropic.hasKey,
    vozNube: vozDisponible() && Boolean(vozActual()),
    vozConfigurable: vozDisponible(),
    sync: syncState(),
    reloj: {
      ...overlapWindow(now),
      fecha: longDate(config.tz.her, now),
      dia: dayKey(now),
    },
    contadores: {
      teHablaron: grupos.teHablaron.length,
      urgentes: grupos.teHablaron.filter((t) => t.urgencia === 'alta').length,
      esperando: grupos.esperando.length,
      total: threads.length,
    },
    ...grupos,
    hechos: threads.filter((t) => t.estado === 'hecho').slice(0, 20),
  };
});

app.get('/api/brief', async (req) => {
  const force = req.query?.refrescar === '1';
  const brief = await generateBrief({ force });
  const now = new Date();
  const porId = new Map(allThreads().map((t) => [t.conversation_id, serializeThread(t, now)]));
  return { ...brief, porId: Object.fromEntries(porId) };
});

app.get('/api/hilo/:id', async (req, reply) => {
  const t = getThread(req.params.id);
  if (!t) return reply.code(404).send({ error: 'No encontré ese hilo' });
  const now = new Date();
  return {
    ...serializeThread(t, now),
    mensajesCompletos: messagesOfThread(req.params.id).map((m) => ({
      id: m.id,
      de: { nombre: m.from_name, email: m.from_email },
      deElla: m.from_email === config.her.email,
      para: JSON.parse(m.to_json || '[]'),
      fecha: m.received_at,
      hace: humanAgo(m.received_at, now),
      cuerpo: m.body || m.preview,
      adjuntos: Boolean(m.has_attachments),
      link: m.web_link,
    })),
  };
});

app.post('/api/hilo/:id/estado', async (req) => {
  const { estado, hasta } = req.body ?? {};
  if (!['abierto', 'hecho', 'pospuesto'].includes(estado)) {
    throw app.httpErrors?.badRequest?.('Estado inválido') ?? new Error('Estado inválido');
  }
  setThreadStatus(req.params.id, estado, estado === 'pospuesto' ? hasta ?? null : null);
  return { ok: true };
});

app.post('/api/hilo/:id/fijar', async (req) => {
  setThreadPinned(req.params.id, Boolean(req.body?.fijado));
  return { ok: true };
});

app.post('/api/hilo/:id/borrador', async (req, reply) => {
  const { instruccion = '', guardarEnOutlook = false } = req.body ?? {};
  try {
    const { texto, replyToMessageId } = await draftReply(req.params.id, instruccion);
    let outlook = null;
    // Guardar como borrador sólo existe por Graph; por IMAP se copia y listo.
    if (guardarEnOutlook && !config.demo && config.proveedorCorreo === 'graph') {
      outlook = await createReplyDraft(replyToMessageId, texto);
    }
    return { texto, outlook, demo: config.demo, soloTexto: config.proveedorCorreo !== 'graph' };
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

app.post('/api/preguntar', async (req, reply) => {
  const { pregunta, voz = false } = req.body ?? {};
  if (!pregunta?.trim()) return reply.code(400).send({ error: 'Falta la pregunta' });
  try {
    return await ask(pregunta.trim(), { voice: Boolean(voz) });
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

app.get('/api/chat', async () =>
  recentChat(30).map((c) => ({
    rol: c.role,
    texto: c.content,
    refs: JSON.parse(c.refs_json || '[]'),
    fecha: c.created_at,
  }))
);

app.delete('/api/chat', async () => {
  clearChat();
  return { ok: true };
});

app.post('/api/sync', async (req, reply) => {
  try {
    return await runSync();
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

app.post('/api/desconectar', async () => {
  disconnect();
  return { ok: true };
});

// ── voz ───────────────────────────────────────────────────────────────────
app.post('/api/voz', async (req, reply) => {
  const { texto } = req.body ?? {};
  if (!texto?.trim()) return reply.code(400).send({ error: 'Falta el texto' });
  try {
    const { audio, cacheado } = await sintetizar(texto);
    return reply
      .type('audio/mpeg')
      .header('Cache-Control', 'private, max-age=86400')
      .header('X-Voz-Cacheada', cacheado ? '1' : '0')
      .send(audio);
  } catch (err) {
    return reply.code(502).send({ error: err.message });
  }
});

app.get('/api/voces', async (req, reply) => {
  try {
    return await listarVoces();
  } catch (err) {
    return reply.code(502).send({ error: err.message });
  }
});

app.post('/api/voces/elegir', async (req, reply) => {
  const { voiceId } = req.body ?? {};
  if (!voiceId) return reply.code(400).send({ error: 'Falta la voz' });
  elegirVoz(voiceId);
  return { ok: true, voiceId };
});

// ── OAuth de Microsoft ────────────────────────────────────────────────────
app.get('/auth/login', async (req, reply) => {
  if (!isLoggedIn(req)) return reply.redirect('/');
  try {
    return reply.redirect(await getAuthUrl());
  } catch (err) {
    return reply.code(500).send(err.message);
  }
});

app.get('/auth/callback', async (req, reply) => {
  const { code, error, error_description: desc } = req.query ?? {};
  if (error) return reply.type('text/html').send(pagina('No se pudo conectar', desc || error));
  if (!code) return reply.type('text/html').send(pagina('Falta el código', 'Microsoft no devolvió el código de autorización.'));

  try {
    await handleCallback(code);
    kv.del('delta_inbox');
    kv.del('delta_sent');
    runSync().catch(() => {});
    return reply.redirect('/?conectado=1');
  } catch (err) {
    return reply.type('text/html').send(pagina('Error al conectar', err.message));
  }
});

const pagina = (titulo, detalle) => `<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;background:#0E0E0E;color:#fff;padding:40px;line-height:1.6">
<h1 style="color:#C9A84C">${titulo}</h1><p style="color:#A8A8A8">${detalle}</p>
<p><a style="color:#A4E000" href="/">← Volver</a></p></body>`;

// ── arranque ──────────────────────────────────────────────────────────────
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'No existe' });
  return reply.sendFile('index.html');
});

const start = async () => {
  await app.listen({ port: config.port, host: config.host });
  console.log(`\n  Asistente Clau escuchando en http://localhost:${config.port}`);
  if (config.demo) console.log('  MODO DEMO: correos de mentira, no toca Outlook.');
  if (!config.anthropic.hasKey) console.log('  ⚠ Falta ANTHROPIC_API_KEY: no va a poder analizar ni hablar.');
  if (!config.demo) {
    if (config.proveedorCorreo === 'imap') console.log(`  ✓ Correo por IMAP: ${config.imap.user} (${config.imap.host})`);
    else if (config.proveedorCorreo === 'graph') console.log('  ✓ Correo por Outlook/Microsoft.');
    else console.log('  ⚠ Falta configurar el correo: poné IMAP_USER / IMAP_PASSWORD en el .env (o conectá Outlook).');
  }
  console.log('');

  startSyncLoop();
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
