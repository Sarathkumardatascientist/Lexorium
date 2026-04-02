const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDailyLimit, getPlanConfig, getPlanIdFromUser, isPlanAtLeast, normalizePlanId } = require('./plan-access');
const { CORE_RESPONSE_HEADINGS, applyDailyActivity, dayKey, derivePreferredTask, normalizeCountMap, normalizePersona } = require('./retention');

const PLAN_DURATION_DAYS = Number.parseInt(process.env.PLAN_DURATION_DAYS || process.env.PRO_PLAN_DURATION_DAYS || '30', 10) || 30;
const STORE_PATH = path.join(__dirname, '..', '..', '.local', 'dev-store.json');

const now = () => new Date().toISOString();
const nextReset = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function isLocalDevStoreEnabled() {
  if (process.env.LEXORIUM_LOCAL_DEV === '0') return false;
  if (process.env.LEXORIUM_LOCAL_DEV === '1') return true;
  return /localhost|127\.0\.0\.1/i.test(String(process.env.PUBLIC_APP_URL || ''));
}

function isPro(user) {
  return isPlanAtLeast(getPlanIdFromUser(user), 'pro');
}

function normalize(uid, data) {
  data = data || {};
  return {
    uid,
    name: data.name || '',
    email: String(data.email || '').toLowerCase(),
    avatar: data.avatar || '',
    plan: normalizePlanId(data.plan),
    subscriptionStatus: data.subscriptionStatus || 'inactive',
    subscriptionStart: data.subscriptionStart || null,
    subscriptionEnd: data.subscriptionEnd || null,
    dailyFreeUsageCount: Number(data.dailyFreeUsageCount || 0),
    dailyFreeUsageResetAt: data.dailyFreeUsageResetAt || nextReset(),
    totalMessages: Number(data.totalMessages || 0),
    totalConversations: Number(data.totalConversations || 0),
    lastActiveAt: data.lastActiveAt || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    billingProvider: data.billingProvider || null,
    billingCustomerId: data.billingCustomerId || null,
    billingSubscriptionId: data.billingSubscriptionId || null,
    billingPaymentId: data.billingPaymentId || null,
    persona: normalizePersona(data.persona),
    primaryUseCase: data.primaryUseCase || '',
    onboardingCompletedAt: data.onboardingCompletedAt || null,
    onboardingUpdatedAt: data.onboardingUpdatedAt || null,
    queryTypeCounts: normalizeCountMap(data.queryTypeCounts),
    preferredTaskType: data.preferredTaskType || '',
    lastTaskType: data.lastTaskType || '',
    firstQueryAt: data.firstQueryAt || null,
    lastQueryAt: data.lastQueryAt || null,
    lastActiveDayKey: data.lastActiveDayKey || dayKey(data.lastActiveAt) || '',
    streakCount: Number(data.streakCount || 0),
    longestStreak: Number(data.longestStreak || 0),
    daysActiveTotal: Number(data.daysActiveTotal || 0),
  };
}

function buildUsage(user) {
  const planId = getPlanIdFromUser(user);
  const limit = getDailyLimit(planId);
  const used = Number(user?.dailyFreeUsageCount || 0);
  return {
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    resetAt: user?.dailyFreeUsageResetAt || nextReset(),
  };
}

function titleFrom(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value ? (value.length > 72 ? `${value.slice(0, 69)}...` : value) : 'Untitled conversation';
}

function ensureStoreDir() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

function readState() {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) return { users: {}, conversations: {}, analytics: [] };
  try {
    const state = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return {
      users: state.users || {},
      conversations: state.conversations || {},
      analytics: Array.isArray(state.analytics) ? state.analytics : [],
    };
  } catch (_error) {
    return { users: {}, conversations: {}, analytics: [] };
  }
}

function writeState(state) {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function refreshUser(state, uid) {
  const raw = state.users[uid];
  if (!raw) return null;
  const user = normalize(uid, raw);
  let changed = false;

  if (normalizePlanId(user.plan) !== 'free' && getPlanIdFromUser(user) === 'free') {
    user.plan = 'free';
    user.subscriptionStatus = 'inactive';
    changed = true;
  }
  if (Date.parse(user.dailyFreeUsageResetAt || 0) <= Date.now()) {
    user.dailyFreeUsageCount = 0;
    user.dailyFreeUsageResetAt = nextReset();
    changed = true;
  }
  if (changed) {
    user.updatedAt = now();
    state.users[uid] = user;
    writeState(state);
  }

  return user;
}

async function getUser(uid) {
  return refreshUser(readState(), uid);
}

async function upsertUser(profile) {
  const state = readState();
  const base = refreshUser(state, profile.uid) || normalize(profile.uid, {});
  const user = {
    ...base,
    name: profile.name || base.name,
    email: String(profile.email || base.email || '').toLowerCase(),
    avatar: profile.avatar || base.avatar,
    lastActiveAt: now(),
    updatedAt: now(),
    createdAt: base.createdAt || now(),
  };
  state.users[profile.uid] = user;
  writeState(state);
  return user;
}

async function takeQuota(uid) {
  const state = readState();
  const user = refreshUser(state, uid);
  if (!user) throw new Error('User record not found.');

  const planId = getPlanIdFromUser(user);
  const limit = getDailyLimit(planId);
  if (user.dailyFreeUsageCount >= limit) {
    return {
      ok: false,
      plan: planId,
      usage: { limit, used: user.dailyFreeUsageCount, remaining: 0, resetAt: user.dailyFreeUsageResetAt },
      first: user.totalMessages === 0,
    };
  }

  user.dailyFreeUsageCount += 1;
  const currentTime = now();
  Object.assign(user, applyDailyActivity(user, currentTime));
  user.lastActiveAt = currentTime;
  user.updatedAt = now();
  state.users[uid] = user;
  writeState(state);
  return {
    ok: true,
    plan: planId,
    usage: {
      limit,
      used: user.dailyFreeUsageCount,
      remaining: Math.max(limit - user.dailyFreeUsageCount, 0),
      resetAt: user.dailyFreeUsageResetAt,
    },
    first: user.totalMessages === 0,
  };
}

async function track(uid, eventName, meta) {
  const state = readState();
  state.analytics.push({ id: crypto.randomUUID(), uid: uid || null, eventName, meta: meta || {}, createdAt: now() });
  writeState(state);
}

async function updateUserProfile(uid, updates) {
  const state = readState();
  const user = refreshUser(state, uid);
  if (!user) throw new Error('User record not found.');

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'persona')) user.persona = normalizePersona(updates.persona);
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'primaryUseCase')) user.primaryUseCase = String(updates.primaryUseCase || '').trim();
  if (updates?.onboardingCompleted) user.onboardingCompletedAt = user.onboardingCompletedAt || now();
  if (updates?.onboardingCompleted || Object.prototype.hasOwnProperty.call(updates || {}, 'persona') || Object.prototype.hasOwnProperty.call(updates || {}, 'primaryUseCase')) {
    user.onboardingUpdatedAt = now();
  }
  user.updatedAt = now();
  state.users[uid] = user;
  writeState(state);
  return user;
}

async function recordRetentionActivity(uid, classification, meta) {
  const state = readState();
  const user = refreshUser(state, uid);
  if (!user) throw new Error('User record not found.');

  const currentTime = now();
  const taskType = String(classification?.taskType || '').trim();
  const queryTypeCounts = normalizeCountMap(user.queryTypeCounts);
  if (taskType) queryTypeCounts[taskType] = Number(queryTypeCounts[taskType] || 0) + 1;

  user.queryTypeCounts = queryTypeCounts;
  user.preferredTaskType = derivePreferredTask(queryTypeCounts);
  user.lastTaskType = taskType || user.lastTaskType || '';
  user.lastQueryAt = currentTime;
  user.firstQueryAt = user.firstQueryAt || currentTime;
  Object.assign(user, applyDailyActivity(user, currentTime));

  if (meta?.persona) user.persona = normalizePersona(meta.persona) || user.persona;
  if (meta?.primaryUseCase) user.primaryUseCase = String(meta.primaryUseCase || '').trim() || user.primaryUseCase;
  if (meta?.completeOnboarding && (user.persona || user.primaryUseCase)) {
    user.onboardingCompletedAt = user.onboardingCompletedAt || currentTime;
    user.onboardingUpdatedAt = currentTime;
  }

  user.updatedAt = currentTime;
  state.users[uid] = user;
  writeState(state);
  return user;
}

async function getConversation(uid, id) {
  const state = readState();
  const item = state.conversations[uid]?.[id];
  return item ? { id, ...item } : null;
}

async function listConversations(uid) {
  const state = readState();
  return Object.entries(state.conversations[uid] || {})
    .map(([id, item]) => ({
      id,
      title: item.title,
      preview: item.preview,
      updatedAt: item.updatedAt,
      isPinned: !!item.isPinned,
      messageCount: Number(item.messageCount || 0),
    }))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .slice(0, 100);
}

async function saveConversation(uid, payload) {
  const state = readState();
  state.conversations[uid] = state.conversations[uid] || {};
  const id = payload.id || crypto.randomUUID();
  const current = state.conversations[uid][id] || {};
  const messages = Array.isArray(current.messages) ? current.messages.slice(-38) : [];
  const nextMessages = messages.concat([
    { role: 'user', content: payload.userText, at: now() },
    {
      role: 'assistant',
      content: payload.answerText,
      at: now(),
      model: payload.model || '',
      modelLabel: payload.modelLabel || '',
      modelTier: payload.modelTier || '',
      modelPlanName: payload.modelPlanName || '',
      mode: payload.mode || 'chat',
    },
  ]);
  const conversation = {
    title: current.title || payload.title || titleFrom(payload.userText),
    preview: String(payload.answerText || '').slice(0, 180),
    updatedAt: now(),
    createdAt: current.createdAt || now(),
    isPinned: !!current.isPinned,
    messageCount: nextMessages.length,
    messages: nextMessages,
  };
  state.conversations[uid][id] = conversation;
  const user = refreshUser(state, uid) || normalize(uid, {});
  user.totalMessages = Number(user.totalMessages || 0) + 2;
  user.totalConversations = Number(user.totalConversations || 0) + (current.createdAt ? 0 : 1);
  user.lastActiveAt = now();
  user.updatedAt = now();
  user.createdAt = user.createdAt || now();
  state.users[uid] = user;
  writeState(state);
  return { id, ...conversation };
}

async function setPinned(uid, id, value) {
  const state = readState();
  if (!state.conversations[uid]?.[id]) return;
  state.conversations[uid][id].isPinned = !!value;
  state.conversations[uid][id].updatedAt = now();
  writeState(state);
}

async function removeConversation(uid, id) {
  const state = readState();
  if (!state.conversations[uid]) return;
  delete state.conversations[uid][id];
  writeState(state);
}

async function renameConversation(uid, id, title) {
  const state = readState();
  if (!state.conversations[uid]?.[id]) return;
  state.conversations[uid][id].title = String(title || '').trim();
  state.conversations[uid][id].updatedAt = now();
  writeState(state);
}

async function clearConversations(uid) {
  const state = readState();
  delete state.conversations[uid];
  writeState(state);
}

async function activatePaidPlan(uid, planId, payment) {
  const state = readState();
  const user = refreshUser(state, uid) || normalize(uid, {});
  const plan = getPlanConfig(planId);
  const paymentOrderId = String(payment?.orderId || '').trim();
  const paymentId = String(payment?.paymentId || '').trim();
  const alreadyApplied =
    normalizePlanId(user.plan) === plan.id
    && String(user.subscriptionStatus || '').toLowerCase() === 'active'
    && Date.parse(user.subscriptionEnd || 0) > Date.now()
    && (
      (paymentOrderId && String(user.billingSubscriptionId || '').trim() === paymentOrderId)
      || (paymentId && String(user.billingPaymentId || '').trim() === paymentId)
    );
  if (alreadyApplied) return user;
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + PLAN_DURATION_DAYS);
  user.plan = plan.id;
  user.subscriptionStatus = 'active';
  user.subscriptionStart = now();
  user.subscriptionEnd = end.toISOString();
  user.billingProvider = payment.provider || process.env.PAYMENT_PROVIDER || 'cashfree';
  user.billingCustomerId = payment.customerId || null;
  user.billingSubscriptionId = payment.subscriptionId || payment.orderId || null;
  user.billingPaymentId = payment.paymentId || null;
  user.dailyFreeUsageCount = 0;
  user.dailyFreeUsageResetAt = nextReset();
  user.lastActiveAt = now();
  user.updatedAt = now();
  user.createdAt = user.createdAt || now();
  state.users[uid] = user;
  writeState(state);
  return user;
}

async function activatePro(uid, payment) {
  return activatePaidPlan(uid, 'pro', payment);
}

async function findUserByEmail(email) {
  const normalized = String(email || '').toLowerCase();
  const state = readState();
  const match = Object.entries(state.users).find(([, user]) => String(user.email || '').toLowerCase() === normalized);
  return match ? match[0] : null;
}

function exportText(conversation) {
  const sections = [...CORE_RESPONSE_HEADINGS, 'Sources'];
  return [
    `Title: ${conversation.title || 'Untitled conversation'}`,
    '',
    ...(conversation.messages || []).flatMap((message) => {
      const content = String(message.content || '');
      const normalized = sections.reduce((output, section) => output.replace(new RegExp(`^##\\s+${section}`, 'gm'), section), content);
      return [String(message.role || '').toUpperCase(), normalized, ''];
    }),
  ].join('\n');
}

function getAnalyticsSummary() {
  const state = readState();
  const users = Object.entries(state.users || {}).map(([uid, user]) => normalize(uid, user));
  const analytics = Array.isArray(state.analytics) ? state.analytics : [];
  const nowMs = Date.now();
  const recentQueryEvents = analytics.filter((item) =>
    ['first_query_completed', 'query_completed', 'activation_reached'].includes(String(item.eventName || ''))
      && (nowMs - Date.parse(item.createdAt || 0)) <= (30 * 24 * 60 * 60 * 1000)
  );
  const activeToday = new Set(
    analytics
      .filter((item) => (nowMs - Date.parse(item.createdAt || 0)) <= (24 * 60 * 60 * 1000))
      .map((item) => item.uid)
      .filter(Boolean)
  );
  const convertedUsers = new Set(
    analytics
      .filter((item) => ['checkout_completed', 'upgraded_to_pro'].includes(String(item.eventName || '')))
      .map((item) => item.uid)
      .filter(Boolean)
  );
  const eligibleForChurn = users.filter((user) => user.createdAt && (nowMs - Date.parse(user.createdAt)) > (14 * 24 * 60 * 60 * 1000));
  const churnedUsers = eligibleForChurn.filter((user) => !user.lastActiveAt || (nowMs - Date.parse(user.lastActiveAt)) > (14 * 24 * 60 * 60 * 1000));

  function retentionFor(days) {
    const cohorts = users.filter((user) => user.createdAt && (nowMs - Date.parse(user.createdAt)) > (days * 24 * 60 * 60 * 1000));
    if (!cohorts.length) return 0;
    const retained = cohorts.filter((user) => {
      if (!user.firstQueryAt || !user.lastQueryAt) return false;
      const createdDay = dayKey(user.createdAt);
      const retainedDay = dayKey(new Date(Date.parse(user.createdAt) + (days * 24 * 60 * 60 * 1000)).toISOString());
      return dayKey(user.lastQueryAt) >= retainedDay && Boolean(createdDay);
    });
    return Number(((retained.length / cohorts.length) * 100).toFixed(1));
  }

  return {
    dailyActiveUsers: activeToday.size,
    queriesPerUser: activeToday.size ? Number((recentQueryEvents.length / Math.max(new Set(recentQueryEvents.map((item) => item.uid).filter(Boolean)).size, 1)).toFixed(2)) : 0,
    retentionRate: {
      d1: retentionFor(1),
      d7: retentionFor(7),
      d30: retentionFor(30),
    },
    conversionRate: users.length ? Number(((convertedUsers.size / users.length) * 100).toFixed(1)) : 0,
    churnRate: eligibleForChurn.length ? Number(((churnedUsers.length / eligibleForChurn.length) * 100).toFixed(1)) : 0,
  };
}

module.exports = {
  activatePaidPlan,
  activatePro,
  exportText,
  findUserByEmail,
  getConversation,
  getDailyLimit: (user) => getDailyLimit(getPlanIdFromUser(user)),
  getPlanIdFromUser,
  getUser,
  isLocalDevStoreEnabled,
  isPro,
  listConversations,
  clearConversations,
  removeConversation,
  renameConversation,
  recordRetentionActivity,
  saveConversation,
  setPinned,
  takeQuota,
  track,
  updateUserProfile,
  upsertUser,
  getAnalyticsSummary,
};
