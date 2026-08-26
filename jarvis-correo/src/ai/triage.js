import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { claude, MODEL, systemBlocks, withRetry } from './client.js';
import { config } from '../config.js';
import { messagesOfThread } from '../db.js';

export const CATEGORIAS = [
  'pedido',
  'cotizacion',
  'logistica',
  'pago',
  'calidad',
  'muestra',
  'proveedor',
  'interno',
  'otro',
];

const AnalisisSchema = z.object({
  titulo: z.string().describe('De qué va el hilo, 4 a 8 palabras, en español'),
  quien: z.string().describe('Nombre de quien escribió último y de qué lado está (sede, cliente, fábrica, naviera...)'),
  resumen: z.string().describe('2 o 3 frases: qué pasó en este hilo y en qué punto está'),
  lo_que_dijeron: z.array(z.string()).describe('Los hechos concretos que dijeron, uno por línea, en español'),
  te_piden: z.array(z.string()).describe('Acciones concretas que esperan de ella. Vacío si no piden nada'),
  preguntas_abiertas: z.array(z.string()).describe('Preguntas que le hicieron y todavía no respondió'),
  datos_clave: z
    .array(z.object({ etiqueta: z.string(), valor: z.string() }))
    .describe('Números de orden, contenedor, montos, fechas, cantidades, incoterms. Textual, sin inventar'),
  categoria: z.enum(CATEGORIAS),
  urgencia: z.enum(['alta', 'media', 'baja']),
  motivo_urgencia: z.string().describe('Una frase: por qué esa urgencia'),
  fecha_limite: z.string().describe('Fecha límite en formato YYYY-MM-DD si el correo la menciona o implica; si no, cadena vacía'),
  bola_en_su_cancha: z.boolean().describe('true si el próximo movimiento le toca a ella'),
  riesgo_si_no_responde: z.string().describe('Qué se rompe si deja pasar esto. Cadena vacía si no pasa nada'),
  sentimiento: z.enum(['tranquilo', 'apurado', 'molesto', 'contento']),
  respuesta_sugerida: z.string().describe('Borrador breve de respuesta, en el idioma en que le escribieron'),
  una_linea_para_voz: z.string().describe('Cómo se lo contarías en voz alta en una sola frase corta'),
});

/** Recorta el hilo para no mandar 40 correos con firmas repetidas. */
function renderThread(rows) {
  const yo = config.her.email;
  const MAX = 12;
  const shown = rows.length > MAX ? [rows[0], ...rows.slice(-(MAX - 1))] : rows;
  const omitidos = rows.length - shown.length;

  const parts = shown.map((m, i) => {
    const quien = m.from_email === yo ? `ELLA (${m.from_name || 'yo'})` : `${m.from_name || m.from_email} <${m.from_email}>`;
    const para = JSON.parse(m.to_json || '[]').map((p) => p.name || p.email).join(', ');
    const cuerpo = (m.body || m.preview || '').slice(0, 4000);
    return [
      `--- Mensaje ${i + 1} de ${shown.length} ---`,
      `De: ${quien}`,
      para ? `Para: ${para}` : '',
      `Fecha: ${m.received_at}`,
      m.has_attachments ? 'Tiene adjuntos: sí' : '',
      '',
      cuerpo,
    ]
      .filter(Boolean)
      .join('\n');
  });

  if (omitidos > 0) parts.splice(1, 0, `--- (se omitieron ${omitidos} mensajes del medio) ---`);
  return parts.join('\n\n');
}

/**
 * Analiza un hilo completo y devuelve la ficha estructurada.
 * Es la operación que se repite más veces, así que corre a esfuerzo medio.
 */
export async function analyzeThread(conversationId, { subject } = {}) {
  const rows = messagesOfThread(conversationId);
  if (rows.length === 0) return null;

  const ahora = new Date().toISOString();
  const prompt = `Hoy es ${ahora} (UTC).

Analizá este hilo de correo y devolvé la ficha. Reglas:
- "bola_en_su_cancha" es true si el último mensaje NO lo mandó ella y quedó algo pendiente de su lado.
- Urgencia alta: hay plata, un embarque, una aduana o un cliente enojado esperando, o vence en menos de 48 horas.
- Urgencia media: hay que responder esta semana pero nada se rompe hoy.
- Urgencia baja: informativo, o ya está resuelto.
- En "datos_clave" copiá los números tal cual aparecen. Si no hay, dejá la lista vacía.
- "respuesta_sugerida" tiene que sonar a ella: directa, cordial, sin floreos. Si no corresponde responder, dejala vacía.

ASUNTO: ${subject || rows[0].subject}

${renderThread(rows)}`;

  const response = await withRetry(
    () =>
      claude().messages.parse({
        model: MODEL,
        max_tokens: 8000,
        system: systemBlocks(),
        output_config: {
          format: zodOutputFormat(AnalisisSchema),
          effort: process.env.TRIAGE_EFFORT || 'medium',
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    { label: 'triage' }
  );

  if (response.stop_reason === 'refusal') {
    throw new Error(`El modelo declinó analizar el hilo (${response.stop_details?.category ?? 'sin categoría'})`);
  }
  if (!response.parsed_output) {
    throw new Error('El análisis no volvió en el formato esperado');
  }

  return response.parsed_output;
}

export { AnalisisSchema };
