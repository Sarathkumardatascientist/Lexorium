const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDailyLimit, getPlanConfig, getPlanIdFromUser, isPlanAtLeast, normalizePlanId } = require('./plan-access');
const { CORE_RESPONSE_HEADINGS, applyDailyActivity, dayKey, derivePreferredTask, normalizeCountMap, normalizePersona } = require('./retention');

const PLAN_DURATION_DAYS = Number.parseInt(process.env.PLAN_DURATION_DAYS || process.env.PRO_PLAN_DURATION_DAYS || '30', 10) || 30;
const STORE_PATH = path.join(__dirname, '..', '..', '.local', 'dev-store.json');

const now = () => new Date().toISOString();
const nextReset = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
};

function isLocalDevStoreEnabled() {
  if (process.env.LEXORIUM_LOCAL_DEV === '0') return false;
  if (process.env.LEXORIUM_LOCAL_DEV === '1') return true;
  return /localhost|127\.0\.0\.1/i.test(String(process.env.PUBLIC_APP_URL || '').trim());
}

function isPro(user) {
  return isPlanAtLeast(getPlanIdFromUser(user), 'pro');
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return '';
}

function normalize(uid, data) {
  data = data || {};
  return {
    uid,
    name: data.name || '',
    email: String(data.email || '').toLowerCase(),
    phone: normalizePhone(data.phone || data.mobile || data.customerPhone),
    avatar: data.avatar || '',
    authProvider: data.authProvider || 'puter',
    accountStatus: data.accountStatus || 'active',
    plan: normalizePlanId(data.plan),
    subscriptionStatus: data.subscriptionStatus || 'inactive',
    subscriptionStart: data.subscriptionStart || null,
    subscriptionEnd: data.subscriptionEnd || null,
    dailyFreeUsageCount: Number(data.dailyFreeUsageCount || 0),
    dailyFreeUsageResetAt: data.dailyFreeUsageResetAt || nextReset(),
    usageDate: data.usageDate || dayKey(data.lastActiveAt) || dayKey(Date.now()),
    totalMessages: Number(data.totalMessages || 0),
    totalConversations: Number(data.totalConversations || 0),
    lastActiveAt: data.lastActiveAt || null,
    lastLoginAt: data.lastLoginAt || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    billingProvider: data.billingProvider || null,
    billingCustomerId: data.billingCustomerId || null,
    billingSubscriptionId: data.billingSubscriptionId || null,
    billingPaymentId: data.billingPaymentId || null,
    lastCommercialSyncAt: data.lastCommercialSyncAt || null,
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

function shouldSyncCommercialState(user) {
  const lastSyncAt = Date.parse(user?.lastCommercialSyncAt || 0);
  if (!Number.isFinite(lastSyncAt) || lastSyncAt <= 0) return true;
  return (Date.now() - lastSyncAt) >= (6 * 60 * 60 * 1000);
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

function safeDocKey(...parts) {
  return parts
    .filter(Boolean)
    .join('_')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || `lexorium_${Date.now()}`;
}

function buildAccountStatus(user) {
  const status = String(user?.subscriptionStatus || '').toLowerCase();
  if (status === 'suspended') return 'suspended';
  const planId = getPlanIdFromUser(user);
  return planId === 'free' || status === 'active' ? 'active' : 'inactive';
}

function buildFeatureEntitlements(uid, planId, timestamp) {
  const features = getPlanConfig(planId).features || {};
  return {
    user_id: uid,
    plan: planId,
    access_advanced_models: Boolean(features.advancedModelSelection || features.topTierModelsOnly),
    access_legal_tools: Boolean(features.allTools || features.researchTool || features.summarizeMode),
    access_case_law_depth: Boolean(features.advancedLegalReasoning || features.structuredCaseLawAnalysis),
    access_contract_drafting: Boolean(features.contractDrafting || features.draftMode),
    export_access: Boolean(features.exportConversation),
    access_voice_analysis: Boolean(features.voiceConversation),
    access_voice_playback: Boolean(features.voicePlayback),
    priority_response: Boolean(features.priorityResponse || features.fastestResponsePriority || features.premiumLoading),
    updated_at: timestamp,
  };
}

function buildSubscriptionRecord(uid, user, timestamp) {
  const planId = getPlanIdFromUser(user);
  const plan = getPlanConfig(planId);
  const active = String(user?.subscriptionStatus || '').toLowerCase() === 'active' && Date.parse(user?.subscriptionEnd || 0) > Date.now();
  return {
    subscription_id: uid,
    user_id: uid,
    plan_name: planId,
    billing_cycle: plan.pricePaise > 0 ? 'monthly' : (planId === 'free' ? 'free' : 'custom'),
    price: Number(((plan.pricePaise || 0) / 100).toFixed(2)),
    price_paise: plan.pricePaise || 0,
    currency: 'INR',
    start_date: user?.subscriptionStart || user?.createdAt || timestamp,
    end_date: user?.subscriptionEnd || null,
    renewal_status: planId === 'free' ? 'not_applicable' : (active ? 'active' : 'inactive'),
    payment_status: planId === 'free' ? 'not_required' : (active ? 'paid' : 'pending'),
    gateway_reference: user?.billingSubscriptionId || null,
    upgraded_at: planId === 'free' ? null : (user?.subscriptionStart || timestamp),
    updated_at: timestamp,
  };
}

function buildUsageRecord(uid, user, timestamp) {
  const planId = getPlanIdFromUser(user);
  const usage = buildUsage(user);
  const date = dayKey(timestamp);
  const id = safeDocKey(uid, date);
  return {
    id,
    data: {
      usage_id: id,
      user_id: uid,
      date,
      queries_used: usage.used,
      daily_limit: usage.limit,
      plan: planId,
      reset_at: usage.resetAt,
      updated_at: timestamp,
      created_at: timestamp,
    },
  };
}

function buildPaymentRecord(uid, planId, payment, timestamp) {
  if (!payment) return null;
  const plan = getPlanConfig(planId);
  const id = safeDocKey(payment.paymentId || payment.orderId || payment.invoiceId || uid, payment.eventType || 'payment');
  return {
    id,
    data: {
      payment_id: id,
      user_id: uid,
      plan_name: planId,
      amount: Number((((payment.amountPaise ?? plan.pricePaise) || 0) / 100).toFixed(2)),
      amount_paise: Number(payment.amountPaise ?? plan.pricePaise ?? 0),
      currency: payment.currency || 'INR',
      payment_gateway: payment.provider || process.env.PAYMENT_PROVIDER || 'cashfree',
      transaction_id: payment.paymentId || null,
      invoice_id: payment.invoiceId || payment.orderId || null,
      gateway_reference: payment.orderId || payment.subscriptionId || null,
      payment_status: String(payment.status || payment.eventType || 'paid').toLowerCase(),
      paid_at: payment.paidAt || null,
      updated_at: timestamp,
      created_at: timestamp,
      raw: payment.raw || null,
    },
  };
}

function syncCommercialState(state, uid, user, options = {}) {
  if (!uid || !user) return;
  const timestamp = options.timestamp || now();
  const planId = getPlanIdFromUser(user);
  state.subscriptions = state.subscriptions || {};
  state.featureEntitlements = state.featureEntitlements || {};
  state.usageTracking = state.usageTracking || {};
  state.payments = state.payments || {};

  state.subscriptions[uid] = buildSubscriptionRecord(uid, user, timestamp);
  state.featureEntitlements[uid] = buildFeatureEntitlements(uid, planId, timestamp);

  if (options.includeUsage !== false) {
    const usageRecord = buildUsageRecord(uid, user, timestamp);
    state.usageTracking[usageRecord.id] = usageRecord.data;
  }

  const paymentRecord = buildPaymentRecord(uid, planId, options.payment, timestamp);
  if (paymentRecord) {
    state.payments[paymentRecord.id] = paymentRecord.data;
  }
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
  if (!fs.existsSync(STORE_PATH)) {
    return { users: {}, conversations: {}, messages: {}, subscriptions: {}, payments: {}, usageTracking: {}, featureEntitlements: {}, analytics: [] };
  }
  try {
    const state = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return {
      users: state.users || {},
      conversations: state.conversations || {},
      messages: state.messages || {},
      subscriptions: state.subscriptions || {},
      payments: state.payments || {},
      usageTracking: state.usageTracking || {},
      featureEntitlements: state.featureEntitlements || {},
      analytics: Array.isArray(state.analytics) ? state.analytics : [],
    };
  } catch (_error) {
    return { users: {}, conversations: {}, messages: {}, subscriptions: {}, payments: {}, usageTracking: {}, featureEntitlements: {}, analytics: [] };
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
  if (user.usageDate !== dayKey(Date.now())) {
    user.dailyFreeUsageCount = 0;
    user.dailyFreeUsageResetAt = nextReset();
    user.usageDate = dayKey(Date.now());
    changed = true;
  }
  if (shouldSyncCommercialState(user)) {
    user.lastCommercialSyncAt = now();
    changed = true;
  }
  if (changed) {
    user.accountStatus = buildAccountStatus(user);
    user.updatedAt = now();
    state.users[uid] = user;
    syncCommercialState(state, uid, user, { includeUsage: true, timestamp: user.updatedAt });
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
  const currentTime = now();
    const user = {
      ...base,
      name: profile.name || base.name,
      email: String(profile.email || base.email || '').toLowerCase(),
      phone: normalizePhone(profile.phone || base.phone),
      avatar: profile.avatar || base.avatar,
    authProvider: profile.authProvider || base.authProvider || 'puter',
    accountStatus: 'active',
    lastActiveAt: currentTime,
    lastLoginAt: currentTime,
    updatedAt: currentTime,
    createdAt: base.createdAt || currentTime,
  };
  state.users[profile.uid] = user;
  syncCommercialState(state, profile.uid, user, { includeUsage: true, timestamp: currentTime });
  writeState(state);
  return user;
}

async function takeQuota(uid, resolvedPlanId = null) {
  const state = readState();
  const user = refreshUser(state, uid);
  if (!user) throw new Error('User record not found.');

  const planId = normalizePlanId(resolvedPlanId || getPlanIdFromUser(user));
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
  user.accountStatus = buildAccountStatus(user);
  state.users[uid] = user;
  syncCommercialState(state, uid, user, { includeUsage: true, timestamp: user.updatedAt });
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

  let affectsOnboarding = false;
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'persona')) user.persona = normalizePersona(updates.persona);
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'persona')) affectsOnboarding = true;
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'primaryUseCase')) {
    user.primaryUseCase = String(updates.primaryUseCase || '').trim();
    affectsOnboarding = true;
  }
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'phone')) user.phone = normalizePhone(updates.phone);
  if (updates?.onboardingCompleted) {
    user.onboardingCompletedAt = user.onboardingCompletedAt || now();
    affectsOnboarding = true;
  }
  if (affectsOnboarding) {
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
  state.messages = state.messages || {};
  const id = payload.id || crypto.randomUUID();
  const current = state.conversations[uid][id] || {};
  const userMessageAt = now();
  const assistantMessageAt = now();
  const messages = Array.isArray(current.messages) ? current.messages.slice(-38) : [];
  const nextMessages = messages.concat([
    { role: 'user', content: payload.userText, at: userMessageAt },
    {
      role: 'assistant',
      content: payload.answerText,
      at: assistantMessageAt,
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
    updatedAt: assistantMessageAt,
    createdAt: current.createdAt || userMessageAt,
    isPinned: !!current.isPinned,
    messageCount: nextMessages.length,
    messages: nextMessages,
  };
  state.conversations[uid][id] = conversation;
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  state.messages[userMessageId] = {
    message_id: userMessageId,
    conversation_id: id,
    user_id: uid,
    role: 'user',
    content: payload.userText,
    model_used: '',
    timestamp: userMessageAt,
    created_at: userMessageAt,
  };
  state.messages[assistantMessageId] = {
    message_id: assistantMessageId,
    conversation_id: id,
    user_id: uid,
    role: 'assistant',
    content: payload.answerText,
    model_used: payload.model || '',
    model_label: payload.modelLabel || '',
    model_tier: payload.modelTier || '',
    timestamp: assistantMessageAt,
    created_at: assistantMessageAt,
  };
  const user = refreshUser(state, uid) || normalize(uid, {});
  user.totalMessages = Number(user.totalMessages || 0) + 2;
  user.totalConversations = Number(user.totalConversations || 0) + (current.createdAt ? 0 : 1);
  user.lastActiveAt = assistantMessageAt;
  user.updatedAt = assistantMessageAt;
  user.createdAt = user.createdAt || assistantMessageAt;
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
  state.messages = Object.fromEntries(
    Object.entries(state.messages || {}).filter(([, message]) => message.conversation_id !== id)
  );
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
  const conversationIds = new Set(Object.keys(state.conversations[uid] || {}));
  delete state.conversations[uid];
  state.messages = Object.fromEntries(
    Object.entries(state.messages || {}).filter(([, message]) => !conversationIds.has(message.conversation_id))
  );
  writeState(state);
}

async function activatePaidPlan(uid, planId, payment) {
  const state = readState();
  const user = refreshUser(state, uid) || normalize(uid, {});
  const plan = getPlanConfig(planId);
  const paymentOrderId = String(payment?.orderId || '').trim();
  const paymentId = String(payment?.paymentId || '').trim();
  const requestedEndAt = Date.parse(payment?.subscriptionEnd || 0);
  const currentEndAt = Date.parse(user.subscriptionEnd || 0);
  const alreadyApplied =
    normalizePlanId(user.plan) === plan.id
    && String(user.subscriptionStatus || '').toLowerCase() === 'active'
    && Date.parse(user.subscriptionEnd || 0) > Date.now()
    && (
      (paymentOrderId && String(user.billingSubscriptionId || '').trim() === paymentOrderId)
      || (paymentId && String(user.billingPaymentId || '').trim() === paymentId)
    );
  if (alreadyApplied && (!Number.isFinite(requestedEndAt) || requestedEndAt <= 0 || currentEndAt >= requestedEndAt)) {
    return user;
  }
  const end = Number.isFinite(requestedEndAt) && requestedEndAt > 0
    ? new Date(requestedEndAt)
    : new Date(Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000);
  user.plan = plan.id;
  user.subscriptionStatus = 'active';
  user.subscriptionStart = String(payment?.subscriptionStart || '').trim() || user.subscriptionStart || now();
  user.subscriptionEnd = end.toISOString();
  user.billingProvider = payment.provider || process.env.PAYMENT_PROVIDER || 'cashfree';
  user.billingCustomerId = payment.customerId || null;
  user.billingSubscriptionId = payment.subscriptionId || payment.orderId || null;
  user.billingPaymentId = payment.paymentId || null;
  user.phone = normalizePhone(payment.customerPhone || user.phone);
  user.authProvider = user.authProvider || 'puter';
  user.accountStatus = 'active';
  user.dailyFreeUsageCount = 0;
  user.dailyFreeUsageResetAt = nextReset();
  user.lastActiveAt = now();
  user.updatedAt = now();
  user.createdAt = user.createdAt || now();
  state.users[uid] = user;
  syncCommercialState(state, uid, user, {
    includeUsage: true,
    timestamp: user.updatedAt,
    payment: {
      ...payment,
      amountPaise: payment?.amountPaise ?? plan.pricePaise,
      currency: payment?.currency || 'INR',
      paidAt: user.updatedAt,
    },
  });
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

async function recordCheckoutIntent(uid, planId, checkout) {
  const state = readState();
  const normalizedPlan = normalizePlanId(planId);
  const plan = getPlanConfig(normalizedPlan);
  const currentTime = now();
  const paymentRecord = buildPaymentRecord(uid, normalizedPlan, {
    provider: checkout?.provider || process.env.PAYMENT_PROVIDER || 'cashfree',
    orderId: checkout?.orderId || '',
    paymentId: checkout?.paymentSessionId || '',
    invoiceId: checkout?.orderId || '',
    status: checkout?.status || 'initiated',
    eventType: 'checkout_started',
    amountPaise: checkout?.amountPaise ?? plan.pricePaise,
    currency: checkout?.currency || 'INR',
    paidAt: null,
    raw: checkout?.raw || null,
  }, currentTime);
  if (!paymentRecord) return null;
  state.payments = state.payments || {};
  state.payments[paymentRecord.id] = paymentRecord.data;
  writeState(state);
  return paymentRecord.data;
}

async function recordPaymentEvent(uid, planId, payment) {
  const state = readState();
  const normalizedPlan = normalizePlanId(planId);
  const plan = getPlanConfig(normalizedPlan);
  const currentTime = now();
  const paymentRecord = buildPaymentRecord(uid, normalizedPlan, {
    provider: payment?.provider || process.env.PAYMENT_PROVIDER || 'cashfree',
    orderId: payment?.orderId || '',
    paymentId: payment?.paymentId || '',
    invoiceId: payment?.invoiceId || payment?.orderId || '',
    subscriptionId: payment?.subscriptionId || '',
    status: payment?.status || 'received',
    eventType: payment?.eventType || 'webhook_received',
    amountPaise: payment?.amountPaise ?? plan.pricePaise,
    currency: payment?.currency || 'INR',
    paidAt: payment?.paidAt || null,
    raw: payment?.raw || null,
  }, currentTime);
  if (!paymentRecord) return null;
  state.payments = state.payments || {};
  state.payments[paymentRecord.id] = paymentRecord.data;
  state.analytics = Array.isArray(state.analytics) ? state.analytics : [];
  state.analytics.push({
    uid,
    eventName: payment?.eventType || 'webhook_received',
    metadata: {
      provider: payment?.provider || process.env.PAYMENT_PROVIDER || 'cashfree',
      planId: normalizedPlan,
      status: payment?.status || 'received',
      orderId: payment?.orderId || '',
      paymentId: payment?.paymentId || '',
    },
    createdAt: currentTime,
  });
  writeState(state);
  return paymentRecord.data;
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

const INSIGHTS_KEY = 'legalInsights';

const defaultInsights = [
  {id:1,title:"What is an FIR?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"First Information Report is the initial document that registers a crime with the police.",whyItMatters:"Filing an FIR sets the criminal justice process in motion. Without it, most criminal cases cannot proceed.",coreRule:"Under CrPC Section 154, any person can report a cognizable offense to the police, who must register it and investigate.",example:"If you witness a theft, you file an FIR at the police station, leading to investigation.",takeaway:"An FIR is the first step. Delay or refusal can be challenged in court.",featured:true},
  {id:2,title:"What is Anticipatory Bail?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Advance bail granted before arrest to protect against imminent custody.",whyItMatters:"Allows individuals to avoid pre-trial detention when they fear false accusations.",coreRule:"Section 438 of CrPC enables courts to grant anticipatory bail.",example:"A businessperson anticipating false fraud charges can seek anticipatory bail.",takeaway:"Protects against harassment while ensuring cooperation.",featured:false},
  {id:3,title:"What is Arbitration?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Private dispute resolution by a neutral third party instead of court.",whyItMatters:"Faster, confidential, and cheaper than traditional litigation.",coreRule:"Arbitration and Conciliation Act, 1996 enforces arbitration awards.",example:"Contract dispute resolved by an arbitrator whose decision is binding.",takeaway:"Include arbitration clauses in contracts.",featured:false},
  {id:4,title:"What is Money Laundering?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Processing illegal money to appear legitimate through hidden transactions.",whyItMatters:"A serious crime that finances terrorism and organized crime.",coreRule:"Prevention of Money Laundering Act, 2002 criminalizes proceeds of crime.",example:"Breaking large cash deposits into smaller amounts to avoid reporting.",takeaway:"Compliance and KYC are essential defenses.",featured:false},
  {id:5,title:"What is Consideration in Contracts?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Something of value exchanged between parties to form a valid contract.",whyItMatters:"Without consideration, a contract is generally unenforceable.",coreRule:"Indian Contract Act, Section 2(d) defines consideration.",example:"You pay ₹500 for a book - payment is consideration.",takeaway:"Always ensure consideration is clearly stated.",featured:false},
  {id:6,title:"What is Significant Influence?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Power to affect company decisions without formal control.",whyItMatters:"Determines corporate group relationships.",coreRule:"AS 21 defines significant influence as 20%+ voting power.",example:"25% shareholder influencing board decisions.",takeaway:"Key for understanding group structures.",featured:false},
  {id:7,title:"What is Oppression and Mismanagement?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Minority shareholder protection against majority abuse.",whyItMatters:"Provides legal remedy when shareholders treated unfairly.",coreRule:"Section 397-398 of Companies Act allows NCLT petition.",example:"Minority shareholders ousted from management can petition NCLT.",takeaway:"Document oppression with evidence.",featured:false},
  {id:8,title:"What is Insider Trading?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Trading securities using unpublished price-sensitive information.",whyItMatters:"Serious offense that undermines market integrity.",coreRule:"SEBI Insider Trading Regulations, 2015 prohibit UPSI trading.",example:"CEO selling shares before announcing poor earnings.",takeaway:"Maintain compliance programs.",featured:false},
  {id:9,title:"What is a Writ Petition?",category:"Constitutional Law",readTime:"1 min",oneLineMeaning:"Direct constitutional remedy against state action violating rights.",whyItMatters:"Fastest way to challenge government violations.",coreRule:"Article 32 (Supreme Court) and Article 226 (High Court).",example:"Filing habeas corpus if wrongly detained.",takeaway:"Writs are extraordinary remedies.",featured:false},
  {id:10,title:"What is Corporate Veil?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Legal separation between a company and its owners.",whyItMatters:"Protects shareholders from personal liability.",coreRule:"Courts can pierce veil under fraud or evasion.",example:"Using company to evade personal debts.",takeaway:"Maintain corporate formalities.",featured:false},
  {id:11,title:"What is Specific Performance?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Court order enforcing contract execution.",whyItMatters:"Unique goods cannot be substituted with damages.",coreRule:"Specific Relief Act enables specific performance.",example:"Court ordering sale of heritage property.",takeaway:"Discretionary - adequate remedies preferred.",featured:false},
  {id:12,title:"What is Defamation?",category:"Constitutional Law",readTime:"1 min",oneLineMeaning:"False statement harming another's reputation.",whyItMatters:"Protects personal and professional reputation.",coreRule:"IPC Sections 499-500 criminalize defamation.",example:"Publishing false corruption allegations.",takeaway:"Truth is a defense.",featured:false},
  {id:13,title:"What is Mens Rea?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Guilty mind - criminal intent or knowledge of wrongdoing.",whyItMatters:"Essential element for criminal liability.",coreRule:"Requires actus reus AND mens rea.",example:"Accidental death vs. knowing murder.",takeaway:"Understand mens rea requirements.",featured:false},
  {id:14,title:"What is Res Judicata?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Same matter cannot be litigated twice.",whyItMatters:"Prevents endless litigation.",coreRule:"CPC Section 11 bars same cause action.",example:"Suing and losing bars same suit.",takeaway:"One judgment ends the matter.",featured:false},
  {id:15,title:"What is Cheque Bounce?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Dishonor of cheque due to insufficient funds.",whyItMatters:"Criminal offense under Section 138 of NI Act.",coreRule:"Cheque bounce is criminal within validity period.",example:"Cheque bounces due to stop payment.",takeaway:"Can lead to 2 years imprisonment.",featured:false},
  {id:16,title:"What is Copyright Infringement?",category:"IP Law",readTime:"1 min",oneLineMeaning:"Unauthorized use of protected creative works.",whyItMatters:"Protects creators' intellectual property.",coreRule:"Copyright Act, 1957 protects original works.",example:"Using song lyrics without permission.",takeaway:"Fair use exceptions exist.",featured:false},
  {id:17,title:"What is Limited Liability?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Shareholder liability limited to unpaid capital.",whyItMatters:"Protects personal assets from business debts.",coreRule:"LL companies shield owners from personal liability.",example:"Company debts are not personal debts.",takeaway:"Maintain corporate formalities.",featured:false},
  {id:18,title:"What is a Show Cause Notice?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Formal notice requiring explanation before action.",whyItMatters:"Procedural requirement before penalties.",coreRule:"Natural justice requires opportunity to explain.",example:"Tax department issuing show cause.",takeaway:"Always respond within deadline.",featured:false}
];

function getInsights() {
  const state = readState();
  if (!state[INSIGHTS_KEY] || state[INSIGHTS_KEY].length === 0) {
    saveInsights(defaultInsights);
    return defaultInsights;
  }
  return state[INSIGHTS_KEY];
}

function saveInsights(insights) {
  const state = readState();
  state[INSIGHTS_KEY] = insights;
  writeState(state);
}

function getFeaturedInsight() {
  const insights = getInsights();
  return insights.find(i => i.featured) || insights[0] || null;
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
  getInsights,
  getFeaturedInsight,
  isLocalDevStoreEnabled,
  isPro,
  listConversations,
  recordCheckoutIntent,
  recordPaymentEvent,
  clearConversations,
  removeConversation,
  renameConversation,
  recordRetentionActivity,
  saveConversation,
  saveInsights,
  setPinned,
  takeQuota,
  track,
  updateUserProfile,
  upsertUser,
  getAnalyticsSummary,
};
