const {
  canAccessFeature,
  getCheckoutPlan,
  getDailyLimit,
  getPlanConfig,
  getPlanForProfile,
  getPublicPlanCatalog,
  getPublicPlanSummary,
  getUsageWarningState,
  normalizePlanId,
} = require('../_lib/plan-access');
const { findModelsById } = require('../_lib/model-registry');

function getFreeDailyLimit() {
  return getDailyLimit('free');
}

function resolveModelForPlan(planId, requestedModel) {
  const routeTier = getPlanConfig(planId).routeTier;
  const value = String(requestedModel || '').trim();
  if (!value) return '';
  const allowed = findModelsById(value).find((model) => model.tier === routeTier);
  return allowed ? allowed.id : '';
}

module.exports = {
  canAccessFeature,
  getCheckoutPlan,
  getFreeDailyLimit,
  getPlanConfig,
  getPlanForProfile,
  getPublicPlanCatalog,
  getPublicPlanSummary,
  getUsageWarningState,
  normalizePlanId,
  resolveModelForPlan,
};
