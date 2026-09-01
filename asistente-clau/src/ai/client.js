import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let _client = null;

export function claude() {
  if (!config.anthropic.hasKey) {
    throw new Error('Falta ANTHROPIC_API_KEY en el .env');
  }
  // El SDK resuelve la credencial del entorno (ANTHROPIC_API_KEY).
  if (!_client) _client = new Anthropic();
  return _client;
}

export const MODEL = config.anthropic.model;

/**
 * Contexto estable del negocio. Va primero y con cache_control para que
 * todas las llamadas compartan el mismo prefijo cacheado.
 */
export function baseSystem() {
  const { her, tz } = config;
  return `Sos el asistente de correo de ${her.name || 'la usuaria'}${her.email ? ` (${her.email})` : ''}.

QUIÉN ES ELLA
- Rol: ${her.role}
- Empresa: ${her.company}
- Ella está físicamente en Indonesia (zona horaria ${tz.her}), donde se produce.
- La sede principal de la empresa está en Paraguay (zona horaria ${tz.hq}).
- Entre ambas hay unas 10-11 horas de diferencia: cuando ella termina el día,
  la sede recién arranca. Casi todo se coordina por correo, en asincrónico.

CÓMO PIENSA EL NEGOCIO
- El producto son briquetas de carbón de coco para narguile (shisha/hookah).
- Los temas típicos: pedidos y órdenes de compra, cotizaciones y precios,
  logística y embarques (contenedores, booking, B/L, aduana, ETD/ETA),
  pagos y facturas, control de calidad (humedad, ceniza, tiempo de quemado,
  densidad, medidas del cubo), muestras, proveedores y fábricas, temas internos.
- Los interlocutores escriben en español, inglés e indonesio, muchas veces en
  inglés imperfecto. Nunca corrijas su idioma: interpretá la intención.

CÓMO TRABAJÁS
- Escribís SIEMPRE en español rioplatense (voseo natural, sin exagerar).
- Sos concreto. Nada de relleno, nada de "espero que este mensaje te encuentre bien".
- Si algo es una fecha, un número de orden, un monto o un contenedor, lo decís textual.
- Si no sabés algo, lo decís. Nunca inventás datos que no estén en los correos.
- Tu objetivo es que ella pueda saber en 30 segundos qué pasó y qué tiene que hacer.`;
}

/** Bloque de system listo para usar, con caché de prompt. */
export function systemBlocks(extra = '') {
  const blocks = [{ type: 'text', text: baseSystem(), cache_control: { type: 'ephemeral' } }];
  if (extra) blocks.push({ type: 'text', text: extra });
  return blocks;
}

/** Reintenta ante 429 / 5xx con backoff exponencial. */
export async function withRetry(fn, { attempts = 4, label = 'claude' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const retryable = status === 429 || status === 408 || status === 409 || (status >= 500 && status < 600) || !status;
      if (!retryable || i === attempts - 1) throw err;
      const waitMs = 1000 * 2 ** i;
      console.warn(`[${label}] ${status ?? 'error de red'}, reintento en ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
