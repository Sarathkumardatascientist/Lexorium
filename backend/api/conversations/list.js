const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { sendError, sendJson } = require('../_lib/http');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { listConversations } = store;

module.exports = async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');
  return sendJson(res, 200, { ok: true, conversations: await listConversations(session.sub) });
};
