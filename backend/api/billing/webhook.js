const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { activatePaidPlan, findUserByEmail, recordPaymentEvent } = store;
const { readRawBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { getCashfreeConfig, verifyWebhookSignature } = require('./_cashfree');
const { getCheckoutPlan } = require('../_lib/plan-access');

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function toAmountPaise(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

function pickHeader(req, names) {
  for (const name of names) {
    const value = req.headers?.[name];
    if (value) return String(value).trim();
  }
  return '';
}

module.exports = async (req, res) => {
  const cashfree = getCashfreeConfig();
  if (String(req.method || 'GET').toUpperCase() === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      provider: 'cashfree',
      configured: cashfree.enabled,
      endpoint: '/api/billing/webhook',
      mode: cashfree.mode,
    });
  }

  if (!requireMethod(req, res, 'POST')) return;
  if (!cashfree.enabled) return sendError(res, 500, 'Cashfree is not configured.');

  const raw = await readRawBody(req);
  const signature = pickHeader(req, ['x-webhook-signature', 'x-cf-signature', 'x-cashfree-signature']);
  const timestamp = pickHeader(req, ['x-webhook-timestamp', 'x-cf-timestamp', 'x-cashfree-timestamp']);
  if (!signature || !timestamp) {
    return sendError(res, 400, 'Missing webhook signature headers.');
  }
  if (!verifyWebhookSignature(raw, timestamp, signature, cashfree.secret)) {
    return sendError(res, 400, 'Invalid webhook signature.');
  }

  let body = {};
  try {
    body = JSON.parse(raw || '{}');
  } catch (_error) {
    return sendError(res, 400, 'Webhook body must be valid JSON.');
  }

  const orderEntity = body?.data?.order || body?.order || {};
  const paymentEntity = body?.data?.payment || body?.payment || {};
  const customerEntity = body?.data?.customer_details || orderEntity?.customer_details || {};
  const orderStatus = normalizeStatus(orderEntity?.order_status || paymentEntity?.payment_status || body?.order_status || '');
  const eventName = normalizeStatus(body?.type || body?.event || body?.event_type || '');
  const email = customerEntity?.customer_email || '';
  const uid = orderEntity?.order_tags?.uid || (findUserByEmail ? await findUserByEmail(email) : null);
  const planId = String(orderEntity?.order_tags?.plan || 'pro').trim().toLowerCase();
  const checkoutPlan = getCheckoutPlan(planId) || getCheckoutPlan('pro');
  const paymentStatus = orderStatus || eventName || 'RECEIVED';
  const amountPaise = toAmountPaise(orderEntity?.order_amount) ?? checkoutPlan?.pricePaise ?? null;
  const paymentId = String(
    paymentEntity?.cf_payment_id
    || paymentEntity?.payment_id
    || orderEntity?.cf_order_id
    || ''
  ).trim();
  const orderId = String(orderEntity?.order_id || '').trim();
  const shouldActivate = paymentStatus === 'PAID' || eventName.includes('PAYMENT_SUCCESS') || eventName.includes('ORDER_PAID');

  if (uid && checkoutPlan && recordPaymentEvent) {
    await recordPaymentEvent(uid, checkoutPlan.id, {
      provider: 'cashfree',
      orderId,
      paymentId,
      customerId: customerEntity?.customer_id || uid,
      customerPhone: customerEntity?.customer_phone || '',
      status: paymentStatus,
      eventType: eventName || 'WEBHOOK_RECEIVED',
      amountPaise,
      currency: orderEntity?.order_currency || paymentEntity?.payment_currency || 'INR',
      paidAt: shouldActivate ? new Date().toISOString() : null,
      raw: body,
    }).catch(() => null);
  }

  if (uid && checkoutPlan && shouldActivate) {
    await activatePaidPlan(uid, checkoutPlan.id, {
      provider: 'cashfree',
      orderId,
      paymentId,
      customerId: customerEntity?.customer_id || uid,
      customerPhone: customerEntity?.customer_phone || '',
      status: paymentStatus,
      eventType: eventName || 'PAYMENT_SUCCESS_WEBHOOK',
      amountPaise,
      currency: orderEntity?.order_currency || paymentEntity?.payment_currency || 'INR',
      raw: body,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    processed: true,
    activated: Boolean(uid && checkoutPlan && shouldActivate),
    event: eventName || 'WEBHOOK_RECEIVED',
    status: paymentStatus,
    orderId,
    uid: uid || null,
  });
};
