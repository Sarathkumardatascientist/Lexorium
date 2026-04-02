const { describeFirestoreError } = require('./_lib/firebase-status');
const { getDb } = require('./_lib/firebase');
const { sendJson } = require('./_lib/http');
const { isLocalDevStoreEnabled } = require('./_lib/dev-store');
const { getGooglePlayConfig } = require('./billing/_google-play');

module.exports = async (_req, res) => {
  const localDevStore = isLocalDevStoreEnabled();
  const firestoreConfigured = !!(process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PUBLIC_PROJECT_ID);
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || '').trim();
  const googlePlay = getGooglePlayConfig();
  let firestoreReady = false;
  let firestoreMessage = localDevStore
    ? 'Local development store is active on localhost. Firestore is bypassed for local runs.'
    : (firestoreConfigured ? 'Cloud Firestore has not been checked yet.' : 'Cloud Firestore environment variables are missing.');

  if (!localDevStore && firestoreConfigured) {
    try {
      await getDb().doc('_meta/health').get();
      firestoreReady = true;
      firestoreMessage = 'Cloud Firestore is reachable.';
    } catch (error) {
      firestoreMessage = describeFirestoreError(error);
    }
  }

  return sendJson(res, 200, {
    ok: true,
    service: 'lexorium',
    localDevStore,
    authProvider: 'puter',
    puterEnabled: true,
    firestoreConfigured,
    firestoreReady,
    firestoreMessage,
    paymentProvider: process.env.PAYMENT_PROVIDER || 'cashfree',
    cashfreeConfigured: !!((process.env.CASHFREE_APP_ID || process.env.APP_ID) && (process.env.CASHFREE_SECRET_KEY || process.env.SECRET_KEY)),
    cashfreeWebhookUrl: publicAppUrl ? `${publicAppUrl.replace(/\/+$/, '')}/api/billing/webhook` : '/api/billing/webhook',
    googlePlayConfigured: googlePlay.enabled,
    googlePlayPackageName: googlePlay.packageName,
    googlePlayProSubscriptionId: googlePlay.proSubscriptionId,
  });
};
