const { getSessionFromRequest } = require('./auth/_session');
const db = require('./_lib/db');
const devStore = require('./_lib/dev-store');
const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { getConversation, getPlanIdFromUser, getUser, saveConversation, takeQuota, track } = store;
const { classify, prompt } = require('./_lib/legal');
const { assessAnswerQuality, buildRepairMessages } = require('./_lib/answer-quality');
const { findAuthoritativeSources } = require('./_lib/research');
const { classifyQuery } = require('./_lib/query-classifier');
const { routeModel } = require('./_lib/model-router');
const { executeAIRequest, extractProviderToken } = require('./_lib/ai-provider');
const { buildBlockedPayload, buildSuccessPayload } = require('./_lib/response-normalizer');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('./_lib/http');
const { getPlanConfig, getPublicPlanSummary, getUsageWarningState } = require('./_lib/plan-access');
const { buildRetentionSummary } = require('./_lib/retention');

function usageView(planId, usage) {
  const plan = getPlanConfig(planId);
  const resetAt = usage?.resetAt || usage?.nextResetAt || null;
  const limit = Number(usage?.limit || plan.dailyLimit || 0);
  const used = Number(usage?.used || 0);
  return {
    limit,
    used,
    remaining: Math.max(Number(usage?.remaining ?? limit - used), 0),
    resetAt,
    nextResetAt: resetAt,
  };
}

function extractText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      return typeof part.text === 'string' ? part.text : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractAttachmentHints(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => part && typeof part === 'object' && typeof part.type === 'string' && part.type !== 'text' && part.type !== 'input_text');
}

function mapMode(value) {
  const mode = String(value || 'chat').trim().toLowerCase();
  if (mode === 'summary') return 'summarize';
  return ['draft', 'analyse', 'research', 'summarize'].includes(mode) ? mode : 'chat';
}

function buildLegacyMessages(messages, planId, classification, gate, sources, personalization) {
  const historyDepth = ['pro', 'enterprise'].includes(planId) ? 12 : 6;
  const history = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && message.role && message.role !== 'system')
    .slice(-historyDepth)
    .map((message) => ({ role: message.role, content: message.content }));
  return [{ role: 'system', content: prompt(planId, classification, gate.kind === 'mixed', sources, gate.sensitive, personalization) }, ...history];
}

async function buildConversationMessages(user, body, planId, classification, gate, sources, personalization) {
  const history = body.conversationId ? ((await getConversation(user.uid, body.conversationId)) || {}).messages || [] : [];
  const historyDepth = ['pro', 'enterprise'].includes(planId) ? 12 : 6;
  return [
    { role: 'system', content: prompt(planId, classification, gate.kind === 'mixed', sources, gate.sensitive, personalization) },
    ...history.slice(-historyDepth).map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: gate.text },
  ];
}

function getRequestMaxTokens(planId, requestedMaxTokens, classification) {
  const requested = typeof requestedMaxTokens === 'number' ? requestedMaxTokens : null;
  const freeDefault =
    classification?.taskType === 'quick_qa'
      ? 180
      : classification?.complexity === 'complex'
        ? 260
        : 220;
  const defaults = {
    free: Number.parseInt(process.env.LEXORIUM_FREE_MAX_TOKENS || String(freeDefault), 10) || freeDefault,
    pro: Number.parseInt(process.env.LEXORIUM_PRO_MAX_TOKENS || '2200', 10) || 2200,
    enterprise: Number.parseInt(process.env.LEXORIUM_ENTERPRISE_MAX_TOKENS || '3200', 10) || 3200,
  };
  const defaultValue = defaults[planId] || defaults.free;
  const floor = planId === 'free' ? (classification?.taskType === 'quick_qa' ? 160 : 180) : (classification?.complexity === 'complex' ? 900 : 300);
  const ceiling = planId === 'enterprise' ? 4000 : planId === 'pro' ? 2600 : 720;
  return Math.max(Math.min(requested || defaultValue, ceiling), floor);
}

function getTokenCeiling(planId) {
  return planId === 'enterprise' ? 4000 : planId === 'pro' ? 2600 : 720;
}

function getRepairMaxTokens(planId, requestedMaxTokens, classification) {
  const base = getRequestMaxTokens(planId, requestedMaxTokens, classification);
  const bonus = planId === 'free' ? 120 : 320;
  return Math.min(base + bonus, getTokenCeiling(planId));
}

function getTemperatureForClassification(classification) {
  if (classification?.taskType === 'legal_drafting') return 0.18;
  if (classification?.complexity === 'complex') return 0.08;
  if (classification?.acceptsFastResponse) return 0.1;
  return 0.12;
}

function getTimeoutForPlan(planId, classification) {
  const fast = Math.max(Number.parseInt(process.env.LEXORIUM_PUTER_FREE_TIMEOUT_MS || '22000', 10) || 22000, 18000);
  const standard = Math.max(Number.parseInt(process.env.LEXORIUM_PUTER_TIMEOUT_MS || '32000', 10) || 32000, 22000);
  const enterprise = Math.max(Number.parseInt(process.env.LEXORIUM_PUTER_ENTERPRISE_TIMEOUT_MS || '42000', 10) || 42000, 26000);
  if (planId === 'enterprise') return enterprise;
  if (classification?.acceptsFastResponse && planId === 'free') return fast;
  return standard;
}

function shouldFetchSources(planId, mode, classification) {
  if (['pro', 'enterprise'].includes(planId)) return true;
  if (mode === 'research' || mode === 'analyse') return true;
  return ['case_law_style_analysis', 'bare_act_or_provision_explanation', 'doctrine_explanation'].includes(classification?.taskType);
}

async function trackUsageEvents(uid, planId, usage, classification) {
  const warning = getUsageWarningState(planId, usage);
  if (warning.showSoftWarning) {
    await track(uid, 'usage_warning_shown', { planId, used: usage.used, limit: usage.limit, taskType: classification.taskType }).catch(() => null);
  }
}

async function withDeadline(taskPromise, timeoutMs, message, code) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = code;
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function improveAnswerIfNeeded(options) {
  const initial = assessAnswerQuality(options?.routed?.content, options?.classification);
  if (initial.ok) {
    return {
      routed: options.routed,
      quality: initial,
      repaired: false,
      repairError: null,
    };
  }

  const repairPayload = {
    messages: buildRepairMessages({
      planId: options.planId,
      classification: options.classification,
      mixed: options.mixed,
      sources: options.sources,
      userText: options.userText,
      answer: options.routed?.content,
      reasons: initial.reasons,
    }),
    max_tokens: getRepairMaxTokens(options.planId, options.requestedMaxTokens, options.classification),
    temperature: Math.min(getTemperatureForClassification(options.classification), 0.12),
  };

  try {
    const repaired = await withDeadline(
      executeAIRequest(options.route, {
        payload: repairPayload,
        timeoutMs: getTimeoutForPlan(options.planId, options.classification),
        authToken: options.authToken,
      }),
      (options.planId === 'enterprise' ? 42000 : 28000),
      'Lexorium could not finalize the answer right now.',
      'PUTER_REPAIR_TIMEOUT'
    );
    const repairedQuality = assessAnswerQuality(repaired.content, options.classification);
    if (repairedQuality.ok || repairedQuality.score > initial.score) {
      return {
        routed: {
          ...repaired,
          attempts: [
            ...(options.routed?.attempts || []),
            {
              modelId: options.routed?.model?.id || options.route?.selectedModel?.id || '',
              reason: 'ANSWER_REPAIRED',
              message: initial.reasons.join(', '),
            },
            ...(repaired.attempts || []),
          ],
        },
        quality: repairedQuality,
        repaired: true,
        repairError: null,
      };
    }

    return {
      routed: options.routed,
      quality: initial,
      repaired: false,
      repairError: null,
    };
  } catch (error) {
    return {
      routed: options.routed,
      quality: initial,
      repaired: false,
      repairError: error,
    };
  }
}

function buildRetention(user, plan, usage) {
  return buildRetentionSummary(user || {}, plan, usage);
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required to use Lexorium.');

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const providerToken = extractProviderToken(req, body);
  if (!providerToken) return sendError(res, 401, 'Sign in is required to use Lexorium.');

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 401, 'User record not found.');

  const legacy = Array.isArray(body.messages);
  const mode = mapMode(body.mode);
  const personalization = body.personalization && typeof body.personalization === 'object' ? body.personalization : null;
  const lastUserMessage = legacy ? [...body.messages].reverse().find((message) => message && message.role === 'user') : null;
  const attachments = legacy ? extractAttachmentHints(lastUserMessage?.content) : Array.isArray(body.attachments) ? body.attachments : [];
  const rawText = legacy ? extractText(lastUserMessage?.content) : String(body.text || '').trim();
  const gate = classify(rawText, attachments, mode === 'summarize' ? 'analyse' : mode);
  const planId = getPlanIdFromUser(user);
  const plan = getPublicPlanSummary(planId);
  const baseUsage = usageView(planId, {
    limit: plan.dailyLimit,
    used: user.dailyFreeUsageCount,
    remaining: Math.max(plan.dailyLimit - Number(user.dailyFreeUsageCount || 0), 0),
    resetAt: user.dailyFreeUsageResetAt,
  });
  const baseRetention = buildRetention(user, plan, baseUsage);

  if (['empty', 'large', 'nonlegal'].includes(gate.kind)) {
    const saved = await saveConversation(user.uid, {
      id: body.conversationId,
      userText: gate.text || rawText,
      answerText: gate.reply,
      mode,
      model: 'lexorium-legal-redirect',
      modelLabel: 'Lexorium Legal Intelligence',
      title: body.title || '',
    });
    return sendJson(
      res,
      200,
      buildSuccessPayload({
        answer: gate.reply,
        conversation: saved,
        plan,
        usage: baseUsage,
        model: { id: 'lexorium-legal-redirect', label: 'Lexorium Legal Intelligence' },
        classification: { taskType: 'legal_redirect', complexity: 'simple' },
        attempts: [],
        features: plan.features,
        sources: [],
        retention: baseRetention,
      })
    );
  }

  const classification = classifyQuery({ text: gate.text, mode, attachments });
  if (classification.requiredFeature || ['legal_drafting', 'case_law_style_analysis', 'comparison', 'compliance_checklist'].includes(classification.taskType)) {
    await track(user.uid, 'premium_intent_detected', {
      planId,
      taskType: classification.taskType,
      complexity: classification.complexity,
      requiredFeature: classification.requiredFeature || null,
    }).catch(() => null);
  }
  const route = routeModel({
    planId,
    classification,
    requestedModelId: null,
  });

  if (route.blocked) {
    await track(user.uid, 'premium_feature_blocked', {
      planId,
      feature: route.feature || classification.requiredFeature || 'premium_model',
      requestedModelId: body.model || '',
      taskType: classification.taskType,
    }).catch(() => null);
    return sendJson(
      res,
      402,
      buildBlockedPayload({
        type: route.type || 'upgrade_required',
        code: route.code || 'UPGRADE_REQUIRED',
        title: route.title,
        message: route.message,
        plan,
        usage: baseUsage,
        features: plan.features,
        retention: baseRetention,
      })
    );
  }

  const quota = await takeQuota(user.uid);
  if (!quota.ok) {
    const deniedUsage = usageView(planId, quota.usage);
    const upgradePlanName = plan.upgradeTarget || 'pro';
    await track(user.uid, 'paywall_viewed', { planId, reason: 'limit_reached' }).catch(() => null);
    await track(user.uid, planId === 'free' ? 'free_limit_hit' : 'paid_limit_hit', { planId, usage: deniedUsage }).catch(() => null);
    return sendJson(
      res,
      429,
      buildBlockedPayload({
        type: 'limit_reached',
        code: 'PLAN_LIMIT_REACHED',
        title: 'Today’s Lexorium limit has been reached',
        message: planId === 'free'
          ? `You’ve reached today’s limit. Upgrade to Lexorium ${upgradePlanName.charAt(0).toUpperCase()}${upgradePlanName.slice(1)} for advanced legal reasoning, contract drafting, and priority responses.`
          : 'You have reached your daily plan limit. Please wait for the next reset window or upgrade your plan.',
        plan,
        usage: deniedUsage,
        features: plan.features,
        requiredPlan: upgradePlanName,
        retention: baseRetention,
      })
    );
  }

  const sources = shouldFetchSources(planId, mode, classification)
    ? await findAuthoritativeSources(gate.text, mode).catch(() => [])
    : [];
  const messages = legacy
    ? buildLegacyMessages(body.messages, planId, classification, gate, sources, personalization)
    : await buildConversationMessages(user, body, planId, classification, gate, sources, personalization);

  const payload = {
    messages,
    max_tokens: getRequestMaxTokens(planId, body.maxTokens, classification),
    temperature: getTemperatureForClassification(classification),
  };

  let routed;
  try {
    const routeDeadlineMs = {
      free: 32000,
      pro: 36000,
      enterprise: 50000,
    }[planId] || 30000;
    routed = await withDeadline(
      executeAIRequest(route, { payload, timeoutMs: getTimeoutForPlan(planId, classification), authToken: providerToken }),
      routeDeadlineMs,
      'Lexorium could not complete the request right now.',
      'PUTER_ROUTE_TIMEOUT'
    );
  } catch (error) {
    if (error?.statusCode === 401 || error?.code === 'PUTER_AUTH_REQUIRED') {
      return sendError(res, 401, error.message || 'Your session expired. Sign in again to continue.');
    }

    await track(user.uid, error?.code === 'PUTER_ROUTE_TIMEOUT' ? 'puter_route_timeout' : 'puter_route_failed', {
      planId,
      taskType: classification.taskType,
      attempts: error?.attempts || [],
    }).catch(() => null);
    return sendJson(res, 503, {
      ok: false,
      code: error?.code || 'PUTER_CHAT_UNAVAILABLE',
      message: error?.message || 'Lexorium could not get a live response from the AI service right now. Please retry.',
      meta: {
        plan,
        usage: usageView(planId, quota.usage),
        attempts: error?.attempts || [],
        retention: baseRetention,
      },
    });
  }

  const improved = await improveAnswerIfNeeded({
    routed,
    route,
    planId,
    classification,
    mixed: gate.kind === 'mixed',
    sources,
    userText: gate.text,
    requestedMaxTokens: body.maxTokens,
    authToken: providerToken,
  });
  if (improved.repaired) {
    await track(user.uid, 'answer_quality_repaired', {
      planId,
      taskType: classification.taskType,
      modelId: improved.routed?.model?.id || routed.model?.id || '',
    }).catch(() => null);
  } else if (!improved.quality.ok) {
    await track(user.uid, 'answer_quality_warning', {
      planId,
      taskType: classification.taskType,
      reasons: improved.quality.reasons,
      repairFailed: Boolean(improved.repairError),
    }).catch(() => null);
  }
  routed = improved.routed;

  const updatedUser = await (store.recordRetentionActivity
    ? store.recordRetentionActivity(user.uid, classification, {
        persona: body.persona || '',
        primaryUseCase: body.primaryUseCase || '',
        completeOnboarding: Boolean(body.persona || body.primaryUseCase),
      }).catch(() => user)
    : Promise.resolve(user));

  const saved = await saveConversation(user.uid, {
    id: body.conversationId,
    userText: gate.text,
    answerText: routed.content,
    mode,
    model: routed.model?.id || '',
    modelLabel: routed.model?.label || '',
    modelTier: plan.routeTier || '',
    modelPlanName: plan.name || '',
    title: body.title || '',
  });

  if (quota.first) {
    await track(user.uid, 'first_query_completed', { planId }).catch(() => null);
    await track(user.uid, 'activation_reached', { planId }).catch(() => null);
  }
  await track(user.uid, 'query_completed', {
    planId,
    taskType: classification.taskType,
    complexity: classification.complexity,
  }).catch(() => null);
  await trackUsageEvents(user.uid, planId, quota.usage, classification);

  const finalUsage = usageView(planId, quota.usage);
  const finalRetention = buildRetention(updatedUser, plan, finalUsage);

  return sendJson(
    res,
    200,
    buildSuccessPayload({
      answer: routed.content,
      conversation: saved,
      plan,
      usage: finalUsage,
      model: routed.model,
      classification,
      attempts: routed.attempts,
      features: plan.features,
      sources,
      retention: finalRetention,
    })
  );
};
