import { ConfidentialClientApplication, LogLevel } from '@azure/msal-node';
import { config } from '../config.js';
import { kv } from '../db.js';

const CACHE_KEY = 'msal_token_cache';
const ACCOUNT_KEY = 'msal_home_account_id';

/** Persistimos el cache de MSAL en SQLite para sobrevivir reinicios. */
const cachePlugin = {
  async beforeCacheAccess(ctx) {
    const cached = kv.get(CACHE_KEY);
    if (cached) ctx.tokenCache.deserialize(cached);
  },
  async afterCacheAccess(ctx) {
    if (ctx.cacheHasChanged) kv.set(CACHE_KEY, ctx.tokenCache.serialize());
  },
};

let app = null;

function client() {
  if (!config.ms.configured) {
    throw new Error(
      'Faltan MS_CLIENT_ID / MS_CLIENT_SECRET. Mirá el README, sección "Conectar Outlook".'
    );
  }
  if (!app) {
    app = new ConfidentialClientApplication({
      auth: {
        clientId: config.ms.clientId,
        clientSecret: config.ms.clientSecret,
        authority: `https://login.microsoftonline.com/${config.ms.tenantId}`,
      },
      cache: { cachePlugin },
      system: {
        loggerOptions: {
          logLevel: LogLevel.Warning,
          loggerCallback(level, message) {
            if (level <= LogLevel.Warning) console.warn('[msal]', message);
          },
        },
      },
    });
  }
  return app;
}

export async function getAuthUrl(state = '') {
  return client().getAuthCodeUrl({
    scopes: config.ms.scopes,
    redirectUri: config.ms.redirectUri,
    prompt: 'select_account',
    state,
  });
}

export async function handleCallback(code) {
  const result = await client().acquireTokenByCode({
    code,
    scopes: config.ms.scopes,
    redirectUri: config.ms.redirectUri,
  });
  if (result?.account?.homeAccountId) {
    kv.set(ACCOUNT_KEY, result.account.homeAccountId);
    kv.set('ms_user_email', (result.account.username || '').toLowerCase());
    kv.set('ms_user_name', result.account.name || '');
  }
  return result;
}

/** Devuelve un access token válido, refrescándolo en silencio si hace falta. */
export async function getAccessToken() {
  const homeAccountId = kv.get(ACCOUNT_KEY);
  if (!homeAccountId) return null;

  const cca = client();
  const account = await cca.getTokenCache().getAccountByHomeId(homeAccountId);
  if (!account) return null;

  try {
    const result = await cca.acquireTokenSilent({ account, scopes: config.ms.scopes });
    return result?.accessToken ?? null;
  } catch (err) {
    console.error('[auth] no se pudo refrescar el token:', err.message);
    return null;
  }
}

export function connectedAccount() {
  const id = kv.get(ACCOUNT_KEY);
  if (!id) return null;
  return { email: kv.get('ms_user_email') || '', name: kv.get('ms_user_name') || '' };
}

export function disconnect() {
  kv.del(ACCOUNT_KEY);
  kv.del(CACHE_KEY);
  kv.del('ms_user_email');
  kv.del('ms_user_name');
  kv.del('delta_inbox');
  kv.del('delta_sent');
  app = null;
}
