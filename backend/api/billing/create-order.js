const { getSessionFromRequest } = require('../auth/_session');
const store = require('../_lib/store');
const { getUser, recordCheckoutIntent, track, updateUserProfile } = store;
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { createHeaders, getCashfreeConfig } = require('./_cashfree');
const { comparePlanIds, getCheckoutPlan, getPlanForProfile } = require('../_lib/plan-access');

function isLocalHostname(hostname) {
  return /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)$/i.test(String(hostname || '').trim());
}

function parseOrigin(value) {
  try {
    return new URL(String(value || '').trim());
  } catch (_error) {
    return null;
  }
}

function resolveReturnBase(req, cashfreeMode) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim();
  const envBase = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http');
  const requestUrl = host ? parseOrigin(`${protocol}://${host}`) : null;
  const envUrl = parseOrigin(envBase);
  const productionCheckout = String(cashfreeMode || '').toLowerCase() === 'production';

  if (productionCheckout) {
    const securePublicUrl = [requestUrl, envUrl].find((candidate) => (
      candidate
      && candidate.protocol === 'https:'
      && !isLocalHostname(candidate.hostname)
    ));

    if (!securePublicUrl) {
      const error = new Error('Cashfree production checkout requires PUBLIC_APP_URL to be a public HTTPS app URL. Set PUBLIC_APP_URL=https://lexoriumai.com and restart the server.');
      error.statusCode = 400;
      throw error;
    }
    return securePublicUrl.origin;
  }

  if (requestUrl) return requestUrl.origin;
  if (envUrl) return envUrl.origin;
  return 'http://localhost:3000';
}

function toCashfreeCustomerId(uid) {
  const cleaned = String(uid || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^-+|-+$/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  if (cleaned) return cleaned;
  return `lexorium_${Date.now()}`;
}

function normalizeCustomerPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return '';
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required before checkout.');

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 401, 'User record not found.');

  const body = await parseJsonBody(req).catch(() => ({}));
  const requestedPlan = String(body.plan || 'pro').trim().toLowerCase();
  const checkoutPlan = getCheckoutPlan(requestedPlan);
  if (!checkoutPlan) return sendError(res, 400, 'This plan is not available for self-serve checkout.');

  const currentPlanId = getPlanForProfile(user, req);
  if (currentPlanId === checkoutPlan.id) {
    return sendError(res, 400, `${checkoutPlan.name} is already active on this account.`);
  }
  if (comparePlanIds(currentPlanId, checkoutPlan.id) > 0) {
    return sendError(res, 400, `This account already has a higher plan than ${checkoutPlan.name}.`);
  }

  const cashfree = getCashfreeConfig();
  if (!cashfree.enabled) return sendError(res, 500, 'Payment gateway is not configured.');

  await track(user.uid, 'checkout_started', {
    source: body.source || 'pricing',
    provider: 'cashfree',
    planId: checkoutPlan.id,
  }).catch(() => null);

  let returnBase;
  try {
    returnBase = resolveReturnBase(req, cashfree.mode);
  } catch (error) {
    return sendError(res, error.statusCode || 400, error.message || 'A valid return URL could not be prepared for checkout.');
  }
  const orderId = `lexorium-${checkoutPlan.id}-${Date.now()}`;
  const customerPhone = normalizeCustomerPhone(body.customerPhone || body.phone || user.phone || '');
  if (!customerPhone) {
    return sendError(res, 400, 'Enter a valid 10-digit mobile number to continue checkout.');
  }

  const customerName = String(body.customerName || user.name || user.email || 'Lexorium User').trim();
  const profileUpdates = {};
  if (customerPhone !== String(user.phone || '')) profileUpdates.phone = customerPhone;
  if (body.customerName && customerName !== String(user.name || '')) profileUpdates.name = customerName;

  if (updateUserProfile && Object.keys(profileUpdates).length > 0) {
    await updateUserProfile(user.uid, profileUpdates).catch(() => null);
  }

  const cashfreeCustomerId = toCashfreeCustomerId(user.uid);

  const upstream = await fetch(`${cashfree.baseUrl}/orders`, {
    method: 'POST',
    headers: createHeaders(cashfree),
    body: JSON.stringify({
      order_id: orderId,
      order_amount: Number((checkoutPlan.pricePaise / 100).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: cashfreeCustomerId,
        customer_name: customerName,
        customer_email: user.email,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${returnBase}/app.html?cashfree_order_id={order_id}&plan=${checkoutPlan.id}`,
      },
      order_note: `Lexorium ${checkoutPlan.name}`,
      order_tags: {
        uid: user.uid,
        email: user.email,
        plan: checkoutPlan.id,
      },
    }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return sendError(res, upstream.status, data?.message || data?.error || 'Failed to create payment order.');
  }

  await recordCheckoutIntent(user.uid, checkoutPlan.id, {
    provider: 'cashfree',
    orderId: data.order_id,
    paymentSessionId: data.payment_session_id,
    status: 'initiated',
    amountPaise: checkoutPlan.pricePaise,
    currency: data.order_currency || 'INR',
    customerPhone,
    raw: data,
  }).catch(() => null);

  return sendJson(res, 200, {
    ok: true,
    provider: 'cashfree',
    plan: { id: checkoutPlan.id, name: checkoutPlan.name },
    orderId: data.order_id,
    amount: data.order_amount,
    currency: data.order_currency,
    paymentSessionId: data.payment_session_id,
    cashfreeMode: cashfree.mode,
    profile: {
      name: user.name,
      email: user.email,
      phone: customerPhone,
    },
  });
};
