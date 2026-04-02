const { sendJson } = require('../_lib/http');
const { getModelSettings } = require('../_lib/config');
const { buildPublicModelCatalog, getTierModelCounts } = require('../_lib/model-registry');
const { getPublicPlanCatalog } = require('../_lib/plan-access');
const { hasEnterpriseGoogleFormConfig } = require('../_lib/enterprise-google-form');

function hasRealValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^your_/i.test(normalized) && !/xxxxx/i.test(normalized);
}

module.exports = async (_req, res) => {
  const paymentProvider = String(process.env.PAYMENT_PROVIDER || 'cashfree').toLowerCase();
  const paymentAppId = process.env.CASHFREE_APP_ID || process.env.APP_ID || process.env.RAZORPAY_KEY_ID || '';
  const paymentSecret = process.env.CASHFREE_SECRET_KEY || process.env.SECRET_KEY || process.env.RAZORPAY_KEY_SECRET || '';
  const paymentEnabled = hasRealValue(paymentAppId) && hasRealValue(paymentSecret);
  const cashfreeMode = String(process.env.CASHFREE_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const enterpriseLeadConfigured = hasEnterpriseGoogleFormConfig();

  return sendJson(res, 200, {
    authProvider: 'puter',
    puterEnabled: true,
    paymentProvider,
    paymentEnabled,
    paymentPublicKey: paymentAppId,
    cashfreeMode,
    razorpayEnabled: paymentEnabled,
    razorpayKeyId: paymentAppId,
    freeDailyLimit: Number.parseInt(process.env.FREE_DAILY_LIMIT || '30', 10) || 30,
    proDailyLimit: Number.parseInt(process.env.PRO_DAILY_LIMIT || '500', 10) || 500,
    enterpriseDailyLimit: Number.parseInt(process.env.ENTERPRISE_DAILY_LIMIT || '100000', 10) || 100000,
    proPlanPricePaise: Number.parseInt(process.env.PRO_PLAN_PRICE_PAISE || '79900', 10) || 79900,
    planDurationDays: Number.parseInt(process.env.PLAN_DURATION_DAYS || process.env.PRO_PLAN_DURATION_DAYS || '30', 10) || 30,
    contactSalesEmail: process.env.CONTACT_SALES_EMAIL || 'aisprezzatura@gmail.com',
    desktopDownloadUrl: process.env.LEXORIUM_DESKTOP_DOWNLOAD_URL || '',
    enterpriseLeadConfigured,
    plans: getPublicPlanCatalog(),
    modelCatalog: buildPublicModelCatalog(),
    modelCounts: getTierModelCounts(),
    modelSettings: getModelSettings(),
  });
};
