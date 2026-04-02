const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_ROOT = path.join(__dirname, 'api');
const API_ROOT_PREFIX = `${API_ROOT}${path.sep}`;

function respond(res, status, body, type = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
}

function jsonError(message) {
  return JSON.stringify({ ok: false, message });
}

function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => respond(res, res.statusCode || 200, JSON.stringify(payload), 'application/json; charset=utf-8');
  res.send = (payload) => respond(res, res.statusCode || 200, String(payload));
}

function clearWorkspaceModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key !== __filename && key.startsWith(ROOT)) {
      delete require.cache[key];
    }
  }
}

function normalizeRoutePath(routePath) {
  return String(routePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();
}

function buildUrl(req) {
  const host = req.headers?.host || 'localhost';
  return new URL(req.url || '/', `http://${host}`);
}

function resolveHandlerFile(routePath) {
  const normalizedRoute = normalizeRoutePath(routePath);
  const directFile = path.resolve(API_ROOT, `${normalizedRoute}.js`);
  const nestedIndex = path.resolve(API_ROOT, normalizedRoute, 'index.js');
  const candidates = [directFile, nestedIndex];

  for (const candidate of candidates) {
    if ((candidate === API_ROOT || candidate.startsWith(API_ROOT_PREFIX)) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getRoutePath(req, explicitRoutePath) {
  if (explicitRoutePath !== undefined && explicitRoutePath !== null && String(explicitRoutePath).trim()) {
    return normalizeRoutePath(explicitRoutePath);
  }

  const url = buildUrl(req);
  const rewrittenRoute = url.searchParams.get('route');
  if (rewrittenRoute) return normalizeRoutePath(rewrittenRoute);

  if (url.pathname === '/api' || url.pathname === '/api/') return '';
  if (url.pathname.startsWith('/api/')) return normalizeRoutePath(url.pathname.slice('/api/'.length));
  return normalizeRoutePath(url.pathname);
}

async function handleApiRequest(req, res, options = {}) {
  decorate(res);
  const url = buildUrl(req);
  const routePath = getRoutePath(req, options.routePath);
  const handlerFile = resolveHandlerFile(routePath);

  if (!handlerFile) {
    return respond(res, 404, jsonError('API route not found.'), 'application/json; charset=utf-8');
  }

  if (options.reloadModules) {
    clearWorkspaceModuleCache();
  }

  req.query = Object.fromEntries(url.searchParams.entries());
  delete req.query.route;
  req.pathname = routePath ? `/api/${routePath}` : '/api';
  req.routePath = routePath;

  try {
    await require(handlerFile)(req, res);
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error('[lexorium] API error', req.pathname, error);
    if (!res.writableEnded) {
      respond(
        res,
        500,
        jsonError(error && error.message ? error.message : 'Internal server error.'),
        'application/json; charset=utf-8',
      );
    }
  }
}

module.exports = {
  handleApiRequest,
};
