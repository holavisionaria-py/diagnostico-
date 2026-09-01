import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  folder          TEXT NOT NULL,           -- inbox | sent
  subject         TEXT,
  from_name       TEXT,
  from_email      TEXT,
  to_json         TEXT,
  cc_json         TEXT,
  received_at     TEXT,                    -- ISO 8601 UTC
  preview         TEXT,
  body            TEXT,
  is_read         INTEGER DEFAULT 0,
  has_attachments INTEGER DEFAULT 0,
  attachments     TEXT,
  web_link        TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_date ON messages(received_at DESC);

CREATE TABLE IF NOT EXISTS threads (
  conversation_id TEXT PRIMARY KEY,
  subject         TEXT,
  last_at         TEXT,
  last_from_email TEXT,
  last_from_name  TEXT,
  last_folder     TEXT,
  msg_count       INTEGER DEFAULT 0,
  participants    TEXT,
  analysis_json   TEXT,
  content_hash    TEXT,                    -- hash del contenido actual del hilo
  analyzed_hash   TEXT,                    -- hash que ya fue analizado
  analyzed_at     TEXT,
  analysis_error  TEXT,
  status          TEXT DEFAULT 'abierto',  -- abierto | hecho | pospuesto
  snoozed_until   TEXT,
  pinned          INTEGER DEFAULT 0,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_thread_last ON threads(last_at DESC);

CREATE TABLE IF NOT EXISTS briefs (
  day        TEXT PRIMARY KEY,             -- YYYY-MM-DD en la zona de ella
  json       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  role       TEXT NOT NULL,                -- user | assistant
  content    TEXT NOT NULL,
  refs_json  TEXT,
  created_at TEXT NOT NULL
);
`);

// ── kv ────────────────────────────────────────────────────────────────────
const kvGet = db.prepare('SELECT v FROM kv WHERE k = ?');
const kvSet = db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
const kvDel = db.prepare('DELETE FROM kv WHERE k = ?');

export const kv = {
  get(key) {
    return kvGet.get(key)?.v ?? null;
  },
  getJSON(key, fallback = null) {
    const raw = kv.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    kvSet.run(key, String(value));
  },
  setJSON(key, value) {
    kvSet.run(key, JSON.stringify(value));
  },
  del(key) {
    kvDel.run(key);
  },
};

// ── mensajes ──────────────────────────────────────────────────────────────
const upsertMessageStmt = db.prepare(`
INSERT INTO messages (
  id, conversation_id, folder, subject, from_name, from_email,
  to_json, cc_json, received_at, preview, body, is_read, has_attachments,
  attachments, web_link
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  conversation_id = excluded.conversation_id,
  folder          = excluded.folder,
  subject         = excluded.subject,
  from_name       = excluded.from_name,
  from_email      = excluded.from_email,
  to_json         = excluded.to_json,
  cc_json         = excluded.cc_json,
  received_at     = excluded.received_at,
  preview         = excluded.preview,
  body            = excluded.body,
  is_read         = excluded.is_read,
  has_attachments = excluded.has_attachments,
  attachments     = excluded.attachments,
  web_link        = excluded.web_link
`);

export function upsertMessage(m) {
  upsertMessageStmt.run(
    m.id,
    m.conversationId,
    m.folder,
    m.subject ?? '',
    m.fromName ?? '',
    (m.fromEmail ?? '').toLowerCase(),
    JSON.stringify(m.to ?? []),
    JSON.stringify(m.cc ?? []),
    m.receivedAt ?? new Date().toISOString(),
    m.preview ?? '',
    m.body ?? '',
    m.isRead ? 1 : 0,
    m.hasAttachments ? 1 : 0,
    JSON.stringify(m.attachments ?? []),
    m.webLink ?? ''
  );
}

export function deleteMessage(id) {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

export function messagesOfThread(conversationId) {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY received_at ASC')
    .all(conversationId);
}

// ── hilos ─────────────────────────────────────────────────────────────────
export function rebuildThread(conversationId) {
  const msgs = messagesOfThread(conversationId);
  if (msgs.length === 0) {
    db.prepare('DELETE FROM threads WHERE conversation_id = ?').run(conversationId);
    return null;
  }
  const last = msgs[msgs.length - 1];
  const participants = [
    ...new Set(
      msgs.flatMap((m) => [
        m.from_email,
        ...JSON.parse(m.to_json || '[]').map((p) => p.email),
        ...JSON.parse(m.cc_json || '[]').map((p) => p.email),
      ])
    ),
  ].filter(Boolean);

  const hash = createHash('sha1')
    .update(msgs.map((m) => `${m.id}:${m.received_at}`).join('|'))
    .digest('hex');

  db.prepare(`
    INSERT INTO threads (
      conversation_id, subject, last_at, last_from_email, last_from_name,
      last_folder, msg_count, participants, content_hash, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      subject         = excluded.subject,
      last_at         = excluded.last_at,
      last_from_email = excluded.last_from_email,
      last_from_name  = excluded.last_from_name,
      last_folder     = excluded.last_folder,
      msg_count       = excluded.msg_count,
      participants    = excluded.participants,
      content_hash    = excluded.content_hash,
      updated_at      = excluded.updated_at
  `).run(
    conversationId,
    msgs.find((m) => m.subject)?.subject ?? '(sin asunto)',
    last.received_at,
    last.from_email,
    last.from_name,
    last.folder,
    msgs.length,
    JSON.stringify(participants),
    hash,
    new Date().toISOString()
  );

  return db.prepare('SELECT * FROM threads WHERE conversation_id = ?').get(conversationId);
}

export function threadsNeedingAnalysis(limit = 25) {
  return db
    .prepare(`
      SELECT * FROM threads
      WHERE analysis_json IS NULL
         OR analyzed_hash IS NULL
         OR analyzed_hash <> content_hash
      ORDER BY last_at DESC
      LIMIT ?
    `)
    .all(limit);
}

export function saveAnalysis(conversationId, analysis, hash) {
  db.prepare(`
    UPDATE threads
    SET analysis_json = ?, analyzed_at = ?, analyzed_hash = ?, analysis_error = NULL
    WHERE conversation_id = ?
  `).run(JSON.stringify(analysis), new Date().toISOString(), hash, conversationId);
}

export function saveAnalysisError(conversationId, message) {
  db.prepare('UPDATE threads SET analysis_error = ? WHERE conversation_id = ?').run(
    String(message).slice(0, 500),
    conversationId
  );
}

export function allThreads() {
  return db.prepare('SELECT * FROM threads ORDER BY last_at DESC').all();
}

export function getThread(conversationId) {
  return db.prepare('SELECT * FROM threads WHERE conversation_id = ?').get(conversationId);
}

export function setThreadStatus(conversationId, status, snoozedUntil = null) {
  db.prepare('UPDATE threads SET status = ?, snoozed_until = ? WHERE conversation_id = ?').run(
    status,
    snoozedUntil,
    conversationId
  );
}

export function setThreadPinned(conversationId, pinned) {
  db.prepare('UPDATE threads SET pinned = ? WHERE conversation_id = ?').run(pinned ? 1 : 0, conversationId);
}

// ── brief ─────────────────────────────────────────────────────────────────
export function getBrief(day) {
  const row = db.prepare('SELECT * FROM briefs WHERE day = ?').get(day);
  if (!row) return null;
  return { day: row.day, createdAt: row.created_at, ...JSON.parse(row.json) };
}

export function saveBrief(day, brief) {
  db.prepare(`
    INSERT INTO briefs (day, json, created_at) VALUES (?,?,?)
    ON CONFLICT(day) DO UPDATE SET json = excluded.json, created_at = excluded.created_at
  `).run(day, JSON.stringify(brief), new Date().toISOString());
}

// ── chat ──────────────────────────────────────────────────────────────────
export function pushChat(role, content, refs = []) {
  db.prepare('INSERT INTO chat (role, content, refs_json, created_at) VALUES (?,?,?,?)').run(
    role,
    content,
    JSON.stringify(refs),
    new Date().toISOString()
  );
}

export function recentChat(limit = 12) {
  return db
    .prepare('SELECT * FROM chat ORDER BY id DESC LIMIT ?')
    .all(limit)
    .reverse();
}

export function clearChat() {
  db.exec('DELETE FROM chat');
}
