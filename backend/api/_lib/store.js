

function isLocalDevStoreEnabled() {
  if (process.env.LEXORIUM_LOCAL_DEV === '0') return false;
  if (process.env.LEXORIUM_LOCAL_DEV === '1') return true;
  
  // Auto-detect based on presence of Firebase Project ID
  const firebaseProjectId = String(process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PUBLIC_PROJECT_ID || '').trim();
  if (!firebaseProjectId || firebaseProjectId === 'your_firestore_project_id') {
    return true; // Fallback to local store if Firebase is not configured
  }
  
  return false;
}

const store = isLocalDevStoreEnabled() ? require('./dev-store') : require('./db');

module.exports = store;
