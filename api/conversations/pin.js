const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { canAccessFeature, getPlanIdFromUser } = require('../_lib/plan-access');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { getUser, setPinned, track } = store;

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 404, 'User not found.');

  const planId = getPlanIdFromUser(user);
  if (!canAccessFeature(planId, 'pinConversation')) {
    await track(user.uid, 'premium_feature_blocked', { feature: 'pinConversation', planId }).catch(() => null);
    return sendError(res, 402, 'Pinned conversations require Lexorium Pro.', {
      code: 'UPGRADE_REQUIRED',
      type: 'upgrade_required',
    });
  }

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);
  if (!body.id) return sendError(res, 400, 'Conversation id is required.');

  await setPinned(user.uid, body.id, !!body.pinned);
  await track(user.uid, 'premium_feature_used', { feature: 'pinConversation', planId, id: body.id, pinned: !!body.pinned }).catch(() => null);

  return sendJson(res, 200, { ok: true });
};
