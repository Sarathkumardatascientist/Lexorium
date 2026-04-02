const { createExpiredCookie, createSignedCookie, getSignedCookie } = require('../auth/_session');
const { getFreeDailyLimit } = require('./_plans');

const FREE_USAGE_COOKIE = 'lexorium_free_usage';
const ROLLING_WINDOW_MS = 20 * 60 * 1000;

function sanitizeTimestamps(value) {
  if (!Array.isArray(value)) return [];
  const cutoff = Date.now() - ROLLING_WINDOW_MS;
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry >= cutoff)
    .sort((a, b) => a - b);
}

function getFreeUsageState(req) {
  const payload = getSignedCookie(req, FREE_USAGE_COOKIE);
  const timestamps = sanitizeTimestamps(payload?.timestamps);
  const limit = getFreeDailyLimit();
  const used = timestamps.length;
  const remaining = Math.max(limit - used, 0);
  const nextResetAt = timestamps.length ? timestamps[0] + ROLLING_WINDOW_MS : null;

  return {
    windowMs: ROLLING_WINDOW_MS,
    limit,
    used,
    remaining,
    nextResetAt,
    timestamps,
  };
}

function recordFreeUsage(res, timestamps) {
  if (!timestamps.length) {
    res.setHeader('Set-Cookie', createExpiredCookie(FREE_USAGE_COOKIE));
    return;
  }

  res.setHeader('Set-Cookie', createSignedCookie(
    FREE_USAGE_COOKIE,
    { timestamps },
    Math.ceil(ROLLING_WINDOW_MS / 1000)
  ));
}

module.exports = {
  getFreeUsageState,
  recordFreeUsage,
  ROLLING_WINDOW_MS,
};
