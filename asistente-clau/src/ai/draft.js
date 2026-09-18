import { claude, MODEL, systemBlocks, withRetry } from './client.js';
import { config } from '../config.js';
import { messagesOfThread, getThread } from '../db.js';

/**
 * Redacta una respuesta para un hilo. No la manda: devuelve el texto para que
 * ella lo revise, y opcionalmente se guarda como borrador en Outlook.
 */
export async function draftReply(conversationId, instruccion = '') {
  const thread = getThread(conversationId);
  if (!thread) throw new Error('No encontré ese hilo');

  const rows = messagesOfThread(conversationId);
  if (rows.length === 0) throw new Error('El hilo no tiene mensajes');

  const yo = config.her.email;
  const analisis = thread.analysis_json ? JSON.parse(thread.analysis_json) : null;

  const conversacion = rows
    .slice(-8)
    .map((m) => {
      const quien = m.from_email === yo ? 'ELLA' : `${m.from_name || m.from_email}`;
      return `--- ${m.received_at} — de ${quien} ---\n${(m.body || m.preview || '').slice(0, 4000)}`;
    })
    .join('\n\n');

  const ultimoDeEllos = [...rows].reverse().find((m) => m.from_email !== yo);
  const suyos = rows.filter((m) => m.from_email === yo).slice(-3);

  const prompt = `Escribí la respuesta que ella tiene que mandar en este hilo.

${analisis ? `Contexto ya analizado: ${analisis.resumen}\nLe piden: ${analisis.te_piden.join(' / ') || 'nada explícito'}\n` : ''}
CONVERSACIÓN
${conversacion}

${
  suyos.length
    ? `CÓMO ESCRIBE ELLA (imitá este tono, este largo y estas fórmulas de cortesía):\n${suyos
        .map((m) => (m.body || '').slice(0, 900))
        .join('\n---\n')}`
    : 'No hay mensajes previos de ella en este hilo: escribí cordial y directo.'
}

${instruccion ? `LO QUE ELLA TE PIDE QUE DIGAS:\n${instruccion}` : 'No te dio instrucciones: respondé lo que corresponda según el hilo.'}

REGLAS
- Escribí en el idioma del último mensaje de la otra parte${
    ultimoDeEllos ? '' : ' (o en inglés si no hay ninguno)'
  }.
- Sin asunto, sin "Estimado/a" si ella no lo usa, sin firma: el correo ya lleva su firma.
- Si falta un dato para responder bien, dejalo marcado entre corchetes en MAYÚSCULAS, tipo [CONFIRMAR FECHA DE EMBARQUE]. Nunca inventes números.
- Devolvé solamente el cuerpo del correo. Nada de explicaciones tuyas ni comillas alrededor.`;

  const response = await withRetry(
    () =>
      claude().messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: systemBlocks(),
        output_config: { effort: 'high' },
        messages: [{ role: 'user', content: prompt }],
      }),
    { label: 'draft' }
  );

  if (response.stop_reason === 'refusal') {
    throw new Error('El modelo declinó redactar esta respuesta');
  }

  const texto = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return { texto, replyToMessageId: (ultimoDeEllos ?? rows[rows.length - 1]).id };
}
