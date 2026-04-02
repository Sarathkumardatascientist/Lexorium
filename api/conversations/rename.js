const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { renameConversation } = store;

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;
  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const id = String(body.id || '').trim();
  const title = String(body.title || '').trim();
  if (!id) return sendError(res, 400, 'Conversation id is required.');
  if (!title) return sendError(res, 400, 'Conversation title is required.');

  await renameConversation(session.sub, id, title);
  return sendJson(res, 200, { ok: true, id, title });
};
