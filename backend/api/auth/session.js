const puterHandler = require('./puter');
const { getSessionFromRequest } = require('./_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { getUser } = store;
const { getPlanForProfile, getPublicPlanSummary, getUsageWarningState } = require('../_lib/plan-access');
const { buildRetentionSummary } = require('../_lib/retention');
const { sendJson } = require('../_lib/http');

function usageFor(planId, user) {
  const plan = getPublicPlanSummary(planId);
  const used = Number(user?.dailyFreeUsageCount || 0);
  const resetAt = user?.dailyFreeUsageResetAt || null;
  return {
    limit: plan.dailyLimit,
    used,
    remaining: Math.max(plan.dailyLimit - used, 0),
    resetAt,
    nextResetAt: resetAt,
    warning: getUsageWarningState(planId, { limit: plan.dailyLimit, used }),
  };
}

module.exports = async (req, res) => {
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

  const user = await getUser(session.sub);
  if (!user) {
    return sendJson(res, 200, {
      authenticated: false,
      profile: null,
      plan: getPublicPlanSummary('free'),
      usage: null,
    });
  }

  const planId = getPlanForProfile(user, req);
  const plan = getPublicPlanSummary(planId);
  const usage = usageFor(plan.id, user);
  const retention = buildRetentionSummary(user, plan, usage);

  return sendJson(res, 200, {
    authenticated: true,
    profile: {
      uid: user.uid,
      name: user.name,
      email: user.email,
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
