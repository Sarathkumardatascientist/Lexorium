const crypto = require('crypto');
const { createExpiredCookie, createSignedCookie, getSignedCookie } = require('../auth/_session');

const PLAN_COOKIE_NAME = 'lexorium_plan';
const PLAN_IDS = new Set(['free', 'pro', 'enterprise']);
const PLAN_ALIASES = {
  plus: 'pro',
  business: 'enterprise',
};

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePlanId(value) {
  const planId = String(value || '').trim().toLowerCase();
  if (PLAN_ALIASES[planId]) return PLAN_ALIASES[planId];
  return PLAN_IDS.has(planId) ? planId : 'free';
}

function getPlanDurationDays() {
  const parsed = Number.parseInt(process.env.PLAN_DURATION_DAYS || process.env.PRO_PLAN_DURATION_DAYS || '30', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function getPlanDurationMs() {
  return getPlanDurationDays() * 24 * 60 * 60 * 1000;
}

function createRazorpayAuthHeaders() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured on the server.');
  }

  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/json',
  };
}

function getPaidEntitlement(req, profile) {
  const payload = getSignedCookie(req, PLAN_COOKIE_NAME);
  const planId = normalizePlanId(payload?.plan);
  if (!payload || planId === 'free') return null;
  if (!payload.email || normalizeEmail(payload.email) !== normalizeEmail(profile?.email)) return null;
  if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) return null;
  return { ...payload, plan: planId };
}

function issuePlanEntitlementCookie(profile, planId, payment) {
  const expiresAt = Date.now() + getPlanDurationMs();
  return createSignedCookie(
    PLAN_COOKIE_NAME,
    {
      plan: normalizePlanId(planId),
      email: normalizeEmail(profile?.email),
      paymentId: payment?.paymentId || '',
      orderId: payment?.orderId || '',
      expiresAt,
      issuedAt: Date.now(),
    },
    Math.ceil(getPlanDurationMs() / 1000)
  );
}

function issueProEntitlementCookie(profile, payment) {
  return issuePlanEntitlementCookie(profile, 'pro', payment);
}

function clearPlanCookie() {
  return createExpiredCookie(PLAN_COOKIE_NAME);
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!secret) {
    throw new Error('Razorpay is not configured on the server.');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expected.length !== String(signature || '').length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || '')));
}

module.exports = {
  clearPlanCookie,
  createRazorpayAuthHeaders,
  getPaidEntitlement,
  getPlanDurationDays,
  issuePlanEntitlementCookie,
  issueProEntitlementCookie,
  normalizeEmail,
  verifyRazorpaySignature,
};
