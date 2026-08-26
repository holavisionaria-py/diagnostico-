import { z } from 'zod';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { claude, MODEL, systemBlocks, withRetry } from './client.js';
import { config } from '../config.js';
import { allThreads, messagesOfThread, recentChat, pushChat } from '../db.js';
import { clockIn, humanAgo, longDate } from '../util/time.js';

/** Índice liviano de todos los hilos: alcanza para el 80% de las preguntas. */
function buildIndex(now) {
  return allThreads()
    .slice(0, 80)
    .map((t) => {
      const a = t.analysis_json ? JSON.parse(t.analysis_json) : null;
      const cabeza = a
        ? `${a.titulo} — ${a.quien} — ${a.categoria}/${a.urgencia}`
        : t.subject;
      return `[${t.conversation_id}] ${cabeza} | último: ${humanAgo(t.last_at, now)} | ${
        a?.bola_en_su_cancha ? 'le toca a ella' : 'no le toca a ella'
      } | estado: ${t.status}${a?.resumen ? `\n   ${a.resumen}` : ''}`;
    })
    .join('\n');
}

const leerHilo = betaZodTool({
  name: 'leer_hilo',
  description:
    'Devuelve los mensajes completos de un hilo de correo. Usalo cuando necesites la cita textual, ' +
    'un número exacto, o el detalle de lo que alguien escribió. El id sale del índice, entre corchetes.',
  inputSchema: z.object({
    conversation_id: z.string().describe('El id del hilo, tal cual aparece entre corchetes en el índice'),
  }),
  run: async ({ conversation_id }) => {
    const rows = messagesOfThread(conversation_id);
    if (rows.length === 0) return 'No existe ningún hilo con ese id.';
    const yo = config.her.email;
    return rows
      .slice(-10)
      .map((m) => {
        const quien = m.from_email === yo ? 'ELLA' : `${m.from_name || m.from_email} <${m.from_email}>`;
        return `--- ${m.received_at} — de ${quien} ---\n${(m.body || m.preview || '').slice(0, 5000)}`;
      })
      .join('\n\n');
  },
});

const buscar = betaZodTool({
  name: 'buscar_en_correos',
  description:
    'Busca un texto literal (nombre, número de orden, contenedor, palabra clave) dentro de todos los ' +
    'correos guardados. Devuelve los fragmentos donde aparece, con el id del hilo.',
  inputSchema: z.object({
    texto: z.string().describe('El texto a buscar. Una sola palabra o frase corta funciona mejor'),
  }),
  run: async ({ texto }) => {
    const needle = texto.toLowerCase();
    const hits = [];
    for (const t of allThreads()) {
      for (const m of messagesOfThread(t.conversation_id)) {
        const body = (m.body || m.preview || '').toLowerCase();
        const idx = body.indexOf(needle);
        if (idx === -1) continue;
        hits.push(
          `[${t.conversation_id}] ${m.received_at} — ${m.from_name || m.from_email}\n` +
            `  ...${(m.body || m.preview).slice(Math.max(0, idx - 160), idx + 240).replace(/\s+/g, ' ')}...`
        );
        if (hits.length >= 12) break;
      }
      if (hits.length >= 12) break;
    }
    return hits.length ? hits.join('\n\n') : `No encontré "${texto}" en ningún correo guardado.`;
  },
});

/**
 * Responde una pregunta hablada o escrita sobre su correo.
 * Mantiene el hilo de la conversación para poder preguntar "¿y qué le contesto?".
 */
export async function ask(question, { voice = false } = {}) {
  const now = new Date();

  const historial = recentChat(10).map((c) => ({
    role: c.role === 'user' ? 'user' : 'assistant',
    content: c.content,
  }));

  const instrucciones = `Hoy es ${longDate(config.tz.her, now)}. Son las ${clockIn(config.tz.her, now)} donde está ella y las ${clockIn(config.tz.hq, now)} en Paraguay.

Este es el índice de sus hilos de correo. Es un resumen: si la pregunta necesita el detalle exacto, usá las herramientas antes de responder.

${buildIndex(now)}

CÓMO RESPONDER
- Andá al grano. Primero la respuesta, después el contexto si hace falta.
${voice ? '- Te van a leer en voz alta: escribí como se habla, sin viñetas, sin markdown, sin emojis. Máximo 70 palabras.' : '- Podés usar viñetas cortas si ayudan. Nada de markdown pesado.'}
- Cuando menciones un hilo, cerrá la frase con su id entre corchetes, así: [AAQkAD...]. Eso le permite abrirlo de un toque.
- Si la respuesta no está en los correos, decilo. No supongas.
- Si te pide redactar algo, escribilo en el idioma de la otra persona.`;

  const final = await withRetry(
    () =>
      claude().beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 8000,
        system: systemBlocks(instrucciones),
        tools: [leerHilo, buscar],
        messages: [...historial, { role: 'user', content: question }],
        output_config: { effort: 'high' },
      }),
    { label: 'ask' }
  );

  const texto = final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const refs = [...new Set([...texto.matchAll(/\[([A-Za-z0-9_+/=\-]{8,})\]/g)].map((m) => m[1]))];

  pushChat('user', question);
  pushChat('assistant', texto, refs);

  return { texto, refs };
}
