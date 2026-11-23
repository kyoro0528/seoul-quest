import { ensureSchema, getSessionUser, json, requireDb } from './_lib.js';

const MAX_KEYS = 200;
const MAX_VALUE_LENGTH = 2_000_000; // a single localStorage value can reach a few hundred KB
const MAX_BODY_LENGTH = 8_000_000;
const KEY_PATTERN = /^[A-Za-z0-9_]+$/;

// The server is a faithful per-key store (design doc section 4). Item-level
// merging for SRS/state/exam keys happens on the client before push, so the
// only rule enforced here is per-key last-write-wins on updated_at.

// GET /api/sync — all learning_data rows for the signed-in user.
export async function onRequestGet(context) {
  const dbError = requireDb(context.env);
  if (dbError) return dbError;
  await ensureSchema(context.env);
  const user = await getSessionUser(context);
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
  const { results } = await context.env.DB.prepare(
    'SELECT key, value, updated_at FROM learning_data WHERE user_id = ?'
  ).bind(user.id).all();
  const keys = {};
  for (const row of results || []) keys[row.key] = { value: row.value, updated_at: row.updated_at };
  return json({ ok: true, keys });
}

// POST /api/sync — body {keys: {key: {value, updated_at}}}; upserts each key
// only when the incoming updated_at is not older than the stored one.
export async function onRequestPost(context) {
  const dbError = requireDb(context.env);
  if (dbError) return dbError;
  await ensureSchema(context.env);
  const user = await getSessionUser(context);
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const raw = await context.request.text();
  if (raw.length > MAX_BODY_LENGTH) return json({ ok: false, error: 'payload_too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  const incoming = body && body.keys;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  const entries = Object.entries(incoming);
  if (entries.length > MAX_KEYS) return json({ ok: false, error: 'too_many_keys' }, 400);

  const statements = [];
  for (const [key, entry] of entries) {
    if (!KEY_PATTERN.test(key) || key === 'topikSyncMeta') continue;
    if (!entry || typeof entry.value !== 'string' || entry.value.length > MAX_VALUE_LENGTH) continue;
    const updatedAt = Number(entry.updated_at);
    if (!Number.isFinite(updatedAt) || updatedAt < 0) continue;
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO learning_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= learning_data.updated_at`
      ).bind(user.id, key, entry.value, Math.floor(updatedAt))
    );
  }
  if (statements.length) await context.env.DB.batch(statements);
  return json({ ok: true, stored: statements.length });
}
