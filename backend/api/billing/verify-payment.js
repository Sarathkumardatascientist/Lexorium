const { getSessionFromRequest } = require('../auth/_session');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { activatePaidPlan, getUser, track } = store;
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { fetchOrder, getCashfreeConfig } = require('./_cashfree');
const { getCheckoutPlan, getPublicPlanSummary } = require('../_lib/plan-access');
const { issuePlanEntitlementCookie, normalizeEmail } = require('./_entitlements');

const PAYMENT_READY_STATUSES = new Set(['PAID']);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPaidOrderWithRetries(cashfree, orderId, attempts = 6, delayMs = 1500) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetchOrder(cashfree, orderId);
    last = result;
    const status = String(result?.data?.order_status || '').toUpperCase();
    if (result?.response?.ok && PAYMENT_READY_STATUSES.has(status)) {
      return result;
    }
    const shouldRetry = attempt < attempts - 1 && (
      (result?.response?.ok && !PAYMENT_READY_STATUSES.has(status))
      || Number(result?.response?.status || 0) >= 500
    );
    if (!shouldRetry) break;
    await wait(delayMs);
  }
  return last || { response: { ok: false, status: 500 }, data: {} };
}

function orderBelongsToUser(order, user) {
  const expectedUid = String(user?.uid || '').trim();
  const expectedEmail = normalizeEmail(user?.email);
  const orderUid = String(order?.order_tags?.uid || order?.customer_details?.customer_id || '').trim();
  const orderEmail = normalizeEmail(order?.order_tags?.email || order?.customer_details?.customer_email || '');
  return Boolean(
    (expectedUid && orderUid && expectedUid === orderUid)
    || (expectedEmail && orderEmail && expectedEmail === orderEmail)
  );
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const session = getSessionFromRequest(req);
  if (!session) return sendError(res, 401, 'Sign in is required before verifying payment.');

  const cashfree = getCashfreeConfig();
  if (!cashfree.enabled) return sendError(res, 500, 'Payment gateway is not configured.');

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const orderId = String(body.orderId || body.cashfree_order_id || body.order_id || '').trim();
  if (!orderId) return sendError(res, 400, 'Missing Cashfree order id.');

  const { response, data } = await fetchPaidOrderWithRetries(cashfree, orderId);
  if (!response.ok) {
    return sendError(res, response.status, data?.message || data?.error || 'Payment could not be confirmed.');
  }
  if (!PAYMENT_READY_STATUSES.has(String(data.order_status || '').toUpperCase())) {
    return sendError(res, 400, 'Payment is not completed yet.');
  }

  const user = await getUser(session.sub);
  if (!user) return sendError(res, 404, 'User record not found.');
  if (!orderBelongsToUser(data, user)) {
    return sendError(res, 403, 'This payment does not belong to the signed-in Lexorium account.');
  }

  const paidPlanId = String(
    data?.order_tags?.plan ||
    data?.order_meta?.plan ||
    body.plan ||
    'pro'
  ).trim().toLowerCase();
  const checkoutPlan = getCheckoutPlan(paidPlanId) || getCheckoutPlan('pro');
  if (!checkoutPlan) return sendError(res, 400, 'The paid plan could not be resolved.');
  const paymentId = data.cf_order_id || data.payment_id || data.order_id || '';

  const updated = await activatePaidPlan(user.uid, checkoutPlan.id, {
    provider: 'cashfree',
    orderId,
    paymentId,
    customerId: data?.customer_details?.customer_id || user.uid,
    customerPhone: data?.customer_details?.customer_phone || user.phone || '',
    status: data.order_status,
    eventType: 'payment_success',
    raw: data,
  });

  res.setHeader('Set-Cookie', issuePlanEntitlementCookie(user, checkoutPlan.id, {
    orderId,
    paymentId,
  }));

  await track(user.uid, 'checkout_completed', { orderId, provider: 'cashfree', planId: checkoutPlan.id }).catch(() => null);
  await track(user.uid, 'upgraded_to_pro', { orderId, provider: 'cashfree', planId: checkoutPlan.id }).catch(() => null);

  return sendJson(res, 200, {
    ok: true,
    plan: getPublicPlanSummary(checkoutPlan.id),
    subscriptionStatus: updated.subscriptionStatus,
    subscriptionEnd: updated.subscriptionEnd,
  });
};
