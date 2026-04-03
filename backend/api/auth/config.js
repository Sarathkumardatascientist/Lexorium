const { sendJson } = require('../_lib/http');
const { getGooglePlayConfig } = require('../billing/_google-play');
const { getModelSettings } = require('../_lib/config');
const { buildPublicModelCatalog, getTierModelCounts } = require('../_lib/model-registry');
const { getPublicPlanCatalog } = require('../_lib/plan-access');
const { hasEnterpriseGoogleFormConfig } = require('../_lib/enterprise-google-form');

function hasRealValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^your_/i.test(normalized) && !/xxxxx/i.test(normalized);
}

const FIXED_DAILY_LIMITS = {
  free: 20,
  pro: 150,
  enterprise: 250,
};

module.exports = async (_req, res) => {
  const paymentProvider = String(process.env.PAYMENT_PROVIDER || 'cashfree').toLowerCase();
  const paymentAppId = String(process.env.CASHFREE_APP_ID || process.env.APP_ID || process.env.RAZORPAY_KEY_ID || '').trim();
  const paymentSecret = String(process.env.CASHFREE_SECRET_KEY || process.env.SECRET_KEY || process.env.RAZORPAY_KEY_SECRET || '').trim();
  const paymentEnabled = hasRealValue(paymentAppId) && hasRealValue(paymentSecret);
  const cashfreeMode = String(process.env.CASHFREE_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const enterpriseLeadConfigured = hasEnterpriseGoogleFormConfig();
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || '').trim();
  const cashfreeWebhookUrl = publicAppUrl ? `${publicAppUrl.replace(/\/+$/, '')}/api/billing/webhook` : '/api/billing/webhook';
  const googlePlay = getGooglePlayConfig();

  return sendJson(res, 200, {
    authProvider: 'puter',
    puterEnabled: true,
    paymentProvider,
    paymentEnabled,
    paymentPublicKey: paymentAppId,
    cashfreeMode,
    razorpayEnabled: paymentEnabled,
    razorpayKeyId: paymentAppId,
    freeDailyLimit: FIXED_DAILY_LIMITS.free,
    proDailyLimit: FIXED_DAILY_LIMITS.pro,
    enterpriseDailyLimit: FIXED_DAILY_LIMITS.enterprise,
    proPlanPricePaise: Number.parseInt(process.env.PRO_PLAN_PRICE_PAISE || '89900', 10) || 89900,
    planDurationDays: Number.parseInt(process.env.PLAN_DURATION_DAYS || process.env.PRO_PLAN_DURATION_DAYS || '30', 10) || 30,
    contactSalesEmail: String(process.env.CONTACT_SALES_EMAIL || 'aisprezzatura@gmail.com').trim(),
    desktopDownloadUrl: String(process.env.LEXORIUM_DESKTOP_DOWNLOAD_URL || '/api/download/desktop').trim() || '/api/download/desktop',
    cashfreeWebhookUrl,
    playBillingEnabled: googlePlay.enabled,
    androidPackageName: googlePlay.packageName,
    androidProSubscriptionId: googlePlay.proSubscriptionId,
    enterpriseLeadConfigured,
    plans: getPublicPlanCatalog(),
    modelCatalog: buildPublicModelCatalog(),
    modelCounts: getTierModelCounts(),
    modelSettings: getModelSettings(),
  });
};
