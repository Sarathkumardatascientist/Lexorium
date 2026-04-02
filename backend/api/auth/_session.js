const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'lexorium_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const GITHUB_STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || '';
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function encodeSignedValue(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function decodeSignedValue(value, secret) {
  if (!value || !secret) return null;

  const parts = String(value).split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload, secret);
  if (signature.length !== expectedSignature.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch (error) {
    return null;
  }
}

function parseCookies(req) {
  const cookieHeader = req.headers?.cookie || '';
  return cookieHeader.split(';').reduce((cookies, chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return cookies;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return cookies;
    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getPublicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
}

function createSessionCookie(user) {
  const token = encodeSignedValue({
    sub: user.sub || '',
    name: user.name || '',
    email: user.email || '',
    picture: user.picture || '',
    provider: user.provider || '',
    iat: Date.now(),
  }, getRequiredSessionSecret());

  const isSecure = getPublicAppUrl().startsWith('https://');
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${isSecure ? '; Secure' : ''}`;
}

function getRequiredSessionSecret() {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured on the server.');
  }
  return secret;
}

function createSignedCookie(name, payload, maxAgeSeconds) {
  const token = encodeSignedValue(payload, getRequiredSessionSecret());
  const isSecure = getPublicAppUrl().startsWith('https://');
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isSecure ? '; Secure' : ''}`;
}

function createExpiredSessionCookie() {
  const isSecure = getPublicAppUrl().startsWith('https://');
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`;
}

function createExpiredCookie(name) {
  const isSecure = getPublicAppUrl().startsWith('https://');
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`;
}

function getSessionFromRequest(req) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const payload = decodeSignedValue(token, secret);
  if (!payload) return null;

  return {
    sub: payload.sub || '',
    name: payload.name || '',
    email: payload.email || '',
    picture: payload.picture || '',
    provider: payload.provider || '',
  };
}

function getSignedCookie(req, name) {
  const secret = getSessionSecret();
  if (!secret) return null;
  const cookies = parseCookies(req);
  return decodeSignedValue(cookies[name], secret);
}

function createGithubState(nextPath) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured on the server.');
  }

  return encodeSignedValue({
    next: nextPath || '/app.html',
    ts: Date.now(),
  }, secret);
}

function readGithubState(value) {
  const payload = decodeSignedValue(value, getSessionSecret());
  if (!payload) return null;
  if (!payload.ts || Date.now() - payload.ts > GITHUB_STATE_TTL_MS) return null;
  return payload;
}

module.exports = {
  createExpiredCookie,
  createExpiredSessionCookie,
  createGithubState,
  createSignedCookie,
  createSessionCookie,
  getPublicAppUrl,
  getSignedCookie,
  getSessionFromRequest,
  readGithubState,
};
