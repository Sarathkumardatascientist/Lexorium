const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');

function clean(value) {
  return String(value || '').trim();
}

async function sendEnterpriseEmail(body) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const toEmail = process.env.ENTERPRISE_TO_EMAIL || 'enterprise@lexoriumai.com';
  const fromEmail = process.env.ENTERPRISE_FROM_EMAIL || 'Lexorium <noreply@lexoriumai.com>';

  const htmlBody = `
    <h2>New Enterprise Inquiry</h2>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Full Name</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.fullName)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Work Email</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.workEmail)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Organization</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.organization)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Role</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.role)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Team Size</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.teamSize)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Query Volume</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.queryVolume)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Use Case</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.useCase)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; vertical-align: top;">Requirements</td><td style="padding: 8px; border: 1px solid #ddd;">${clean(body.requirements).replace(/\n/g, '<br>')}</td></tr>
    </table>
    <p style="margin-top: 16px; color: #666;">Submitted from Lexorium website</p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: `New Enterprise Inquiry: ${clean(body.organization)}`,
      html: htmlBody,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return response.json();
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  if (!clean(body.fullName) || !clean(body.workEmail) || !clean(body.organization) || !clean(body.requirements)) {
    return sendError(res, 400, 'Full name, work email, organization, and requirements are required.');
  }

  if (!process.env.RESEND_API_KEY) {
    return sendError(res, 500, 'Email service is not configured. Please contact support.');
  }

  try {
    await sendEnterpriseEmail(body);
  } catch (error) {
    console.error('Enterprise email error:', error.message);
    return sendError(res, 502, 'Failed to send enterprise inquiry email.');
  }

  return sendJson(res, 200, {
    ok: true,
    message: 'Enterprise inquiry submitted successfully.',
  });
};
