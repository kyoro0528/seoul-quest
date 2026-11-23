import { clearSessionCookie, deleteSession, ensureSchema, json, requireDb } from '../_lib.js';

// POST /api/auth/logout — delete the session row and clear the cookie.
export async function onRequestPost(context) {
  const dbError = requireDb(context.env);
  if (dbError) return dbError;
  try {
    await ensureSchema(context.env);
    await deleteSession(context.env, context.request);
  } catch (error) {
    // Logout must succeed from the user's point of view even if cleanup fails.
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
