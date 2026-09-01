import { getAccessToken } from './auth.js';
import { kv } from '../db.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function graph(pathOrUrl, { method = 'GET', body, headers = {} } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Outlook no está conectado. Entrá a /auth/login.');

  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Graph ${res.status} en ${url.replace(GRAPH, '')}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Pasa HTML de Outlook a texto plano legible, sin arrastrar la firma entera. */
export function htmlToText(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<td[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const person = (r) => ({
  name: r?.emailAddress?.name || '',
  email: (r?.emailAddress?.address || '').toLowerCase(),
});

function normalize(raw, folder) {
  return {
    id: raw.id,
    conversationId: raw.conversationId || raw.id,
    folder,
    subject: raw.subject || '(sin asunto)',
    fromName: person(raw.from || raw.sender).name,
    fromEmail: person(raw.from || raw.sender).email,
    to: (raw.toRecipients || []).map(person),
    cc: (raw.ccRecipients || []).map(person),
    receivedAt: raw.receivedDateTime || raw.sentDateTime || new Date().toISOString(),
    preview: raw.bodyPreview || '',
    body: htmlToText(raw.body?.content || raw.bodyPreview || '').slice(0, 20000),
    isRead: Boolean(raw.isRead),
    hasAttachments: Boolean(raw.hasAttachments),
    attachments: [],
    webLink: raw.webLink || '',
  };
}

const SELECT = [
  'id', 'conversationId', 'subject', 'from', 'sender', 'toRecipients', 'ccRecipients',
  'receivedDateTime', 'sentDateTime', 'bodyPreview', 'body', 'isRead', 'hasAttachments', 'webLink',
].join(',');

const FOLDERS = {
  inbox: { path: 'inbox', deltaKey: 'delta_inbox' },
  sent: { path: 'sentitems', deltaKey: 'delta_sent' },
};

/**
 * Sincronización incremental con delta query de Graph.
 * La primera vez trae los últimos `days` días; después sólo lo que cambió.
 */
export async function deltaSync(folder, { days = 30, maxPages = 20 } = {}) {
  const meta = FOLDERS[folder];
  if (!meta) throw new Error(`Carpeta desconocida: ${folder}`);

  let url = kv.get(meta.deltaKey);
  if (!url) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    url =
      `${GRAPH}/me/mailFolders/${meta.path}/messages/delta` +
      `?$select=${SELECT}&$filter=receivedDateTime ge ${since}&$top=50`;
  }

  const changed = [];
  const removed = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const page = await graph(url, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    for (const item of page.value ?? []) {
      if (item['@removed']) removed.push(item.id);
      else changed.push(normalize(item, folder));
    }
    pages += 1;

    if (page['@odata.nextLink']) {
      url = page['@odata.nextLink'];
    } else {
      if (page['@odata.deltaLink']) kv.set(meta.deltaKey, page['@odata.deltaLink']);
      url = null;
    }
  }

  // Si nos quedamos sin páginas, la próxima corrida sigue donde quedó.
  if (url) kv.set(meta.deltaKey, url);

  return { changed, removed };
}

export async function getMe() {
  return graph('/me?$select=displayName,mail,userPrincipalName,mailboxSettings');
}

export async function markRead(messageId, isRead = true) {
  return graph(`/me/messages/${messageId}`, { method: 'PATCH', body: { isRead } });
}

/**
 * Crea un borrador de respuesta en Outlook, en el mismo hilo.
 * No envía nada: queda en Borradores para que ella lo revise.
 */
export async function createReplyDraft(messageId, textBody) {
  const draft = await graph(`/me/messages/${messageId}/createReply`, { method: 'POST' });
  const html = textBody
    .split('\n')
    .map((line) => `<p>${line.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) || '&nbsp;'}</p>`)
    .join('');

  await graph(`/me/messages/${draft.id}`, {
    method: 'PATCH',
    body: { body: { contentType: 'HTML', content: html + (draft.body?.content ?? '') } },
  });

  return { id: draft.id, webLink: draft.webLink };
}

export async function sendDraft(draftId) {
  return graph(`/me/messages/${draftId}/send`, { method: 'POST' });
}

export { graph };
