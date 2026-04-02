const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { getQueryValue, sendError, sendJson } = require('../_lib/http');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { getConversation } = store;

module.exports = async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');
  const id = getQueryValue(req, 'id');
  if (!id) return sendError(res, 400, 'Conversation id is required.');
  const conversation = await getConversation(session.sub, id);
  if (!conversation) return sendError(res, 404, 'Conversation not found.');
  return sendJson(res, 200, { ok: true, conversation });
};
