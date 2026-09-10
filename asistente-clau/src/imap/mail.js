/**
 * Lectura de correo por IMAP. Es el camino universal: sirve para Gmail,
 * Outlook personal, Yahoo o el correo de una empresa, sin registrar nada
 * en Azure. Sólo lee (no envía): la app nunca manda correos igual.
 *
 * Trae la bandeja de entrada y los enviados de los últimos `días`, los
 * normaliza a la misma forma que usa el resto de la app y deja que el
 * agrupador por hilos y el análisis con Claude hagan el resto.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';
import { kv } from '../db.js';
import { htmlToText } from '../graph/mail.js';

function cliente() {
  const { imap } = config;
  if (!imap.configured) throw new Error('IMAP no está configurado (faltan IMAP_USER / IMAP_PASSWORD).');
  return new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.port === 993,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
    // Gmail y varios servidores cierran conexiones ociosas; toleramos eso.
    socketTimeout: 60_000,
  });
}

const persona = (addr) => ({
  name: addr?.name || '',
  email: (addr?.address || '').toLowerCase(),
});

/** Convierte un correo parseado por mailparser a la forma interna de la app. */
function normalizar(parsed, uid, folder) {
  const from = parsed.from?.value?.[0];
  const to = (parsed.to?.value || []).map(persona);
  const cc = (parsed.cc?.value || []).map(persona);
  const cuerpo = parsed.text || htmlToText(parsed.html || '') || '';
  // Un id estable por mensaje: el Message-ID si existe, si no carpeta+uid.
  const id = parsed.messageId || `${folder}:${uid}`;
  return {
    id,
    // Sin hilos nativos de IMAP: agrupamos por asunto normalizado, que es
    // lo que hacen casi todos los clientes de correo.
    conversationId: hiloDeAsunto(parsed.subject) || id,
    folder,
    subject: parsed.subject || '(sin asunto)',
    fromName: persona(from).name,
    fromEmail: persona(from).email,
    to,
    cc,
    receivedAt: (parsed.date || new Date()).toISOString(),
    preview: cuerpo.slice(0, 200),
    body: cuerpo.slice(0, 20000),
    isRead: true,
    hasAttachments: (parsed.attachments || []).length > 0,
    attachments: [],
    webLink: '',
  };
}

/** Agrupa por asunto sin los "Re:", "Fwd:", "RV:" del principio. */
function hiloDeAsunto(subject = '') {
  const limpio = subject
    .replace(/^(\s*(re|rv|fwd|fw|reenv|reenviado)\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
  return limpio ? `asunto:${limpio}` : '';
}

/**
 * Trae una carpeta por IMAP. Guarda el último UID visto para traer sólo lo
 * nuevo en las corridas siguientes (sincronización incremental).
 */
async function traerCarpeta(client, ruta, folder, { days, maxMensajes = 200 }) {
  const claveUid = `imap_lastuid_${folder}`;
  const lock = await client.getMailboxLock(ruta);
  const mensajes = [];
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const ultimoUid = Number(kv.get(claveUid) || 0);

    // Buscamos por fecha; si ya tenemos un UID tope, además pedimos > ese UID.
    const criterio = ultimoUid ? { uid: `${ultimoUid + 1}:*` } : { since };
    let uids = [];
    try {
      uids = await client.search(criterio, { uid: true });
    } catch {
      uids = await client.search({ since }, { uid: true });
    }
    if (!Array.isArray(uids)) uids = [];
    // Los más nuevos primero, con tope para no descargar años de correo.
    uids = uids.sort((a, b) => b - a).slice(0, maxMensajes);

    let maxUid = ultimoUid;
    for await (const msg of client.fetch(
      uids.length ? uids : criterio,
      { uid: true, source: true },
      { uid: true }
    )) {
      maxUid = Math.max(maxUid, msg.uid);
      try {
        const parsed = await simpleParser(msg.source);
        // Respetamos la ventana de días aunque el servidor devuelva de más.
        if (parsed.date && parsed.date < since) continue;
        mensajes.push(normalizar(parsed, msg.uid, folder));
      } catch (err) {
        console.warn(`[imap] no pude parsear un mensaje de ${folder}:`, err.message);
      }
    }
    if (maxUid > ultimoUid) kv.set(claveUid, String(maxUid));
  } finally {
    lock.release();
  }
  return mensajes;
}

/** Nombre real de la carpeta de enviados (varía por proveedor e idioma). */
async function rutaEnviados(client) {
  const preferida = config.imap.carpetaEnviados;
  try {
    const lista = await client.list();
    // 1) la que configuramos, 2) la marcada \Sent por el servidor, 3) por nombre
    const porNombre = lista.find((b) => b.path === preferida);
    if (porNombre) return porNombre.path;
    const porFlag = lista.find((b) => b.specialUse === '\\Sent' || b.flags?.has?.('\\Sent'));
    if (porFlag) return porFlag.path;
    const porTexto = lista.find((b) => /sent|enviad/i.test(b.name || b.path));
    if (porTexto) return porTexto.path;
  } catch {}
  return preferida;
}

/**
 * Sincroniza IMAP. Devuelve { changed, removed } con la misma forma que el
 * deltaSync de Graph, para que sync.js no note la diferencia.
 */
export async function imapSync({ days = 30 } = {}) {
  const client = cliente();
  await client.connect();
  try {
    const inbox = await traerCarpeta(client, 'INBOX', 'inbox', { days });
    const enviados = await traerCarpeta(client, await rutaEnviados(client), 'sent', { days });
    return { changed: [...inbox, ...enviados], removed: [] };
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Prueba la conexión y devuelve el correo conectado, o lanza un error claro. */
export async function probarImap() {
  const client = cliente();
  try {
    await client.connect();
    await client.logout().catch(() => {});
    return { ok: true, email: config.imap.user };
  } catch (err) {
    let msg = err.message || 'no se pudo conectar';
    if (/auth|login|credentials|invalid/i.test(msg)) {
      msg = 'Usuario o clave incorrectos. En Gmail tenés que usar una "clave de aplicación", no tu clave normal.';
    }
    throw new Error(msg);
  }
}
