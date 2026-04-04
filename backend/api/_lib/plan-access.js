const { getPaidEntitlement, normalizeEmail } = require('../billing/_entitlements');

const PLAN_ORDER = ['free', 'pro', 'enterprise'];
const DEFAULT_UPGRADE_PLAN = 'pro';
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const PLAN_ALIASES = {
  plus: 'pro',
  business: 'enterprise',
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const FIXED_DAILY_LIMITS = {
  free: 20,
  pro: 150,
  enterprise: 250,
};

function normalizePlanId(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (PLAN_ALIASES[candidate]) return PLAN_ALIASES[candidate];
  return PLAN_ORDER.includes(candidate) ? candidate : 'free';
}

function comparePlanIds(left, right) {
  return PLAN_ORDER.indexOf(normalizePlanId(left)) - PLAN_ORDER.indexOf(normalizePlanId(right));
}

function isPlanAtLeast(planId, minimumPlanId) {
  return comparePlanIds(planId, minimumPlanId) >= 0;
}

function parseEmailList(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

const PLAN_CONFIG = {
  free: {
    id: 'free',
    name: 'Free',
    tierLabel: 'Free',
    description: '20 legal queries per day with standard legal responses, basic reasoning, and community-level access for everyday legal clarity.',
    shortDescription: 'Community legal access',
    routeTier: 'free',
    dailyLimit: FIXED_DAILY_LIMITS.free,
    pricePaise: 0,
    priceDisplay: 'INR 0 / month',
    upgradeTarget: 'pro',
    paymentEnabled: false,
    features: {
      draftMode: false,
      summarizeMode: false,
      researchTool: false,
      predictiveRiskScoring: false,
      exportConversation: false,
      pinConversation: false,
      advancedModelSelection: false,
      premiumLoading: false,
      advancedLegalReasoning: false,
      contractDrafting: false,
      allTools: false,
      voiceConversation: false,
      voicePlayback: false,
      standardLegalResponses: true,
      basicReasoning: true,
      communityAccess: true,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tierLabel: 'Pro',
    description: '150 legal queries per day with predictive risk scoring, advanced legal reasoning, contract drafting tools, priority response speed, and structured legal analysis.',
    shortDescription: 'Premium legal intelligence',
    routeTier: 'pro',
    dailyLimit: FIXED_DAILY_LIMITS.pro,
    pricePaise: parsePositiveInt(process.env.PRO_PLAN_PRICE_PAISE, 89900),
    priceDisplay: 'INR 899 / month',
    priceNote: '+ applicable charges',
    badgeText: 'Most Popular',
    upgradeTarget: 'enterprise',
    paymentEnabled: true,
    features: {
      draftMode: true,
      summarizeMode: true,
      researchTool: true,
      predictiveRiskScoring: true,
      exportConversation: true,
      pinConversation: true,
      advancedModelSelection: true,
      premiumLoading: true,
      advancedLegalReasoning: true,
      contractDrafting: true,
      allTools: true,
      voiceConversation: true,
      voicePlayback: true,
      priorityResponse: true,
      structuredLegalAnalysis: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tierLabel: 'Enterprise',
    description: 'High-priority usage capacity, top-tier models, fastest response priority, advanced legal drafting, structured case-law analysis, bulk query handling, and priority support.',
    shortDescription: 'Enterprise legal intelligence',
    routeTier: 'enterprise',
    dailyLimit: FIXED_DAILY_LIMITS.enterprise,
    pricePaise: 0,
    priceDisplay: 'Contact sales',
    upgradeTarget: 'enterprise',
    paymentEnabled: false,
    features: {
      draftMode: true,
      summarizeMode: true,
      researchTool: true,
      predictiveRiskScoring: true,
      exportConversation: true,
      pinConversation: true,
      advancedModelSelection: true,
      premiumLoading: true,
      advancedLegalReasoning: true,
      contractDrafting: true,
      allTools: true,
      topTierModelsOnly: true,
      fastestResponsePriority: true,
      structuredCaseLawAnalysis: true,
      bulkQueryHandling: true,
      teamAccess: true,
      customWorkflow: true,
      prioritySupport: true,
      voiceConversation: true,
      voicePlayback: true,
    },
  },
};

function getProUpgradeMessage() {
  const proPlan = getPlanConfig('pro');
  return `Upgrade to Lexorium Pro for ${proPlan.dailyLimit} legal queries per day, predictive risk scoring, deeper legal research, contract drafting tools, priority response speed, and structured legal analysis.`;
}

function getPlanConfig(planId) {
  return PLAN_CONFIG[normalizePlanId(planId)] || PLAN_CONFIG.free;
}

function getPlanIdFromUser(user) {
  const planId = normalizePlanId(user?.plan);
  if (planId === 'enterprise') return 'enterprise';
  if (planId === 'free') return 'free';
  const status = String(user?.subscriptionStatus || '').toLowerCase();
  const end = Date.parse(user?.subscriptionEnd || 0);
  return ACTIVE_STATUSES.has(status) && end > Date.now() ? planId : 'free';
}

function getPlanForProfile(profile, req) {
  const email = normalizeEmail(profile?.email);
  const enterpriseUsers = parseEmailList(process.env.ENTERPRISE_USER_EMAILS);
  if (email && enterpriseUsers.has(email)) return 'enterprise';
  const currentPlan = getPlanIdFromUser(profile);
  if (currentPlan !== 'free') return currentPlan;
  const entitlement = req ? getPaidEntitlement(req, profile) : null;
  return entitlement?.plan ? normalizePlanId(entitlement.plan) : 'free';
}

function getPublicPlanSummary(planId) {
  const plan = getPlanConfig(planId);
  return {
    id: plan.id,
    name: plan.name,
    tierLabel: plan.tierLabel,
    description: plan.description,
    shortDescription: plan.shortDescription,
    routeTier: plan.routeTier,
    dailyLimit: plan.dailyLimit,
    unmetered: Boolean(plan.unmetered),
    pricePaise: plan.pricePaise,
    priceDisplay: plan.priceDisplay,
    priceNote: plan.priceNote || '',
    badgeText: plan.badgeText || '',
    upgradeTarget: plan.upgradeTarget,
    features: { ...plan.features },
  };
}

function getPublicPlanCatalog() {
  return PLAN_ORDER.map((planId) => getPublicPlanSummary(planId));
}

function getCheckoutPlan(planId) {
  const plan = getPlanConfig(planId);
  if (!plan.paymentEnabled || plan.id === 'enterprise' || plan.pricePaise <= 0) return null;
  return plan;
}

function getDailyLimit(planId) {
  return getPlanConfig(planId).dailyLimit;
}

function canAccessFeature(planId, featureKey) {
  return Boolean(getPlanConfig(planId).features?.[featureKey]);
}

function getUpgradeTargetPlan(planId) {
  return getPlanConfig(planId).upgradeTarget || DEFAULT_UPGRADE_PLAN;
}

function getUsageWarningState(planId, usage) {
  const plan = getPlanConfig(planId);
  if (plan.unmetered) {
    return {
      showSoftWarning: false,
      showHardLimit: false,
      threshold: null,
    };
  }

  const limit = Number(usage?.limit || plan.dailyLimit || 0);
  const used = Number(usage?.used || 0);
  const remaining = Math.max(limit - used, 0);
  const threshold = Math.max(Math.floor(limit * 0.8), limit - 6);

  return {
    showSoftWarning: planId === 'free' && used >= threshold && remaining > 0,
    showHardLimit: remaining <= 0,
    threshold,
  };
}

function getUsageForPlan(planId, user) {
  const plan = getPlanConfig(planId);
  const used = Number(user?.dailyFreeUsageCount || 0);
  const resetAt = user?.dailyFreeUsageResetAt || null;
  const usageDate = user?.usageDate || null;
  return {
    limit: plan.dailyLimit,
    used,
    remaining: Math.max(plan.dailyLimit - used, 0),
    usageDate,
    resetAt,
    nextResetAt: resetAt,
    warning: getUsageWarningState(planId, { limit: plan.dailyLimit, used }),
  };
}

function getFeatureBlockDetails(featureKey) {
  const proUpgradeMessage = getProUpgradeMessage();
  if (featureKey === 'draftMode') {
    return {
      title: 'Draft Mode is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for contract drafting tools, advanced legal reasoning, and structured legal analysis.',
    };
  }
  if (featureKey === 'summarizeMode') {
    return {
      title: 'Summarise is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for structured legal analysis, cleaner issue spotting, and stronger legal reasoning.',
    };
  }
  if (featureKey === 'researchTool') {
    return {
      title: 'Research Tool is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for deeper legal research workflows, priority response speed, and stronger legal reasoning.',
    };
  }
  if (featureKey === 'predictiveRiskScoring') {
    return {
      title: 'Predictive Risk Scoring is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for predictive risk scoring, advanced legal reasoning, deeper legal research, and structured legal analysis.',
    };
  }
  if (featureKey === 'exportConversation') {
    return {
      title: 'Export is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro to export structured legal responses and unlock the full Pro workspace.',
    };
  }
  return {
    title: 'This feature is available on Lexorium Pro.',
    message: proUpgradeMessage,
  };
}

module.exports = {
  ACTIVE_STATUSES,
  DEFAULT_UPGRADE_PLAN,
  PLAN_CONFIG,
  PLAN_ORDER,
  canAccessFeature,
  comparePlanIds,
  getCheckoutPlan,
  getDailyLimit,
  getFeatureBlockDetails,
  getPlanConfig,
  getPlanForProfile,
  getPlanIdFromUser,
  getPublicPlanCatalog,
  getPublicPlanSummary,
  getProUpgradeMessage,
  getUpgradeTargetPlan,
  getUsageWarningState,
  getUsageForPlan,
  isPlanAtLeast,
  normalizePlanId,
};
