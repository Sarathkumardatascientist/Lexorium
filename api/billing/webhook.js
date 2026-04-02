const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');
const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { activatePaidPlan, findUserByEmail } = store;
const { readRawBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { getCashfreeConfig, verifyWebhookSignature } = require('./_cashfree');
const { getCheckoutPlan } = require('../_lib/plan-access');

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const cashfree = getCashfreeConfig();
  if (!cashfree.enabled) return sendError(res, 500, 'Cashfree is not configured.');

  const raw = await readRawBody(req);
  const signature = req.headers['x-webhook-signature'] || '';
  const timestamp = req.headers['x-webhook-timestamp'] || '';
  if (!verifyWebhookSignature(raw, timestamp, signature, cashfree.secret)) {
    return sendError(res, 400, 'Invalid webhook signature.');
  }

  const body = JSON.parse(raw || '{}');
  const orderEntity = body?.data?.order || body?.order || {};
  const customerEntity = body?.data?.customer_details || orderEntity?.customer_details || {};
  const orderStatus = String(orderEntity?.order_status || body?.type || '').toUpperCase();
  const eventName = String(body?.type || body?.event || '').toUpperCase();
  const email = customerEntity?.customer_email || '';
  const uid = orderEntity?.order_tags?.uid || (findUserByEmail ? await findUserByEmail(email) : null);
  const planId = String(orderEntity?.order_tags?.plan || 'pro').trim().toLowerCase();
  const checkoutPlan = getCheckoutPlan(planId) || getCheckoutPlan('pro');

  if (uid && checkoutPlan && (orderStatus === 'PAID' || eventName.includes('PAYMENT_SUCCESS'))) {
    await activatePaidPlan(uid, checkoutPlan.id, {
      provider: 'cashfree',
      orderId: orderEntity?.order_id || '',
      paymentId: orderEntity?.cf_order_id || '',
      customerId: customerEntity?.customer_id || uid,
      status: orderStatus || eventName,
      eventType: eventName || 'PAYMENT_SUCCESS_WEBHOOK',
      raw: body,
    });
  }

  return sendJson(res, 200, { ok: true });
};
