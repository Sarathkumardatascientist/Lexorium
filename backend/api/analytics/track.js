const { getSessionFromRequest } = require('../auth/_session');
const { extractProviderToken } = require('../_lib/ai-provider');
const { resolvePuterUser } = require('../_lib/puter-client');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { track, getUser, upsertUser } = store;

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);
  if (!body.eventName) return sendError(res, 400, 'eventName is required.');

  const explicitToken = extractProviderToken(req, body);

  if (!explicitToken && !session?.sub) {
    return sendError(res, 401, 'Sign in is required.');
  }

  let user = null;
  if (session?.sub) {
    user = await getUser(session.sub);
  }
  if (!user && explicitToken) {
    try {
      const puterProfile = await resolvePuterUser(explicitToken);
      if (puterProfile) {
        const uuid = String(
          puterProfile.uuid || puterProfile.id || puterProfile._id ||
          puterProfile.username || puterProfile.email || ''
        ).trim();
        if (uuid) {
          const uid = `puter:${uuid.toLowerCase()}`;
          const name = String(
            puterProfile.name || puterProfile.display_name || puterProfile.displayName ||
            puterProfile.full_name || puterProfile.fullName || puterProfile.username || ''
          ).trim();
          const email = String(puterProfile.email || '').trim() || `${uuid.toLowerCase()}@puter.local`;
          const avatar = String(puterProfile.avatar || puterProfile.picture || '').trim();
          user = await upsertUser({ uid, authProvider: 'puter', name: name || 'Lexorium User', email, avatar });
        }
      }
    } catch (_tokenError) {
      // Token resolution failed — leave user as null and return 401 below
    }
  }
  if (!user) {
    return sendError(res, 401, 'Sign in is required.');
  }

  await track(user.uid, body.eventName, body.meta || {});
  return sendJson(res, 200, { ok: true });
};
