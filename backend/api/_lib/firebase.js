const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;
let authInstance = null;

function getServiceAccountConfig() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PUBLIC_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '')
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is not configured.');
  }

  if (!clientEmail || !privateKey) {
    return { projectId };
  }

  return {
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  };
}

function getFirebaseApp() {
  if (!getApps().length) {
    initializeApp(getServiceAccountConfig());
  }
  return getApps()[0];
}

function getDb() {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
    dbInstance.settings({ ignoreUndefinedProperties: true });
  }
  return dbInstance;
}

function getAdminAuth() {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

async function verifyIdToken(idToken) {
  return getAdminAuth().verifyIdToken(idToken);
}

module.exports = {
  FieldValue,
  getAdminAuth,
  getDb,
  verifyIdToken,
};
