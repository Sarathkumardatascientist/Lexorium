const { createExpiredSessionCookie } = require('./_session');
const { clearPlanCookie } = require('../billing/_entitlements');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  res.setHeader('Set-Cookie', [createExpiredSessionCookie(), clearPlanCookie()]);
  return res.status(200).json({ ok: true });
};
