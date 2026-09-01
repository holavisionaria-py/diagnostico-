import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { claude, MODEL, systemBlocks, withRetry } from './client.js';
import { config } from '../config.js';
import { allThreads, saveBrief, getBrief } from '../db.js';
import { dayKey, longDate, clockIn, overlapWindow, humanAgo } from '../util/time.js';

const ItemSchema = z.object({
  conversation_id: z.string(),
  linea: z.string().describe('Una frase: quién, qué quiere y para cuándo'),
});

const BriefSchema = z.object({
  titular: z.string().describe('Una sola frase que resuma el día. Máximo 15 palabras'),
  animo: z.enum(['tranquilo', 'movido', 'complicado']),
  primero_esto: z.array(ItemSchema).describe('Lo que hay que tocar ya, ordenado. Máximo 4'),
  antes_de_que_cierre_la_sede: z.array(ItemSchema).describe('Lo que conviene mandar mientras Paraguay esté despierto'),
  puede_esperar: z.array(ItemSchema).describe('Lo que puede quedar para más tarde. Máximo 5'),
  estas_esperando: z.array(ItemSchema).describe('Hilos donde ella ya respondió y le deben respuesta hace rato'),
  se_te_puede_estar_pasando: z.array(ItemSchema).describe('Hilos viejos sin cerrar que nadie volvió a tocar'),
  guion_voz: z
    .string()
    .describe(
      'El brief hablado, para leer en voz alta. 90 a 140 palabras. Arranca saludándola por su nombre y diciendo la hora de ella y la de Paraguay. Después lo urgente. Termina con una sola recomendación de por dónde empezar. Nada de listas ni viñetas: texto corrido, como si se lo contaras tomando un café.'
    ),
});

/** Resumen compacto de cada hilo para que el brief no tenga que leer los correos crudos. */
function threadDigest(t, now) {
  const a = t.analysis_json ? JSON.parse(t.analysis_json) : null;
  if (!a) return null;
  return [
    `[${t.conversation_id}]`,
    `${a.titulo} — ${a.quien}`,
    `estado: ${t.status}${t.pinned ? ', fijado por ella' : ''}`,
    `categoría: ${a.categoria} | urgencia: ${a.urgencia} (${a.motivo_urgencia})`,
    `último movimiento: ${humanAgo(t.last_at, now)}${t.last_folder === 'sent' ? ' (lo último lo mandó ella)' : ''}`,
    `le toca a ella: ${a.bola_en_su_cancha ? 'sí' : 'no'}`,
    a.fecha_limite ? `fecha límite: ${a.fecha_limite}` : null,
    a.te_piden.length ? `piden: ${a.te_piden.join(' / ')}` : null,
    a.preguntas_abiertas.length ? `sin responder: ${a.preguntas_abiertas.join(' / ')}` : null,
    a.riesgo_si_no_responde ? `riesgo: ${a.riesgo_si_no_responde}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * En modo demo sin API key armamos el brief con reglas simples, para que el
 * panel se pueda ver completo sin gastar un token. No reemplaza al de Claude.
 */
function briefDeReglas(threads, ventana, now) {
  const usados = new Set();
  const tomar = (lista, max) =>
    lista
      .filter((x) => !usados.has(x.t.conversation_id))
      .slice(0, max)
      .map((x) => {
        usados.add(x.t.conversation_id);
        return { conversation_id: x.t.conversation_id, linea: x.a.una_linea_para_voz || x.a.resumen };
      });

  const abiertos = threads.map((t) => ({ t, a: JSON.parse(t.analysis_json) }));
  const meToca = abiertos.filter((x) => x.a.bola_en_su_cancha);

  const urgentes = meToca.filter((x) => x.a.urgencia === 'alta');
  const paraLaSede = meToca.filter((x) => x.a.urgencia !== 'alta' && x.a.categoria === 'interno');
  const resto = meToca.filter((x) => x.a.urgencia !== 'alta' && x.a.categoria !== 'interno');
  const esperando = abiertos.filter((x) => !x.a.bola_en_su_cancha);
  const viejos = abiertos.filter((x) => now - new Date(x.t.last_at) > 7 * 86_400_000);

  // El orden importa: cada hilo cae en la sección más urgente que lo reclame.
  const primero_esto = tomar(urgentes, 4);
  const antes_de_que_cierre_la_sede = tomar(paraLaSede, 4);
  const puede_esperar = tomar(resto, 5);
  const estas_esperando = tomar(esperando, 5);
  const se_te_puede_estar_pasando = tomar(viejos, 3);

  const nombre = config.her.name ? `, ${config.her.name.split(' ')[0]}` : '';
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const guion =
    `Buen día${nombre}. Son las ${ventana.her.hora} acá y las ${ventana.hq.hora} en Paraguay. ` +
    (urgentes.length
      ? `Tenés ${plural(urgentes.length, 'cosa urgente', 'cosas urgentes')} esperándote. ` +
        urgentes.slice(0, 3).map((x) => x.a.una_linea_para_voz).join(' ') +
        ' '
      : 'No hay nada urgente esperándote. ') +
    (estas_esperando.length
      ? `Además hay ${plural(estas_esperando.length, 'hilo donde te deben', 'hilos donde te deben')} respuesta a vos. `
      : '') +
    (urgentes[0]
      ? `Si arrancás por algo, que sea esto: ${urgentes[0].a.titulo.toLowerCase()}.`
      : 'Aprovechá para adelantar lo que venías postergando.');

  const pendientes = antes_de_que_cierre_la_sede.length + puede_esperar.length;

  return {
    titular: urgentes.length
      ? `${plural(urgentes.length, 'tema urgente', 'temas urgentes')} y ${plural(pendientes, 'pendiente más', 'pendientes más')}`
      : pendientes
      ? `Nada urgente, ${plural(pendientes, 'tema abierto', 'temas abiertos')}`
      : 'Nada urgente hoy',
    animo: urgentes.length >= 3 ? 'complicado' : urgentes.length ? 'movido' : 'tranquilo',
    primero_esto,
    antes_de_que_cierre_la_sede,
    puede_esperar,
    estas_esperando,
    se_te_puede_estar_pasando,
    guion_voz: guion,
  };
}

export async function generateBrief({ force = false } = {}) {
  const now = new Date();
  const day = dayKey(now);

  if (!force) {
    const cached = getBrief(day);
    // Un brief se considera fresco por 3 horas.
    if (cached && now - new Date(cached.createdAt) < 3 * 3_600_000) return cached;
  }

  const threads = allThreads()
    .filter((t) => t.analysis_json && t.status !== 'hecho')
    .filter((t) => !t.snoozed_until || new Date(t.snoozed_until) <= now)
    .slice(0, 60);

  const ventana = overlapWindow(now);

  if (threads.length === 0) {
    const vacio = {
      titular: 'Bandeja limpia, no hay nada esperándote.',
      animo: 'tranquilo',
      primero_esto: [],
      antes_de_que_cierre_la_sede: [],
      puede_esperar: [],
      estas_esperando: [],
      se_te_puede_estar_pasando: [],
      guion_voz: `Buen día${config.her.name ? `, ${config.her.name}` : ''}. Son las ${ventana.her.hora} acá y las ${ventana.hq.hora} en Paraguay. No hay nada pendiente en el correo. Disfrutá el rato libre.`,
    };
    saveBrief(day, vacio);
    return getBrief(day);
  }

  if (config.demo && !config.anthropic.hasKey) {
    saveBrief(day, briefDeReglas(threads, ventana, now));
    return getBrief(day);
  }

  const digests = threads.map((t) => threadDigest(t, now)).filter(Boolean).join('\n\n');

  const contexto = `Momento: ${longDate(config.tz.her, now)}.
Hora de ella (${config.tz.her}): ${clockIn(config.tz.her, now)}.
Hora de la sede en Paraguay (${config.tz.hq}): ${clockIn(config.tz.hq, now)}.
Estado de la ventana de solape: ${ventana.estado}${
    ventana.horasParaSede != null ? ` (faltan ~${ventana.horasParaSede} h para que abra Paraguay)` : ''
  }.`;

  const prompt = `${contexto}

Estos son los hilos abiertos de su correo, ya analizados:

${digests}

Armá el brief del día. Reglas:
- Usá SIEMPRE el conversation_id exacto entre corchetes al referenciar un hilo.
- Un mismo hilo va en una sola sección. Si dudás, va en la más urgente.
- "antes_de_que_cierre_la_sede" es para lo que necesita ida y vuelta con Paraguay:
  si la sede ya está dormida, poné ahí lo que conviene dejar escrito para que lo lean al abrir.
- No inventes hilos que no estén en la lista.
- Si algo lleva más de 5 días sin respuesta de la otra parte, va en "estas_esperando".
- El guion de voz es lo más importante: tiene que sonar humano y decirle qué hacer primero.`;

  const response = await withRetry(
    () =>
      claude().messages.parse({
        model: MODEL,
        max_tokens: 12000,
        system: systemBlocks(),
        output_config: { format: zodOutputFormat(BriefSchema), effort: 'high' },
        messages: [{ role: 'user', content: prompt }],
      }),
    { label: 'brief' }
  );

  if (!response.parsed_output) throw new Error('El brief no volvió en el formato esperado');

  saveBrief(day, response.parsed_output);
  return getBrief(day);
}

export { BriefSchema };
