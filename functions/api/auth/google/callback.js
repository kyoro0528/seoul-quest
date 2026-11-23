import {
  createSession,
  ensureSchema,
  parseCookies,
  requireDb,
  requireGoogleEnv,
  sessionCookie,
} from '../../_lib.js';
import { REDIRECT_URI } from './login.js';

const STATE_COOKIE = 'topik_oauth_state';
const CLEAR_STATE_COOKIE = `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

function redirectHome(location, cookies) {
  const headers = new Headers();
  headers.set('Location', location);
  headers.set('Cache-Control', 'no-store');
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function fail(code) {
  return redirectHome(`/?login=error&reason=${encodeURIComponent(code)}`, [CLEAR_STATE_COOKIE]);
}

// GET /api/auth/google/callback — verify state, exchange the code, upsert the
// user (keyed by email), create a session and send the user back home.
export async function onRequestGet(context) {
  const { request, env } = context;
  const dbError = requireDb(env);
  if (dbError) return dbError;
  const envError = requireGoogleEnv(env);
  if (envError) return envError;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = parseCookies(request)[STATE_COOKIE];
  if (url.searchParams.get('error')) return fail('google_denied');
  if (!code || !state || !expectedState || state !== expectedState) return fail('state_mismatch');

  try {
    await ensureSchema(env);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) return fail('token_exchange_failed');
    const tokens = await tokenResponse.json();

    const userinfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoResponse.ok) return fail('userinfo_failed');
    const profile = await userinfoResponse.json();
    if (!profile.email || profile.email_verified === false) return fail('email_unavailable');

    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO users (id, email, auth_provider, created_at, last_seen_at)
       VALUES (?, ?, 'google', ?, ?)
       ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    ).bind(crypto.randomUUID(), profile.email, now, now).run();
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(profile.email).first();
    if (!user) return fail('user_upsert_failed');

    const sessionToken = await createSession(env, user.id);
    return redirectHome('/?login=ok', [sessionCookie(sessionToken), CLEAR_STATE_COOKIE]);
  } catch (error) {
    return fail('internal_error');
  }
}
