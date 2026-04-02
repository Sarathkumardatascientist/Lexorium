const { getFeatureBlockDetails, getPlanConfig } = require('./plan-access');
const { findModelsById, getModelsForTier } = require('./model-registry');

const FREE_FAST_ORDER = [
  'google/gemini-3.1-flash-lite-preview',
  'qwen/qwen3.5-flash-02-23',
  'qwen/qwen3.6-plus-preview:free',
  'qwen/qwen3.5-397b-a17b',
];

const FREE_REASONING_ORDER = [
  'qwen/qwen3.6-plus-preview:free',
  'google/gemini-3.1-flash-lite-preview',
  'qwen/qwen3.5-397b-a17b',
  'qwen/qwen3.5-flash-02-23',
];

const PRO_FAST_ORDER = [
  'openai/gpt-5.4-mini',
  'google/gemini-3.1-flash-lite-preview',
  'anthropic/claude-sonnet-4-6',
  'qwen/qwen3.5-397b-a17b',
];

const PRO_REASONING_ORDER = [
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-5.4',
  'google/gemini-3.1-pro-preview',
  'qwen/qwen3.5-397b-a17b',
  'openai/gpt-5.4-mini',
];

const PRO_DRAFTING_ORDER = [
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-5.4',
  'google/gemini-3.1-pro-preview',
  'qwen/qwen3.5-397b-a17b',
];

const ENTERPRISE_MULTI_PASS_ORDER = [
  'openai/gpt-5.4-pro',
  'anthropic/claude-sonnet-4-6',
  'google/gemini-3.1-pro-preview',
  'openai/gpt-5.4',
];

const TASK_PREFERENCES = {
  free: {
    legal_reasoning: FREE_REASONING_ORDER,
    bare_act_or_provision_explanation: FREE_REASONING_ORDER,
    doctrine_explanation: FREE_REASONING_ORDER,
    case_law_style_analysis: FREE_REASONING_ORDER,
    document_analysis: FREE_REASONING_ORDER,
    legal_research: FREE_REASONING_ORDER,
    compliance_checklist: FREE_REASONING_ORDER,
    legal_drafting: FREE_REASONING_ORDER,
    summarization: FREE_FAST_ORDER,
    comparison: FREE_REASONING_ORDER,
    translation_of_legal_text: FREE_FAST_ORDER,
    quick_qa: FREE_FAST_ORDER,
  },
  pro: {
    legal_reasoning: PRO_REASONING_ORDER,
    bare_act_or_provision_explanation: PRO_REASONING_ORDER,
    doctrine_explanation: PRO_REASONING_ORDER,
    case_law_style_analysis: PRO_REASONING_ORDER,
    document_analysis: PRO_REASONING_ORDER,
    legal_research: PRO_REASONING_ORDER,
    compliance_checklist: PRO_REASONING_ORDER,
    legal_drafting: PRO_DRAFTING_ORDER,
    summarization: PRO_FAST_ORDER,
    comparison: PRO_REASONING_ORDER,
    translation_of_legal_text: PRO_FAST_ORDER,
    quick_qa: PRO_FAST_ORDER,
  },
  enterprise: {
    legal_reasoning: ENTERPRISE_MULTI_PASS_ORDER,
    bare_act_or_provision_explanation: ENTERPRISE_MULTI_PASS_ORDER,
    doctrine_explanation: ENTERPRISE_MULTI_PASS_ORDER,
    case_law_style_analysis: ENTERPRISE_MULTI_PASS_ORDER,
    document_analysis: ENTERPRISE_MULTI_PASS_ORDER,
    legal_research: ENTERPRISE_MULTI_PASS_ORDER,
    compliance_checklist: ENTERPRISE_MULTI_PASS_ORDER,
    legal_drafting: ENTERPRISE_MULTI_PASS_ORDER,
    summarization: ENTERPRISE_MULTI_PASS_ORDER,
    comparison: ENTERPRISE_MULTI_PASS_ORDER,
    translation_of_legal_text: ENTERPRISE_MULTI_PASS_ORDER,
    quick_qa: ENTERPRISE_MULTI_PASS_ORDER,
  },
};

function scoreModel(model, classification) {
  let score = 100;
  score -= (model.legalReasoningScore || 0) * (classification.requiresStrongReasoning ? 6 : 2);
  score -= (model.structureScore || 0) * (classification.prefersStructuredOutput ? 4 : 1);
  score -= (model.speedScore || 0) * (classification.acceptsFastResponse ? 3 : 1);
  score += (model.priority || 0) * 2;
  score += (model.fallbackPriority || 0);
  if (Array.isArray(model.useCases) && model.useCases.includes(classification.taskType)) score -= 14;
  return score;
}

function sortFallbacks(models, classification) {
  return models
    .slice()
    .sort((left, right) => scoreModel(left, classification) - scoreModel(right, classification));
}

function uniqueById(models) {
  const seen = new Set();
  return models.filter((model) => {
    if (!model || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function getAttemptLimit(routingTier) {
  const defaultLimit = {
    free: 2,
    pro: 2,
    enterprise: 3,
  }[routingTier] || 2;
  const configured = Number.parseInt(process.env.LEXORIUM_MAX_ROUTE_ATTEMPTS || String(defaultLimit), 10) || defaultLimit;
  return Math.max(configured, defaultLimit);
}

function routeModel(options) {
  const plan = getPlanConfig(options?.planId);
  const classification = options?.classification || { taskType: 'legal_reasoning', complexity: 'moderate' };
  const routingTier = plan.routeTier;
  const requestedModelId = String(options?.requestedModelId || '').trim();
  const maxAttempts = getAttemptLimit(routingTier);
  const accessibleModels = getModelsForTier(routingTier);
  const preferredIds = TASK_PREFERENCES[routingTier]?.[classification.taskType] || TASK_PREFERENCES[routingTier]?.legal_reasoning || [];
  const strategy = routingTier === 'enterprise' ? 'multi_pass' : 'single';

  if (classification.requiredFeature && !plan.features?.[classification.requiredFeature]) {
    return {
      blocked: true,
      type: 'upgrade_required',
      code: 'UPGRADE_REQUIRED',
      feature: classification.requiredFeature,
      requiredPlan: plan.upgradeTarget || 'pro',
      ...getFeatureBlockDetails(classification.requiredFeature),
    };
  }

  if (requestedModelId) {
    const requested = findModelsById(requestedModelId);
    if (!requested.length) {
      const fallbacks = sortFallbacks(accessibleModels, classification);
      return {
        blocked: false,
        planId: plan.id,
        routingTier,
        strategy,
        orderedModels: uniqueById(fallbacks).slice(0, maxAttempts),
        selectedModel: fallbacks[0] || null,
        requestedModel: null,
      };
    }
    const allowed = requested.find((model) => model.tier === routingTier);
    if (!allowed) {
      const requestedPlan = requested[0]?.tier || routingTier;
      return {
        blocked: true,
        type: 'upgrade_required',
        code: 'UPGRADE_REQUIRED',
        message: 'This model is available on a higher Lexorium plan.',
        title: 'Premium model locked',
        requiredPlan: requestedPlan,
      };
    }
    const fallbacks = sortFallbacks(accessibleModels.filter((model) => model.id !== allowed.id), classification);
    return {
      blocked: false,
      planId: plan.id,
      routingTier,
      strategy,
      orderedModels: uniqueById([allowed, ...fallbacks]).slice(0, maxAttempts),
      selectedModel: allowed,
      requestedModel: allowed.id,
    };
  }

  const preferred = preferredIds
    .map((id) => accessibleModels.find((model) => model.id === id))
    .filter(Boolean);
  const fallbacks = sortFallbacks(
    accessibleModels.filter((model) => !preferred.some((preferredModel) => preferredModel.id === model.id)),
    classification
  );
  const orderedModels = uniqueById([...preferred, ...fallbacks]).slice(0, maxAttempts);

  return {
    blocked: false,
    planId: plan.id,
    routingTier,
    strategy,
    orderedModels,
    selectedModel: orderedModels[0] || null,
    requestedModel: null,
  };
}

module.exports = {
  routeModel,
};
