import { json, randomToken, requireDb, requireGoogleEnv } from '../../_lib.js';

const STATE_COOKIE = 'topik_oauth_state';
export const REDIRECT_URI = 'https://topik-study.pages.dev/api/auth/google/callback';

// GET /api/auth/google/login — start the Google OAuth flow.
// CSRF protection: a random state value is kept in an HttpOnly cookie and sent
// as the OAuth `state` parameter; the callback compares the two.
export async function onRequestGet(context) {
  const dbError = requireDb(context.env);
  if (dbError) return dbError;
  const envError = requireGoogleEnv(context.env);
  if (envError) return envError;

  const state = randomToken(24);
  const params = new URLSearchParams({
    client_id: context.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'Set-Cookie': `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}
