const { getSessionFromRequest } = require('../auth/_session');
const store = require('../_lib/store');
const { getUser } = store;
const { sendJson, sendError } = require('../_lib/http');
const { getPlanForProfile, getPublicPlanSummary } = require('../_lib/plan-access');

module.exports = async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 404, 'User not found.');

  const planId = getPlanForProfile(user, req);
  const plan = getPublicPlanSummary(planId);
  const used = Number(user.dailyFreeUsageCount || 0);

  return sendJson(res, 200, {
    ok: true,
    plan,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionStart: user.subscriptionStart,
    subscriptionEnd: user.subscriptionEnd,
    usage: {
      limit: plan.dailyLimit,
      used,
      remaining: Math.max(plan.dailyLimit - used, 0),
      resetAt: user.dailyFreeUsageResetAt,
      nextResetAt: user.dailyFreeUsageResetAt,
    },
  });
};
