const { executeWithPuter, extractPuterToken } = require('./puter-client');

function getActiveProvider() {
  return String(process.env.LEXORIUM_AI_PROVIDER || 'puter').trim().toLowerCase() || 'puter';
}

function extractProviderToken(req, body) {
  const provider = getActiveProvider();
  if (provider === 'puter') return extractPuterToken(req, body);
  return '';
}

async function executeAIRequest(route, options) {
  const provider = getActiveProvider();
  if (provider === 'puter') {
    return executeWithPuter(route, {
      ...options,
      authToken: options?.authToken,
    });
  }

  const error = new Error(`AI provider "${provider}" is not configured.`);
  error.code = 'AI_PROVIDER_UNAVAILABLE';
  error.statusCode = 503;
  throw error;
}

module.exports = {
  executeAIRequest,
  extractProviderToken,
  getActiveProvider,
};
