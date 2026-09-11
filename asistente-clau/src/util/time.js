import { config } from '../config.js';

// Una zona horaria mal escrita en el .env (por ej. "Asia/luwuk" en vez de
// "Asia/Makassar") no debe tumbar toda la app: la validamos una vez y, si es
// inválida, caemos a una por defecto y lo dejamos anotado en el log.
const TZ_POR_DEFECTO = 'UTC';
const tzAvisadas = new Set();
const tzValida = new Map();

function zonaSegura(tz) {
  if (!tz) return TZ_POR_DEFECTO;
  if (tzValida.has(tz)) return tzValida.get(tz);
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    tzValida.set(tz, tz);
    return tz;
  } catch {
    if (!tzAvisadas.has(tz)) {
      tzAvisadas.add(tz);
      console.warn(`[time] zona horaria inválida "${tz}"; uso "${TZ_POR_DEFECTO}". Corregí el .env (nombre IANA, ej. Asia/Makassar).`);
    }
    tzValida.set(tz, TZ_POR_DEFECTO);
    return TZ_POR_DEFECTO;
  }
}

const fmt = (tz, opts) => new Intl.DateTimeFormat('es-AR', { timeZone: zonaSegura(tz), ...opts });

export function dayKey(date = new Date(), tz = config.tz.her) {
  // en-CA da YYYY-MM-DD, que es lo que queremos como clave
  return new Intl.DateTimeFormat('en-CA', { timeZone: zonaSegura(tz) }).format(date);
}

export function hourIn(tz, date = new Date()) {
  return Number(fmt(tz, { hour: '2-digit', hour12: false }).format(date));
}

export function clockIn(tz, date = new Date()) {
  return fmt(tz, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function longDate(tz, date = new Date()) {
  return fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/**
 * La ventana en que las dos oficinas están despiertas al mismo tiempo.
 * Yakarta UTC+7, Asunción UTC-3/-4: el solape real es la mañana temprano de ella.
 */
export function overlapWindow(date = new Date()) {
  const her = hourIn(config.tz.her, date);
  const hq = hourIn(config.tz.hq, date);
  const hqLaboral = hq >= 8 && hq < 18;
  const herLaboral = her >= 6 && her < 22;

  let estado;
  if (hqLaboral && herLaboral) estado = 'abierta';
  else if (hqLaboral) estado = 'sede-despierta';
  else if (herLaboral) estado = 'sede-dormida';
  else estado = 'todos-durmiendo';

  // Cuántas horas faltan para que la sede abra (08:00 hora Paraguay)
  let horasParaSede = null;
  if (!hqLaboral) horasParaSede = hq < 8 ? 8 - hq : 24 - hq + 8;

  return {
    estado,
    horasParaSede,
    her: { tz: config.tz.her, hora: clockIn(config.tz.her, date), h: her },
    hq: { tz: config.tz.hq, hora: clockIn(config.tz.hq, date), h: hq },
  };
}

export function humanAgo(iso, now = new Date()) {
  if (!iso) return '';
  const diff = now - new Date(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  const mes = Math.round(d / 30);
  return `hace ${mes} ${mes === 1 ? 'mes' : 'meses'}`;
}
