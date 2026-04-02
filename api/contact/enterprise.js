const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { getEnterpriseGoogleFormConfig, hasEnterpriseGoogleFormConfig } = require('../_lib/enterprise-google-form');

function clean(value) {
  return String(value || '').trim();
}

function buildFormPayload(body) {
  const config = getEnterpriseGoogleFormConfig();
  return new URLSearchParams({
    [config.entries.fullName]: clean(body.fullName),
    [config.entries.workEmail]: clean(body.workEmail),
    [config.entries.organization]: clean(body.organization),
    [config.entries.role]: clean(body.role),
    [config.entries.teamSize]: clean(body.teamSize),
    [config.entries.queryVolume]: clean(body.queryVolume),
    [config.entries.useCase]: clean(body.useCase),
    [config.entries.requirements]: clean(body.requirements),
  });
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  if (!clean(body.fullName) || !clean(body.workEmail) || !clean(body.organization) || !clean(body.requirements)) {
    return sendError(res, 400, 'Full name, work email, organization, and requirements are required.');
  }

  if (!hasEnterpriseGoogleFormConfig()) {
    return sendError(res, 500, 'Enterprise contact form is not configured yet.');
  }

  const config = getEnterpriseGoogleFormConfig();
  const response = await fetch(config.actionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: buildFormPayload(body).toString(),
  }).catch((error) => ({ __networkError: error }));

  if (response?.__networkError) {
    return sendError(res, 502, 'Could not submit the enterprise inquiry to Google Forms.');
  }

  if (!response.ok) {
    return sendError(res, 502, 'Google Forms rejected the enterprise inquiry.');
  }

  return sendJson(res, 200, {
    ok: true,
    message: 'Enterprise inquiry submitted successfully.',
  });
};
