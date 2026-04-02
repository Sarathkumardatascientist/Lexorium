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
    description: 'Everyday legal answers with a faster response stack and a light daily cap for individual users getting started.',
    shortDescription: 'Fast legal intelligence',
    routeTier: 'free',
    dailyLimit: parsePositiveInt(process.env.FREE_DAILY_LIMIT, 30),
    pricePaise: 0,
    priceDisplay: 'Free',
    upgradeTarget: 'pro',
    paymentEnabled: false,
    features: {
      draftMode: false,
      summarizeMode: false,
      researchTool: false,
      exportConversation: false,
      pinConversation: false,
      advancedModelSelection: false,
      premiumLoading: false,
      advancedLegalReasoning: false,
      contractDrafting: false,
      allTools: false,
      voiceConversation: false,
      voicePlayback: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tierLabel: 'Pro',
    description: 'Premium legal reasoning, contract drafting, and the full Lexorium toolset with stronger multi-model routing for legal professionals.',
    shortDescription: 'Premium legal intelligence',
    routeTier: 'pro',
    dailyLimit: parsePositiveInt(process.env.PRO_DAILY_LIMIT, 500),
    pricePaise: parsePositiveInt(process.env.PRO_PLAN_PRICE_PAISE, 79900),
    priceDisplay: 'INR 799 / month',
    upgradeTarget: 'enterprise',
    paymentEnabled: true,
    features: {
      draftMode: true,
      summarizeMode: true,
      researchTool: true,
      exportConversation: true,
      pinConversation: true,
      advancedModelSelection: true,
      premiumLoading: true,
      advancedLegalReasoning: true,
      contractDrafting: true,
      allTools: true,
      voiceConversation: true,
      voicePlayback: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tierLabel: 'Enterprise',
    description: 'Custom enterprise rollout with frontier multi-model routing, unlimited queries, team access, workflow design, and commercial onboarding.',
    shortDescription: 'Enterprise legal intelligence',
    routeTier: 'enterprise',
    dailyLimit: parsePositiveInt(process.env.ENTERPRISE_DAILY_LIMIT, 100000),
    unmetered: true,
    pricePaise: 0,
    priceDisplay: 'Contact sales',
    upgradeTarget: 'enterprise',
    paymentEnabled: false,
    features: {
      draftMode: true,
      summarizeMode: true,
      researchTool: true,
      exportConversation: true,
      pinConversation: true,
      advancedModelSelection: true,
      premiumLoading: true,
      advancedLegalReasoning: true,
      contractDrafting: true,
      allTools: true,
      teamAccess: true,
      customWorkflow: true,
      prioritySupport: true,
      voiceConversation: true,
      voicePlayback: true,
    },
  },
};

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

function getFeatureBlockDetails(featureKey) {
  if (featureKey === 'draftMode') {
    return {
      title: 'Draft Mode is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for contract drafting, structured legal drafting, and stronger document-ready output.',
    };
  }
  if (featureKey === 'summarizeMode') {
    return {
      title: 'Summarise is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for structured summarisation, cleaner issue spotting, and stronger legal reasoning.',
    };
  }
  if (featureKey === 'researchTool') {
    return {
      title: 'Research Tool is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro for deeper legal research workflows and full Lexorium tool access.',
    };
  }
  if (featureKey === 'exportConversation') {
    return {
      title: 'Export is available on Lexorium Pro.',
      message: 'Upgrade to Lexorium Pro to export structured legal responses in document-ready formats.',
    };
  }
  return {
    title: 'This feature is available on Lexorium Pro.',
    message: 'Upgrade to Lexorium Pro for advanced legal reasoning, contract drafting, and the full Lexorium toolset.',
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
  getUpgradeTargetPlan,
  getUsageWarningState,
  isPlanAtLeast,
  normalizePlanId,
};
