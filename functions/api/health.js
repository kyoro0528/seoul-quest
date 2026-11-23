import { ensureSchema, json, requireDb } from './_lib.js';

// GET /api/health — liveness check that also applies the D1 schema
// (CREATE TABLE IF NOT EXISTS), so it doubles as the migration mechanism.
export async function onRequestGet(context) {
  const dbError = requireDb(context.env);
  if (dbError) return dbError;
  try {
    await ensureSchema(context.env);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: 'schema_init_failed', detail: String((error && error.message) || error) }, 500);
  }
}
