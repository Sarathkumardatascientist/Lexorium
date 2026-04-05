const { getSessionFromRequest } = require('../auth/_session');
const store = require('../_lib/store');
const { activatePaidPlan, getUser, recordPaymentEvent, track } = store;
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { getPublicPlanSummary } = require('../_lib/plan-access');
const {
  acknowledgeGooglePlaySubscription,
  fetchGooglePlaySubscription,
  getGooglePlayAccessToken,
  getGooglePlayConfig,
  getPrimaryLineItem,
  getSubscriptionState,
  grantsEntitlement,
  isAcknowledged,
} = require('./_google-play');

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  if (!session?.sub) return sendError(res, 401, 'Sign in again to complete your Google Play upgrade.');

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 401, 'Your Lexorium account could not be found.');

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    return sendError(res, error.statusCode || 400, error.message || 'Request body must be valid JSON.');
  }

  const purchaseToken = String(body.purchaseToken || '').trim();
  const productId = String(body.productId || '').trim();
  if (!purchaseToken) return sendError(res, 400, 'Missing Google Play purchase token.');

  const config = getGooglePlayConfig();
  if (!config.enabled) {
    return sendError(res, 500, 'Google Play Billing is not fully configured on the server yet.');
  }

  const expectedProductId = config.proSubscriptionId;
  if (productId && productId !== expectedProductId) {
    return sendError(res, 400, 'This Google Play product is not enabled for Lexorium Pro.');
  }

  let accessToken;
  try {
    accessToken = await getGooglePlayAccessToken(config);
  } catch (error) {
    return sendError(res, 500, error.message || 'Could not authorize Google Play verification.');
  }

  const { response, data } = await fetchGooglePlaySubscription(config, accessToken, purchaseToken);
  if (!response.ok) {
    return sendError(
      res,
      response.status,
      data?.error?.message || data?.message || 'Could not verify the Google Play subscription.',
      { code: 'GOOGLE_PLAY_VERIFY_FAILED' },
    );
  }

  const lineItem = getPrimaryLineItem(data, expectedProductId);
  const subscriptionState = getSubscriptionState(data);
  const expiryTime = lineItem?.expiryTime || null;
  const orderReference = String(
    lineItem?.latestSuccessfulOrderId
    || body.orderId
    || purchaseToken,
  ).trim();

  await recordPaymentEvent(user.uid, 'pro', {
    provider: 'google_play',
    orderId: orderReference,
    paymentId: purchaseToken,
    invoiceId: orderReference,
    subscriptionId: expectedProductId,
    status: subscriptionState || 'received',
    eventType: 'google_play_verification',
    amountPaise: getPublicPlanSummary('pro')?.pricePaise || 89900,
    currency: 'INR',
    paidAt: null,
    raw: data,
  }).catch(() => null);

  if (!grantsEntitlement(subscriptionState, expiryTime)) {
    return sendError(res, 409, 'The Google Play subscription is not active yet.', {
      code: 'GOOGLE_PLAY_SUBSCRIPTION_NOT_ACTIVE',
      subscriptionState,
      expiryTime,
    });
  }

  let acknowledged = isAcknowledged(data);
  if (!acknowledged) {
    const ack = await acknowledgeGooglePlaySubscription(config, accessToken, purchaseToken, expectedProductId, user.uid);
    acknowledged = ack.response.ok || ack.response.status === 409;
  }

  await activatePaidPlan(user.uid, 'pro', {
    provider: 'google_play',
    orderId: orderReference,
    paymentId: purchaseToken,
    subscriptionId: expectedProductId,
    customerId: user.uid,
    status: subscriptionState || 'active',
    subscriptionEnd: expiryTime,
    eventType: 'google_play_subscription_activated',
    amountPaise: getPublicPlanSummary('pro')?.pricePaise || 89900,
    currency: 'INR',
    paidAt: new Date().toISOString(),
    raw: data,
  });

  await track(user.uid, 'checkout_completed', { provider: 'google_play', planId: 'pro', source: 'android_app' }).catch(() => null);
  await track(user.uid, 'upgraded_to_pro', { provider: 'google_play', planId: 'pro', source: 'android_app' }).catch(() => null);

  return sendJson(res, 200, {
    ok: true,
    provider: 'google_play',
    acknowledged,
    subscriptionState,
    expiryTime,
    plan: getPublicPlanSummary('pro'),
  });
};
