const puterHandler = require('./puter');
const { getSessionFromRequest } = require('./_session');
const store = require('../_lib/store');
const { activatePaidPlan, getUser } = store;
const {
  fetchGooglePlaySubscription,
  getGooglePlayAccessToken,
  getGooglePlayConfig,
  getPrimaryLineItem,
  getSubscriptionState,
  grantsEntitlement,
} = require('../billing/_google-play');
const { getPlanForProfile, getPublicPlanSummary, getUsageWarningState, getUsageForPlan } = require('../_lib/plan-access');
const { buildRetentionSummary } = require('../_lib/retention');
const { sendJson } = require('../_lib/http');



async function syncGooglePlayEntitlement(user) {
  if (!user) return user;
  if (String(user.billingProvider || '').trim().toLowerCase() !== 'google_play') return user;
  const purchaseToken = String(user.billingPaymentId || '').trim();
  if (!purchaseToken) return user;

  const config = getGooglePlayConfig();
  if (!config.enabled) return user;

  try {
    const accessToken = await getGooglePlayAccessToken(config);
    const { response, data } = await fetchGooglePlaySubscription(config, accessToken, purchaseToken);
    if (!response.ok) return user;

    const lineItem = getPrimaryLineItem(data, config.proSubscriptionId);
    const subscriptionState = getSubscriptionState(data);
    const expiryTime = lineItem?.expiryTime || null;
    if (!grantsEntitlement(subscriptionState, expiryTime)) return user;

    const externalEndAt = Date.parse(expiryTime || 0);
    const currentEndAt = Date.parse(user.subscriptionEnd || 0);
    const needsRefresh =
      String(user.plan || '').trim().toLowerCase() !== 'pro'
      || String(user.subscriptionStatus || '').trim().toLowerCase() !== 'active'
      || !Number.isFinite(currentEndAt)
      || !Number.isFinite(externalEndAt)
      || externalEndAt > currentEndAt;

    if (!needsRefresh) return user;

    return activatePaidPlan(user.uid, 'pro', {
      provider: 'google_play',
      customerId: user.uid,
      orderId: String(lineItem?.latestSuccessfulOrderId || user.billingSubscriptionId || purchaseToken).trim(),
      paymentId: purchaseToken,
      subscriptionId: config.proSubscriptionId,
      status: subscriptionState || 'active',
      subscriptionStart: user.subscriptionStart || null,
      subscriptionEnd: expiryTime,
      raw: data,
    });
  } catch (_error) {
    return user;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'POST') return puterHandler(req, res);

  const session = getSessionFromRequest(req);
  if (!session) {
    return sendJson(res, 200, {
      authenticated: false,
      profile: null,
      plan: getPublicPlanSummary('free'),
      usage: null,
    });
  }

  let user = await getUser(session.sub);
  if (!user) {
    return sendJson(res, 200, {
      authenticated: false,
      profile: null,
      plan: getPublicPlanSummary('free'),
      usage: null,
    });
  }

  user = await syncGooglePlayEntitlement(user);

  const planId = getPlanForProfile(user, req);
  const plan = getPublicPlanSummary(planId);
  const usage = getUsageForPlan(plan.id, user);
  const retention = buildRetentionSummary(user, plan, usage);

  return sendJson(res, 200, {
    authenticated: true,
    profile: {
      uid: user.uid,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatar: user.avatar,
      picture: user.avatar,
      provider: session.provider || 'puter',
      currentPlan: plan.id,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      totalMessages: user.totalMessages,
      totalConversations: user.totalConversations,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      features: plan.features,
      retention,
    },
    plan,
    usage,
    retention,
  });
};
