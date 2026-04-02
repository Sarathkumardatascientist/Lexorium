const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const { buildRetentionSummary, normalizePersona } = require('../_lib/retention');
const { getPlanForProfile, getPublicPlanSummary } = require('../_lib/plan-access');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { getUser, track, updateUserProfile } = store;

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required.');

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const persona = normalizePersona(body.persona);
  const primaryUseCase = String(body.primaryUseCase || '').trim();
  if (!persona && !primaryUseCase) return sendError(res, 400, 'A persona or primary use case is required.');

  const user = await updateUserProfile(session.sub, {
    persona,
    primaryUseCase,
    onboardingCompleted: Boolean(persona || primaryUseCase),
  });
  const planId = getPlanForProfile(user, req);
  const plan = getPublicPlanSummary(planId);
  const usage = {
    limit: plan.dailyLimit,
    used: Number(user.dailyFreeUsageCount || 0),
    remaining: Math.max(plan.dailyLimit - Number(user.dailyFreeUsageCount || 0), 0),
    resetAt: user.dailyFreeUsageResetAt || null,
    nextResetAt: user.dailyFreeUsageResetAt || null,
  };
  const retention = buildRetentionSummary(user, plan, usage);

  await track(session.sub, 'onboarding_completed', {
    persona: persona || null,
    primaryUseCase: primaryUseCase || null,
  }).catch(() => null);

  return sendJson(res, 200, {
    ok: true,
    retention,
    profile: {
      uid: user.uid,
      persona: user.persona,
      primaryUseCase: user.primaryUseCase,
      retention,
    },
  });
};
