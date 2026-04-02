function describeFirestoreError(error) {
  const message = String(error && error.message ? error.message : error || '');
  if (/firestore api has not been used|firestore\.googleapis\.com|create the database|disabled/i.test(message)) {
    return 'Cloud Firestore is not ready for this Firebase project. Enable the Firestore API, create the Firestore database, wait a few minutes, and try again.';
  }
  if (/permission_denied/i.test(message)) {
    return 'Cloud Firestore rejected the request. Check the Firebase project, service account, and Firestore permissions.';
  }
  return message || 'Cloud Firestore is not available.';
}

module.exports = {
  describeFirestoreError,
};