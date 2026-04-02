const crypto = require('crypto');

const API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';

function hasRealValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^your_/i.test(normalized) && !/xxxxx/i.test(normalized);
}

function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID || process.env.APP_ID || process.env.RAZORPAY_KEY_ID || '';
  const secret = process.env.CASHFREE_SECRET_KEY || process.env.SECRET_KEY || process.env.RAZORPAY_KEY_SECRET || '';
  const mode = String(process.env.CASHFREE_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  return {
    appId,
    secret,
    mode,
    baseUrl: mode === 'sandbox' ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg',
    enabled: hasRealValue(appId) && hasRealValue(secret),
  };
}

function createHeaders(config) {
  return {
    'x-client-id': config.appId,
    'x-client-secret': config.secret,
    'x-api-version': API_VERSION,
    'Content-Type': 'application/json',
  };
}

async function fetchOrder(config, orderId) {
  const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
    headers: createHeaders(config),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function verifyWebhookSignature(rawBody, timestamp, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(String(timestamp || '') + String(rawBody || ''))
    .digest('base64');
  return expected === signature;
}

module.exports = {
  createHeaders,
  fetchOrder,
  getCashfreeConfig,
  hasRealValue,
  verifyWebhookSignature,
};
