import { ensureSchema, getSessionUser, json, requireDb } from '../_lib.js';

// GET /api/auth/me — current login state for the frontend sync layer.
export async function onRequestGet(context) {
  const dbError = requireDb(context.env);
  if (dbError) return dbError;
  try {
    await ensureSchema(context.env);
    const user = await getSessionUser(context);
    if (!user) return json({ loggedIn: false });
    return json({ loggedIn: true, email: user.email });
  } catch (error) {
    return json({ loggedIn: false });
  }
}
