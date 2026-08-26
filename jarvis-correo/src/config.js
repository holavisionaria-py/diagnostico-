const bool = (v) => v === '1' || v === 'true' || v === 'yes';
const int = (v, def) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : def);

export const config = {
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  demo: bool(process.env.DEMO),

  appPassword: process.env.APP_PASSWORD || 'cambiame',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-cambiame',

  anthropic: {
    // Ver claude-api: usar siempre el id exacto, sin sufijo de fecha.
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
  },

  ms: {
    clientId: process.env.MS_CLIENT_ID || '',
    clientSecret: process.env.MS_CLIENT_SECRET || '',
    tenantId: process.env.MS_TENANT_ID || 'common',
    redirectUri: process.env.MS_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    scopes: ['Mail.Read', 'Mail.ReadWrite', 'Mail.Send', 'User.Read', 'offline_access'],
    get configured() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  her: {
    name: process.env.HER_NAME || '',
    email: (process.env.HER_EMAIL || '').toLowerCase(),
    role: process.env.HER_ROLE || 'Ejecutiva de operaciones y comercio exterior',
    company: process.env.COMPANY || 'Empresa de briquetas de coco para narguile',
  },

  tz: {
    her: process.env.TZ_HER || 'Asia/Jakarta',
    hq: process.env.TZ_HQ || 'America/Asuncion',
  },

  syncIntervalMs: int(process.env.SYNC_INTERVAL_MIN, 10) * 60_000,

  dbPath: process.env.DB_PATH || new URL('../data/jarvis.db', import.meta.url).pathname,
};
