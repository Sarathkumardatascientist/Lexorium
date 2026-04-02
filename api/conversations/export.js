const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { getQueryValue, sendError, sendJson } = require('../_lib/http');
const { canAccessFeature, getPlanIdFromUser } = require('../_lib/plan-access');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { exportText, getConversation, getUser, track } = store;

module.exports = async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 404, 'User not found.');

  const planId = getPlanIdFromUser(user);
  if (!canAccessFeature(planId, 'exportConversation')) {
    await track(user.uid, 'premium_feature_blocked', { feature: 'exportConversation', planId }).catch(() => null);
    return sendError(res, 402, 'Conversation export requires Lexorium Pro.', {
      code: 'UPGRADE_REQUIRED',
      type: 'upgrade_required',
    });
  }

  const id = getQueryValue(req, 'id');
  if (!id) return sendError(res, 400, 'Conversation id is required.');

  const conversation = await getConversation(user.uid, id);
  if (!conversation) return sendError(res, 404, 'Conversation not found.');

  await track(user.uid, 'premium_feature_used', { feature: 'exportConversation', planId, id }).catch(() => null);
  await track(user.uid, 'export_used', { id, planId }).catch(() => null);

  return sendJson(res, 200, {
    ok: true,
    title: conversation.title,
    text: exportText(conversation),
    conversation,
  });
};
