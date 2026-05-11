const { getSessionFromRequest } = require('../auth/_session');
const { extractPuterToken, resolvePuterUser } = require('../_lib/puter-client');
const store = require('../_lib/store');
const { getUser, upsertUser } = store;
const { sendJson, sendError } = require('../_lib/http');
const { getPlanForProfile, getPublicPlanSummary } = require('../_lib/plan-access');

async function resolveUserWithFallback(req, body) {
  const session = getSessionFromRequest(req);
  const explicitToken = extractPuterToken(req, body);

  if (!session?.sub && !explicitToken) {
    return null;
  }

  let user = null;
  if (session?.sub) {
    user = await getUser(session.sub);
  }
  if (!user && explicitToken) {
    try {
      const puterProfile = await resolvePuterUser(explicitToken);
      if (puterProfile) {
        const uuid = String(
          puterProfile.uuid || puterProfile.id || puterProfile._id ||
          puterProfile.username || puterProfile.email || ''
        ).trim();
        if (uuid) {
          const uid = `puter:${uuid.toLowerCase()}`;
          const name = String(
            puterProfile.name || puterProfile.display_name || puterProfile.displayName ||
            puterProfile.full_name || puterProfile.fullName || puterProfile.username || ''
          ).trim();
          const email = String(puterProfile.email || '').trim() || `${uuid.toLowerCase()}@puter.local`;
          const avatar = String(puterProfile.avatar || puterProfile.picture || '').trim();
          user = await upsertUser({ uid, authProvider: 'puter', name: name || 'Lexorium User', email, avatar });
        }
      }
    } catch (_tokenError) {
      // Token resolution failed; user stays null
    }
  }
  return user;
}

module.exports = async (req, res) => {
  const body = {};
  const user = await resolveUserWithFallback(req, body);
  if (!user) {
    return sendError(res, 401, 'Sign in is required.');
  }

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
