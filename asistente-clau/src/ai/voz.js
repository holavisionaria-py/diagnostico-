/**
 * Voz en la nube con ElevenLabs.
 *
 * La clave nunca sale del servidor: el navegador le pide el audio a esta app,
 * y esta app se lo pide a ElevenLabs. Todo lo sintetizado queda cacheado en
 * disco, así volver a escuchar el mismo resumen no cuesta un centavo más.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { config } from '../config.js';
import { kv } from '../db.js';

const API = 'https://api.elevenlabs.io/v1';
const CACHE_DIR = join(dirname(config.dbPath), 'voz');
const MAX_CARACTERES = 5000;

mkdirSync(CACHE_DIR, { recursive: true });

export function vozDisponible() {
  return Boolean(config.eleven.apiKey);
}

/** La voz elegida desde Ajustes gana sobre la del .env. */
export function vozActual() {
  return kv.get('eleven_voice_id') || config.eleven.voiceId;
}

export function elegirVoz(voiceId) {
  kv.set('eleven_voice_id', voiceId);
}

async function eleven(ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: { 'xi-api-key': config.eleven.apiKey, ...opciones.headers },
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('La clave de ElevenLabs no es válida.');
    if (res.status === 429) throw new Error('ElevenLabs dice que te quedaste sin créditos o hay demasiadas peticiones.');
    throw new Error(`ElevenLabs ${res.status}: ${detalle.slice(0, 300)}`);
  }
  return res;
}

export async function listarVoces() {
  const res = await eleven('/voices');
  const { voices = [] } = await res.json();
  const elegida = vozActual();
  return voices
    .map((v) => ({
      id: v.voice_id,
      nombre: v.name,
      idioma: v.labels?.language || v.labels?.accent || '',
      descripcion: [v.labels?.gender, v.labels?.age, v.labels?.description].filter(Boolean).join(' · '),
      muestra: v.preview_url || '',
      elegida: v.voice_id === elegida,
    }))
    .sort((a, b) => Number(b.elegida) - Number(a.elegida) || a.nombre.localeCompare(b.nombre));
}

const clave = (texto, voiceId) =>
  createHash('sha1').update(`${voiceId}|${config.eleven.modelId}|${texto}`).digest('hex');

/**
 * Devuelve el mp3 del texto. Si ya se sintetizó antes, sale del disco.
 * @returns {Promise<{audio: Buffer, cacheado: boolean}>}
 */
export async function sintetizar(texto) {
  if (!vozDisponible()) throw new Error('No hay clave de ElevenLabs configurada.');

  const limpio = String(texto || '').trim().slice(0, MAX_CARACTERES);
  if (!limpio) throw new Error('No hay texto para leer.');

  const voiceId = vozActual();
  if (!voiceId) throw new Error('Falta elegir una voz. Entrá a Ajustes → Voz.');

  const archivo = join(CACHE_DIR, `${clave(limpio, voiceId)}.mp3`);
  if (existsSync(archivo)) return { audio: readFileSync(archivo), cacheado: true };

  const res = await eleven(
    `/text-to-speech/${voiceId}?output_format=${config.eleven.formato}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: limpio,
        model_id: config.eleven.modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    }
  );

  const audio = Buffer.from(await res.arrayBuffer());
  writeFileSync(archivo, audio);
  limpiarCache();

  console.log(`[voz] sintetizados ${limpio.length} caracteres (~USD ${(limpio.length / 1000 * 0.10).toFixed(3)})`);
  return { audio, cacheado: false };
}

/** El cache no crece para siempre: borramos lo más viejo pasados 60 archivos. */
function limpiarCache(max = 60) {
  try {
    const archivos = readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => ({ f, t: statSync(join(CACHE_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of archivos.slice(max)) unlinkSync(join(CACHE_DIR, f));
  } catch (err) {
    console.warn('[voz] no pude limpiar el cache:', err.message);
  }
}
