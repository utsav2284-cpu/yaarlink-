// Server-only and deliberately unwired. There is no provisioned login yet.
import pg from 'pg';
const HOST = 'db.qwngmsedyepghskoagaj.supabase.co';
const USER = 'preview_recovery_login';

export function previewRecoverySettings(env) {
  const password = env.PREVIEW_RECOVERY_DB_PASSWORD;
  const rawPepper = env.PREVIEW_RECOVERY_PEPPER_BASE64;
  if (typeof password !== 'string' || !password || typeof rawPepper !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(rawPepper)) throw new Error('Recovery is not configured');
  const pepper = Buffer.from(rawPepper, 'base64');
  if (pepper.length < 32 || pepper.toString('base64') !== rawPepper) throw new Error('Recovery is not configured');
  // An object rather than a connection string prevents URL options from
  // redirecting this credential to another database or disabling TLS.
  return { database: { host: HOST, port: 5432, database: 'postgres', user: USER, password,
    ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 5000 }, pepper };
}

export function createPreviewRecoveryPool(settings) {
  if (settings?.host !== HOST || settings?.port !== 5432 || settings?.database !== 'postgres' ||
      settings?.user !== USER || settings?.ssl?.rejectUnauthorized !== true ||
      typeof settings?.password !== 'string' || !settings.password) throw new Error('Invalid Preview recovery configuration');
  // Reconstruct instead of forwarding settings, which could contain overrides.
  return new pg.Pool({host: HOST, port: 5432, database: 'postgres', user: USER,
    password: settings.password, ssl: {rejectUnauthorized:true}, max:2, connectionTimeoutMillis:5000});
}
