const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { requireMethod, sendError, sendJson } = require('../_lib/http');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { clearConversations } = store;

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;
  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');
  await clearConversations(session.sub);
  return sendJson(res, 200, { ok: true });
};
