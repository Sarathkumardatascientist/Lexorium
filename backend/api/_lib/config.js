function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPublicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getPublicFirebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_PUBLIC_API_KEY || '',
    authDomain: process.env.FIREBASE_PUBLIC_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PUBLIC_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_PUBLIC_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_PUBLIC_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_PUBLIC_APP_ID || '',
  };
}

function getModelSettings() {
  return {
    free: {
      primary: process.env.LEXORIUM_MODEL_FREE_PRIMARY || process.env.LEXORIUM_MODEL_FREE_DEFAULT || 'google/gemini-3.1-flash-lite-preview',
      default: process.env.LEXORIUM_MODEL_FREE_DEFAULT || 'google/gemini-3.1-flash-lite-preview',
      fallback: process.env.LEXORIUM_MODEL_FREE_FALLBACK || 'qwen/qwen3.6-plus-preview:free',
      fast: process.env.LEXORIUM_MODEL_FREE_FAST || process.env.LEXORIUM_MODEL_FREE_DEFAULT || 'google/gemini-3.1-flash-lite-preview',
      long: process.env.LEXORIUM_MODEL_FREE_LONG || process.env.LEXORIUM_MODEL_FREE_FALLBACK || 'qwen/qwen3.6-plus-preview:free',
      analyse: process.env.LEXORIUM_MODEL_FREE_ANALYSE || process.env.LEXORIUM_MODEL_FREE_LONG || 'qwen/qwen3.6-plus-preview:free',
      research: process.env.LEXORIUM_MODEL_FREE_RESEARCH || process.env.LEXORIUM_MODEL_FREE_LONG || 'qwen/qwen3.6-plus-preview:free',
    },
    pro: {
      default: process.env.LEXORIUM_MODEL_PRO_DEFAULT || 'anthropic/claude-sonnet-4-6',
      reasoning: process.env.LEXORIUM_MODEL_PRO_REASONING || 'openai/gpt-5.4',
      advanced: process.env.LEXORIUM_MODEL_PRO_ADVANCED || 'google/gemini-3.1-pro-preview',
      draft: process.env.LEXORIUM_MODEL_PRO_DRAFT || 'anthropic/claude-sonnet-4-6',
      analyse: process.env.LEXORIUM_MODEL_PRO_ANALYSE || process.env.LEXORIUM_MODEL_PRO_ADVANCED || 'google/gemini-3.1-pro-preview',
      research: process.env.LEXORIUM_MODEL_PRO_RESEARCH || process.env.LEXORIUM_MODEL_PRO_REASONING || 'openai/gpt-5.4',
      fast: process.env.LEXORIUM_MODEL_PRO_FAST || 'openai/gpt-5.4-mini',
    },
    enterprise: {
      default: process.env.LEXORIUM_MODEL_ENTERPRISE_DEFAULT || 'openai/gpt-5.4-pro',
      advanced: process.env.LEXORIUM_MODEL_ENTERPRISE_ADVANCED || 'anthropic/claude-sonnet-4-6',
      multiPass: [
        process.env.LEXORIUM_MODEL_ENTERPRISE_PASS_1 || 'openai/gpt-5.4-pro',
        process.env.LEXORIUM_MODEL_ENTERPRISE_PASS_2 || 'anthropic/claude-sonnet-4-6',
        process.env.LEXORIUM_MODEL_ENTERPRISE_PASS_3 || 'google/gemini-3.1-pro-preview',
        process.env.LEXORIUM_MODEL_ENTERPRISE_PASS_4 || 'openai/gpt-5.4',
      ].filter(Boolean),
    },
  };
}

module.exports = {
  CONTACT_SALES_EMAIL: process.env.CONTACT_SALES_EMAIL || 'sales@lexorium.com',
  FREE_DAILY_LIMIT: parsePositiveInt(process.env.FREE_DAILY_LIMIT, 30),
  PRO_PLAN_DURATION_DAYS: parsePositiveInt(process.env.PRO_PLAN_DURATION_DAYS, 30),
  PRO_PLAN_PRICE_PAISE: parsePositiveInt(process.env.PRO_PLAN_PRICE_PAISE, 79900),
  PUBLIC_APP_URL: getPublicAppUrl(),
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  getModelSettings,
  getPublicFirebaseConfig,
  parsePositiveInt,
};
