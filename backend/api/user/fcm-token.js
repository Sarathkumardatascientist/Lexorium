const { getSessionFromRequest } = require('../auth/_session');
const store = require('../_lib/store');
const { updateUserProfile, getUser } = store;
const { sendJson, getJsonBody } = require('../_lib/http');

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const body = await getJsonBody(req);
  const token = String(body?.token || '').trim();
  const targetUid = String(body?.uid || '').trim();

  if (!token || targetUid !== session.sub) {
    return sendJson(res, 400, { error: 'Invalid token or uid' });
  }

  await updateUserProfile(targetUid, { fcmToken: token });

  return sendJson(res, 200, { success: true });
};