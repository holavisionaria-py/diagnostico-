import { config } from './config.js';
import {
  upsertMessage,
  deleteMessage,
  rebuildThread,
  threadsNeedingAnalysis,
  saveAnalysis,
  saveAnalysisError,
  kv,
  db,
} from './db.js';
import { deltaSync } from './graph/mail.js';
import { analyzeThread } from './ai/triage.js';
import { demoMessages, demoAnalysisFor } from './demo-data.js';

let running = false;

export function syncState() {
  return {
    running,
    lastSync: kv.get('last_sync'),
    lastError: kv.get('last_sync_error'),
    pendingAnalysis: threadsNeedingAnalysis(200).length,
  };
}

/** Trae correos nuevos y reconstruye los hilos tocados. */
async function pullMail() {
  const touched = new Set();

  if (config.demo) {
    for (const m of demoMessages()) {
      upsertMessage(m);
      touched.add(m.conversationId);
    }
    return touched;
  }

  for (const folder of ['inbox', 'sent']) {
    const { changed, removed } = await deltaSync(folder);
    for (const m of changed) {
      upsertMessage(m);
      touched.add(m.conversationId);
    }
    for (const id of removed) {
      const row = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(id);
      if (row) touched.add(row.conversation_id);
      deleteMessage(id);
    }
  }

  return touched;
}

/** Analiza los hilos que cambiaron, de a poco para no saturar la API. */
async function analyzePending({ limit = 12, concurrency = 3 } = {}) {
  const pending = threadsNeedingAnalysis(limit);
  if (pending.length === 0) return 0;

  // Sin API key en modo demo, usamos el análisis precocinado.
  if (config.demo && !config.anthropic.hasKey) {
    let n = 0;
    for (const t of pending) {
      const canned = demoAnalysisFor(t.conversation_id);
      if (canned) {
        saveAnalysis(t.conversation_id, canned, t.content_hash);
        n += 1;
      }
    }
    return n;
  }

  let done = 0;
  const queue = [...pending];

  const worker = async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      try {
        const analysis = await analyzeThread(t.conversation_id, { subject: t.subject });
        if (analysis) {
          saveAnalysis(t.conversation_id, analysis, t.content_hash);
          done += 1;
        }
      } catch (err) {
        console.error(`[sync] no pude analizar ${t.conversation_id}:`, err.message);
        saveAnalysisError(t.conversation_id, err.message);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return done;
}

export async function runSync({ analyze = true } = {}) {
  if (running) return { skipped: true };
  running = true;
  const started = Date.now();

  try {
    const touched = await pullMail();
    for (const conversationId of touched) rebuildThread(conversationId);

    const analyzed = analyze ? await analyzePending() : 0;

    kv.set('last_sync', new Date().toISOString());
    kv.del('last_sync_error');

    const result = { threads: touched.size, analyzed, ms: Date.now() - started };
    console.log(`[sync] ${result.threads} hilos tocados, ${result.analyzed} analizados en ${result.ms}ms`);
    return result;
  } catch (err) {
    console.error('[sync] falló:', err.message);
    kv.set('last_sync_error', err.message);
    throw err;
  } finally {
    running = false;
  }
}

let timer = null;

export function startSyncLoop() {
  if (timer) return;
  const tick = () => {
    runSync().catch(() => {});
  };
  tick();
  timer = setInterval(tick, config.syncIntervalMs);
  console.log(`[sync] revisando el correo cada ${config.syncIntervalMs / 60_000} min`);
}

export function stopSyncLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Permite `npm run sync` para una corrida suelta.
if (process.argv.includes('--once')) {
  runSync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
