const crypto = require('crypto');

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PLAY_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const GOOGLE_PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

let cachedToken = null;

function hasRealValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^your_/i.test(normalized) && !/xxxxx/i.test(normalized);
}

function normalizePrivateKey(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

function getGooglePlayConfig() {
  const serviceAccountEmail = String(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL
    || process.env.GOOGLE_PLAY_DEVELOPER_SERVICE_ACCOUNT_EMAIL
    || ''
  ).trim();
  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY
    || process.env.GOOGLE_PLAY_DEVELOPER_SERVICE_ACCOUNT_PRIVATE_KEY
    || ''
  );
  const privateKeyId = String(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_ID
    || process.env.GOOGLE_PLAY_DEVELOPER_SERVICE_ACCOUNT_PRIVATE_KEY_ID
    || ''
  ).trim();
  const packageName = String(
    process.env.GOOGLE_PLAY_PACKAGE_NAME
    || process.env.ANDROID_APPLICATION_ID
    || 'ai.sprezzatura.lexorium'
  ).trim();
  const proSubscriptionId = String(
    process.env.GOOGLE_PLAY_PRO_SUBSCRIPTION_ID
    || process.env.ANDROID_PRO_SUBSCRIPTION_ID
    || 'lexorium_pro_monthly'
  ).trim();

  return {
    serviceAccountEmail,
    privateKey,
    privateKeyId,
    packageName,
    proSubscriptionId,
    enabled:
      hasRealValue(serviceAccountEmail)
      && hasRealValue(privateKey)
      && hasRealValue(packageName)
      && hasRealValue(proSubscriptionId),
  };
}

function encodeBase64UrlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

async function requestGooglePlayAccessToken(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  if (config.privateKeyId) header.kid = config.privateKeyId;
  const claimSet = {
    iss: config.serviceAccountEmail,
    scope: GOOGLE_PLAY_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsignedJwt = `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(claimSet)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(config.privateKey).toString('base64url');
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'Could not authorize the Google Play Developer API.');
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Math.max(Number(data.expires_in || 3600) - 60, 60) * 1000),
  };

  return cachedToken.accessToken;
}

async function getGooglePlayAccessToken(config) {
  if (cachedToken?.accessToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  return requestGooglePlayAccessToken(config);
}

async function fetchGooglePlaySubscription(config, accessToken, purchaseToken) {
  const response = await fetch(
    `${GOOGLE_PLAY_API_BASE}/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function acknowledgeGooglePlaySubscription(config, accessToken, purchaseToken, subscriptionId, developerPayload) {
  const response = await fetch(
    `${GOOGLE_PLAY_API_BASE}/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptions/${encodeURIComponent(subscriptionId || config.proSubscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        developerPayload: String(developerPayload || '').trim() || undefined,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function getPrimaryLineItem(subscriptionData, productId) {
  const lineItems = Array.isArray(subscriptionData?.lineItems) ? subscriptionData.lineItems : [];
  return lineItems.find((item) => String(item?.productId || '').trim() === String(productId || '').trim()) || lineItems[0] || null;
}

function getSubscriptionState(subscriptionData) {
  return String(subscriptionData?.subscriptionState || '').trim().toUpperCase();
}

function isAcknowledged(subscriptionData) {
  return String(subscriptionData?.acknowledgementState || '').trim().toUpperCase().includes('ACKNOWLEDGED');
}

function grantsEntitlement(subscriptionState, expiryTime) {
  const state = String(subscriptionState || '').trim().toUpperCase();
  if (state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
    return true;
  }
  if (state === 'SUBSCRIPTION_STATE_CANCELED' && expiryTime) {
    return Date.parse(expiryTime) > Date.now();
  }
  return false;
}

module.exports = {
  acknowledgeGooglePlaySubscription,
  fetchGooglePlaySubscription,
  getGooglePlayAccessToken,
  getGooglePlayConfig,
  getPrimaryLineItem,
  getSubscriptionState,
  grantsEntitlement,
  hasRealValue,
  isAcknowledged,
};
