const { getSessionFromRequest } = require('../auth/_session');
const store = require('../_lib/store');
const { updateUserProfile } = store;
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
  const subscription = body?.subscription;
  const targetUid = String(body?.uid || '').trim();

  if (!subscription || targetUid !== session.sub) {
    return sendJson(res, 400, { error: 'Invalid subscription or uid' });
  }

  await updateUserProfile(targetUid, { pushSubscription: JSON.stringify(subscription) });

  return sendJson(res, 200, { success: true });
};