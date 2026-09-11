/**
 * Cuenta de correo activa, conectada por la propia usuaria desde la app.
 *
 * La idea: que Valeria ponga su correo y su clave ella misma, sin que nadie
 * más las escriba ni las vea. La clave se guarda CIFRADA en la base (AES-256-GCM,
 * con una llave derivada del secreto del servidor), nunca en texto plano y
 * nunca se devuelve al navegador.
 *
 * Si no hay cuenta conectada por la app, caemos a lo que haya en el .env
 * (IMAP_USER / IMAP_PASSWORD), útil para pruebas.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { kv } from '../db.js';

const CLAVE_KV = 'cuenta_correo';

// Preajustes por proveedor: host/puerto/carpeta de enviados.
const PRESETS = {
  gmail: { host: 'imap.gmail.com', port: 993, sent: '[Gmail]/Sent Mail' },
  outlook: { host: 'outlook.office365.com', port: 993, sent: 'Sent' },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993, sent: 'Sent' },
};

/** Adivina el proveedor por el dominio del correo, o usa el que se indique. */
export function detectarProveedor(email = '', proveedor = '') {
  const dominio = email.split('@')[1]?.toLowerCase() || '';
  const p =
    (proveedor || '').toLowerCase() ||
    (/(gmail|googlemail)\.com$/.test(dominio)
      ? 'gmail'
      : /(outlook|hotmail|live|msn)\./.test(dominio)
      ? 'outlook'
      : /(yahoo)\./.test(dominio)
      ? 'yahoo'
      : '');
  return { proveedor: p, ...(PRESETS[p] || {}) };
}

// ── Cifrado ────────────────────────────────────────────────────────────────
function llave(salt) {
  return crypto.scryptSync(config.sessionSecret || 'dev-secret', salt, 32);
}

function cifrar(texto) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', llave(salt), iv);
  const data = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  };
}

function descifrar(enc) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    llave(Buffer.from(enc.salt, 'base64')),
    Buffer.from(enc.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]).toString('utf8');
}

// ── Cuenta activa ────────────────────────────────────────────────────────────
/** Lee la cuenta guardada por la app (con la clave descifrada), o null. */
function cuentaGuardada() {
  const raw = kv.get(CLAVE_KV);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return {
      user: o.user,
      pass: descifrar(o.pass),
      host: o.host,
      port: o.port,
      carpetaEnviados: o.carpetaEnviados || 'Sent',
      proveedor: o.proveedor || '',
      origen: 'app',
    };
  } catch (err) {
    console.error('[cuenta] no pude leer la cuenta guardada:', err.message);
    return null;
  }
}

/**
 * La cuenta IMAP que hay que usar ahora mismo: primero la que conectó la
 * usuaria desde la app; si no hay, la del .env. `configured` dice si sirve.
 */
export function cuentaActiva() {
  const app = cuentaGuardada();
  if (app && app.user && app.pass && app.host) return { ...app, configured: true };
  const env = config.imap;
  if (env.configured) {
    return {
      user: env.user,
      pass: env.pass,
      host: env.host,
      port: env.port,
      carpetaEnviados: env.carpetaEnviados,
      proveedor: env.proveedor,
      origen: 'env',
      configured: true,
    };
  }
  return { configured: false, origen: null };
}

/** Qué fuente de correo está activa: imap (app o .env), graph o ninguna. */
export function proveedorActivo() {
  if (cuentaActiva().configured) return 'imap';
  if (config.ms.configured) return 'graph';
  return null;
}

/** Datos públicos de la cuenta (sin la clave), para mostrar en la app. */
export function cuentaPublica() {
  const c = cuentaActiva();
  if (!c.configured) return { conectado: false };
  return { conectado: true, email: c.user, proveedor: c.proveedor || '', origen: c.origen };
}

/**
 * Arma la config IMAP para un correo/clave dados (para probar antes de guardar).
 * Devuelve null si no se puede deducir el host.
 */
export function armarCreds({ email, pass, proveedor = '', host = '', port, carpetaEnviados = '' }) {
  const det = detectarProveedor(email, proveedor);
  const h = host || det.host;
  if (!email || !pass || !h) return null;
  return {
    user: email.trim(),
    pass,
    host: h,
    port: Number(port) || det.port || 993,
    carpetaEnviados: carpetaEnviados || det.sent || 'Sent',
    proveedor: det.proveedor || proveedor || '',
    configured: true,
  };
}

/** Guarda la cuenta (clave cifrada). Recibe unas creds ya armadas y probadas. */
export function guardarCuenta(creds) {
  const registro = {
    user: creds.user,
    host: creds.host,
    port: creds.port,
    carpetaEnviados: creds.carpetaEnviados,
    proveedor: creds.proveedor,
    pass: cifrar(creds.pass),
    guardadoEn: new Date().toISOString(),
  };
  kv.set(CLAVE_KV, JSON.stringify(registro));
}

/** Desconecta: borra la cuenta guardada por la app. */
export function borrarCuenta() {
  kv.del(CLAVE_KV);
}
