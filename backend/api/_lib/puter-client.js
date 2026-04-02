const DEFAULT_PUTER_API_ORIGIN = 'https://api.puter.com';

function normalizeToken(value) {
  return String(value || '').trim();
}

function pickFirstString(...values) {
  for (const value of values) {
    const normalized = normalizeToken(value);
    if (normalized) return normalized;
  }
  return '';
}

function getPuterApiOrigin() {
  return pickFirstString(process.env.LEXORIUM_PUTER_API_ORIGIN, globalThis.PUTER_API_ORIGIN, DEFAULT_PUTER_API_ORIGIN) || DEFAULT_PUTER_API_ORIGIN;
}

function getPuterClient(authToken) {
  const token = normalizeToken(authToken);
  if (!token) {
    const error = new Error('Sign in is required.');
    error.statusCode = 401;
    error.code = 'PUTER_AUTH_REQUIRED';
    throw error;
  }

  return {
    authToken: token,
    APIOrigin: getPuterApiOrigin(),
  };
}

function extractPuterToken(req, body) {
  const headerToken = normalizeToken(req?.headers?.['x-puter-token']);
  if (headerToken) return headerToken;

  const authorization = normalizeToken(req?.headers?.authorization);
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, '').trim();
  }

  return normalizeToken(body?.puterToken || body?.token);
}

function extractMessageText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      if (part.image_url?.url) return `[Image: ${part.image_url.url}]`;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractAssistantText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result.trim();
  if (typeof result.text === 'string') return result.text.trim();
  if (typeof result.message?.content === 'string') return result.message.content.trim();
  if (typeof result.content === 'string') return result.content.trim();
  return extractMessageText(result.message?.content || result.content);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(Number(timeoutMs) || 30000, 1000));

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timedOut = new Error('Lexorium could not reach the live AI service in time.');
      timedOut.code = 'PUTER_REQUEST_TIMEOUT';
      timedOut.statusCode = 504;
      throw timedOut;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function parseDriverResponse(response) {
  const contentType = normalizeToken(response?.headers?.get('content-type')).split(';')[0].trim().toLowerCase();
  const raw = await response.text().catch(() => '');
  const text = String(raw || '').trim();

  if (!text) return null;

  if (contentType === 'application/x-ndjson') {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return line;
      }
    });
    return parsed[parsed.length - 1] || null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      message: text,
    };
  }
}

async function parseJsonResponse(response) {
  const raw = await response.text().catch(() => '');
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
}

function normalizeOpenAIModelId(modelId) {
  const normalized = normalizeToken(modelId).toLowerCase();
  if (!normalized) return 'gpt-5-mini';

  const aliases = {
    'openai/gpt-5-mini': 'gpt-5-mini',
    'openai/gpt-5-nano': 'gpt-5-nano',
    'openai/gpt-5-chat': 'gpt-5-chat',
    'openai/gpt-5': 'gpt-5',
    'openai/gpt-5.4': 'gpt-5.4',
    'openai/gpt-5.4-mini': 'gpt-5.4-mini',
    'openai/gpt-5.4-nano': 'gpt-5.4-nano',
    'openai/gpt-5.3-chat': 'gpt-5.3-chat',
    'openai/gpt-5.2-chat': 'gpt-5.2-chat',
    'openai/gpt-5-chat': 'gpt-5-chat',
  };

  if (aliases[normalized]) return aliases[normalized];
  if (normalized.startsWith('openai/')) return normalized.slice('openai/'.length);
  return normalized;
}

function extractOpenAICompatibleText(result) {
  const choice = result?.choices?.[0]?.message;
  if (!choice) return '';
  if (typeof choice.content === 'string') return choice.content.trim();
  if (Array.isArray(choice.content)) {
    return choice.content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function normalizePuterError(error, modelId) {
  const nested = error?.error && typeof error.error === 'object' ? error.error : null;
  const details = error?.details && typeof error.details === 'object' ? error.details : null;
  const statusCode = Number(error?.statusCode || error?.status || nested?.statusCode || nested?.status || details?.statusCode || details?.status || 500) || 500;
  const rawCode = pickFirstString(error?.code, nested?.code, details?.code, error?.response?.error?.code, error?.error_code);
  const rawMessage = pickFirstString(
    error?.message,
    nested?.message,
    details?.message,
    error?.statusText,
    error?.response?.error?.message
  );
  const usageLimited = Boolean(error?.metadata?.usage_limited || nested?.metadata?.usage_limited || details?.metadata?.usage_limited);

  if (statusCode === 401 || ['token_auth_failed', 'auth_canceled', 'PUTER_AUTH_REQUIRED'].includes(rawCode)) {
    const unauthorized = new Error('Your session expired. Sign in again to continue.');
    unauthorized.statusCode = 401;
    unauthorized.code = 'PUTER_AUTH_REQUIRED';
    unauthorized.modelId = modelId || '';
    unauthorized.cause = error;
    return unauthorized;
  }

  if (rawCode === 'email_must_be_confirmed') {
    const confirmation = new Error('Your connected account must confirm its email before live responses can be used.');
    confirmation.statusCode = 403;
    confirmation.code = 'PUTER_ACCOUNT_CONFIRMATION_REQUIRED';
    confirmation.modelId = modelId || '';
    confirmation.cause = error;
    return confirmation;
  }

  if (rawCode === 'insufficient_funds' || usageLimited) {
    const limit = new Error('The connected account has reached its live AI usage limit. Use a different connected account or add usage capacity, then retry.');
    limit.statusCode = 402;
    limit.code = 'PUTER_ACCOUNT_LIMIT_REACHED';
    limit.modelId = modelId || '';
    limit.cause = error;
    return limit;
  }

  if (rawCode === 'permission_denied') {
    const denied = new Error('The connected account does not have permission to use live responses right now.');
    denied.statusCode = 403;
    denied.code = 'PUTER_PERMISSION_DENIED';
    denied.modelId = modelId || '';
    denied.cause = error;
    return denied;
  }

  const wrapped = new Error(rawMessage || 'Lexorium could not complete the request right now.');
  wrapped.statusCode = statusCode;
  wrapped.code = rawCode || (statusCode >= 500 ? 'PUTER_REQUEST_FAILED' : 'PUTER_REQUEST_REJECTED');
  wrapped.modelId = modelId || '';
  wrapped.cause = error;
  return wrapped;
}

async function resolvePuterUser(authToken) {
  const client = getPuterClient(authToken);

  try {
    const response = await fetchWithTimeout(`${client.APIOrigin}/whoami`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${client.authToken}`,
      },
    }, 15000);
    const payload = await parseDriverResponse(response);

    if (!response.ok || payload?.success === false || payload?.error) {
      throw {
        statusCode: response.status,
        statusText: response.statusText,
        ...(payload && typeof payload === 'object' ? payload : { message: String(payload || '') }),
      };
    }

    return payload?.result || payload?.user || payload;
  } catch (error) {
    throw normalizePuterError(error);
  }
}

async function executeWithPuter(route, options) {
  const client = getPuterClient(options?.authToken);
  const payload = options?.payload || {};
  const orderedModels = Array.isArray(route?.orderedModels) ? route.orderedModels.filter(Boolean) : [];
  const attempts = [];

  if (!orderedModels.length) {
    const error = new Error('No legal models are available for this Lexorium plan.');
    error.statusCode = 500;
    error.code = 'PUTER_MODELS_UNAVAILABLE';
    throw error;
  }

  let lastError = null;

  for (const model of orderedModels) {
    try {
      const response = await fetchWithTimeout(`${client.APIOrigin}/puterai/openai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client.authToken}`,
        },
        body: JSON.stringify({
          model: normalizeOpenAIModelId(model.id),
          messages: payload.messages || [],
          temperature: payload.temperature,
          max_tokens: payload.max_tokens,
        }),
      }, options?.timeoutMs || 30000);
      const result = await parseJsonResponse(response);

      if (!response.ok || result?.success === false || result?.error) {
        throw {
          statusCode: response.status,
          statusText: response.statusText,
          ...(result && typeof result === 'object' ? result : { message: String(result || '') }),
        };
      }

      const payloadResult = result?.result !== undefined ? result.result : result;
      const content = extractOpenAICompatibleText(payloadResult) || extractAssistantText(payloadResult);
      if (!content) {
        const emptyError = new Error('The legal engine returned an empty response.');
        emptyError.code = 'PUTER_EMPTY_RESPONSE';
        throw emptyError;
      }

      return {
        content,
        model: {
          id: model.id,
          label: model.label || model.id,
        },
        attempts,
      };
    } catch (error) {
      const normalized = normalizePuterError(error, model.id);
      console.error('[lexorium] puter chat attempt failed', {
        modelId: model.id,
        code: normalized.code || 'unknown',
        message: normalized.message || 'Unknown Puter error',
        statusCode: normalized.statusCode || 500,
      });
      if (normalized.statusCode === 401) {
        normalized.attempts = attempts.slice();
        throw normalized;
      }
      attempts.push({
        modelId: model.id,
        reason: normalized.code || 'PUTER_REQUEST_FAILED',
        message: normalized.message,
      });
      lastError = normalized;
    }
  }

  if (!lastError) {
    lastError = new Error('Lexorium could not complete the request right now.');
    lastError.statusCode = 500;
    lastError.code = 'PUTER_REQUEST_FAILED';
  }
  lastError.attempts = attempts;
  throw lastError;
}

module.exports = {
  executeWithPuter,
  extractPuterToken,
  getPuterClient,
  resolvePuterUser,
};
