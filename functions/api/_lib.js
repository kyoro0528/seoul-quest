// Shared helpers for the TOPIK Study API (Cloudflare Pages Functions).
// Files whose name starts with "_" are not treated as routes.

export const SESSION_COOKIE = 'topik_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function requireDb(env) {
  if (!env || !env.DB) return json({ ok: false, error: 'database_not_configured' }, 500);
  return null;
}

export function requireGoogleEnv(env) {
  if (!env || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json({ ok: false, error: 'google_oauth_not_configured' }, 500);
  }
  return null;
}

// Schema per phase2-design.md section 3. CREATE TABLE IF NOT EXISTS makes this
// safe to run on every request; /api/health doubles as the migration entry point.
export async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      auth_provider TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS learning_data (
      user_id TEXT NOT NULL REFERENCES users(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
  ]);
}

export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = '';
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name) cookies[name] = part.slice(idx + 1).trim();
  }
  return cookies;
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, now + SESSION_MAX_AGE_SECONDS * 1000, now)
    .run();
  return token;
}

export async function getSessionUser(context) {
  const { request, env } = context;
  if (!env || !env.DB) return null;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT s.expires_at AS expires_at, u.id AS id, u.email AS email, u.auth_provider AS auth_provider ' +
    'FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { id: row.id, email: row.email, authProvider: row.auth_provider };
}

export async function deleteSession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
