const { getDb, FieldValue } = require('./firebase');
const { getDailyLimit, getPlanConfig, getPlanIdFromUser, isPlanAtLeast, normalizePlanId } = require('./plan-access');
const { CORE_RESPONSE_HEADINGS, applyDailyActivity, dayKey, derivePreferredTask, normalizeCountMap, normalizePersona } = require('./retention');

const PLAN_DURATION_DAYS = Number.parseInt(process.env.PLAN_DURATION_DAYS || process.env.PRO_PLAN_DURATION_DAYS || '30', 10) || 30;
const now = () => new Date().toISOString();
const nextReset = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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
    authProvider: data.authProvider || 'puter',
    accountStatus: data.accountStatus || 'active',
    plan: normalizePlanId(data.plan),
    subscriptionStatus: data.subscriptionStatus || 'inactive',
    subscriptionStart: data.subscriptionStart || null,
    subscriptionEnd: data.subscriptionEnd || null,
    billingProvider: data.billingProvider || null,
    billingCustomerId: data.billingCustomerId || null,
    billingSubscriptionId: data.billingSubscriptionId || null,
    billingPaymentId: data.billingPaymentId || null,
    dailyFreeUsageCount: Number(data.dailyFreeUsageCount || 0),
    dailyFreeUsageResetAt: data.dailyFreeUsageResetAt || nextReset(),
    totalMessages: Number(data.totalMessages || 0),
    totalConversations: Number(data.totalConversations || 0),
    lastActiveAt: data.lastActiveAt || null,
    lastLoginAt: data.lastLoginAt || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
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

function isExpiredPlan(user) {
  const planId = normalizePlanId(user?.plan);
  if (planId === 'free') return false;
  return !(user?.subscriptionEnd && Date.parse(user.subscriptionEnd) > Date.now() && String(user?.subscriptionStatus || '').toLowerCase() === 'active');
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
  return {
    id: safeDocKey(uid, date),
    data: {
      usage_id: safeDocKey(uid, date),
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
  const docId = safeDocKey(payment.paymentId || payment.orderId || payment.invoiceId || uid, payment.eventType || 'payment');
  return {
    id: docId,
    data: {
      payment_id: docId,
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

async function syncCommercialCollections(uid, user, options = {}) {
  if (!uid || !user) return;
  const timestamp = options.timestamp || now();
  const planId = getPlanIdFromUser(user);
  const batch = getDb().batch();

  batch.set(
    getDb().collection('subscriptions').doc(uid),
    buildSubscriptionRecord(uid, user, timestamp),
    { merge: true }
  );
  batch.set(
    getDb().collection('feature_entitlements').doc(uid),
    buildFeatureEntitlements(uid, planId, timestamp),
    { merge: true }
  );

  if (options.includeUsage !== false) {
    const usageRecord = buildUsageRecord(uid, user, timestamp);
    batch.set(getDb().collection('usage_tracking').doc(usageRecord.id), usageRecord.data, { merge: true });
  }

  const paymentRecord = buildPaymentRecord(uid, planId, options.payment, timestamp);
  if (paymentRecord) {
    batch.set(getDb().collection('payments').doc(paymentRecord.id), paymentRecord.data, { merge: true });
  }

  await batch.commit();
}

async function getUser(uid) {
  const ref = getDb().collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  let user = normalize(uid, snap.data());
  const updates = {};

  if (isExpiredPlan(user)) {
    updates.plan = 'free';
    updates.subscriptionStatus = 'inactive';
  }
  if (Date.parse(user.dailyFreeUsageResetAt || 0) <= Date.now()) {
    updates.dailyFreeUsageCount = 0;
    updates.dailyFreeUsageResetAt = nextReset();
  }
  if (Object.keys(updates).length) {
    updates.accountStatus = buildAccountStatus({ ...user, ...updates });
    updates.updatedAt = now();
    await ref.set(updates, { merge: true });
    user = { ...user, ...updates };
    await syncCommercialCollections(uid, user, { includeUsage: true, timestamp: updates.updatedAt });
  }

  return user;
}

async function upsertUser(profile) {
  const ref = getDb().collection('users').doc(profile.uid);
  const base = (await getUser(profile.uid)) || normalize(profile.uid, {});
  const currentTime = now();
  const payload = {
    ...base,
    name: profile.name || base.name,
    email: String(profile.email || base.email || '').toLowerCase(),
    avatar: profile.avatar || base.avatar,
    authProvider: profile.authProvider || base.authProvider || 'puter',
    accountStatus: 'active',
    lastActiveAt: currentTime,
    lastLoginAt: currentTime,
    updatedAt: currentTime,
    createdAt: base.createdAt || currentTime,
  };
  await ref.set(payload, { merge: true });
  await syncCommercialCollections(profile.uid, payload, { includeUsage: true, timestamp: currentTime });
  return payload;
}

async function track(uid, eventName, meta) {
  await getDb().collection('analytics').add({ uid: uid || null, eventName, meta: meta || {}, createdAt: now() });
}

async function updateUserProfile(uid, updates) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'persona')) payload.persona = normalizePersona(updates.persona);
  if (Object.prototype.hasOwnProperty.call(updates || {}, 'primaryUseCase')) payload.primaryUseCase = String(updates.primaryUseCase || '').trim();
  if (updates?.onboardingCompleted) payload.onboardingCompletedAt = now();
  if (Object.keys(payload).length) payload.onboardingUpdatedAt = now();
  payload.updatedAt = now();
  await getDb().collection('users').doc(uid).set(payload, { merge: true });
  return getUser(uid);
}

async function recordRetentionActivity(uid, classification, meta) {
  const ref = getDb().collection('users').doc(uid);
  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('User record not found.');

    const user = normalize(uid, snap.data());
    const currentTime = now();
    const activity = applyDailyActivity(user, currentTime);
    const taskType = String(classification?.taskType || '').trim();
    const queryTypeCounts = normalizeCountMap(user.queryTypeCounts);
    if (taskType) queryTypeCounts[taskType] = Number(queryTypeCounts[taskType] || 0) + 1;

    const payload = {
      queryTypeCounts,
      preferredTaskType: derivePreferredTask(queryTypeCounts),
      lastTaskType: taskType || user.lastTaskType || '',
      firstQueryAt: user.firstQueryAt || currentTime,
      lastQueryAt: currentTime,
      lastActiveAt: currentTime,
      lastActiveDayKey: activity.lastActiveDayKey,
      streakCount: activity.streakCount,
      longestStreak: activity.longestStreak,
      daysActiveTotal: activity.daysActiveTotal,
      updatedAt: currentTime,
    };

    if (meta?.persona) payload.persona = normalizePersona(meta.persona) || user.persona || '';
    if (meta?.primaryUseCase) payload.primaryUseCase = String(meta.primaryUseCase || '').trim() || user.primaryUseCase || '';
    if (meta?.completeOnboarding && (payload.persona || payload.primaryUseCase || user.persona || user.primaryUseCase)) {
      payload.onboardingCompletedAt = user.onboardingCompletedAt || currentTime;
      payload.onboardingUpdatedAt = currentTime;
    }

    tx.set(ref, payload, { merge: true });
    return { ...user, ...payload };
  });
}

async function takeQuota(uid) {
  const ref = getDb().collection('users').doc(uid);
  const result = await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('User record not found.');

    const user = normalize(uid, snap.data());
    if (Date.parse(user.dailyFreeUsageResetAt || 0) <= Date.now()) {
      user.dailyFreeUsageCount = 0;
      user.dailyFreeUsageResetAt = nextReset();
    }

    const planId = getPlanIdFromUser(user);
    const limit = getDailyLimit(planId);
    if (user.dailyFreeUsageCount >= limit) {
      return { ok: false, plan: planId, usage: buildUsage(user), first: user.totalMessages === 0, user };
    }

    const nextUsed = user.dailyFreeUsageCount + 1;
    const currentTime = now();
    const activity = applyDailyActivity(user, currentTime);
    const nextUser = {
      ...user,
      dailyFreeUsageCount: nextUsed,
      dailyFreeUsageResetAt: user.dailyFreeUsageResetAt || nextReset(),
      lastActiveAt: currentTime,
      lastActiveDayKey: activity.lastActiveDayKey,
      streakCount: activity.streakCount,
      longestStreak: activity.longestStreak,
      daysActiveTotal: activity.daysActiveTotal,
      updatedAt: currentTime,
      accountStatus: buildAccountStatus(user),
    };
    tx.set(ref, {
      dailyFreeUsageCount: nextUsed,
      dailyFreeUsageResetAt: nextUser.dailyFreeUsageResetAt,
      lastActiveAt: currentTime,
      lastActiveDayKey: activity.lastActiveDayKey,
      streakCount: activity.streakCount,
      longestStreak: activity.longestStreak,
      daysActiveTotal: activity.daysActiveTotal,
      updatedAt: currentTime,
    }, { merge: true });

    return {
      ok: true,
      plan: planId,
      usage: {
        limit,
        used: nextUsed,
        remaining: Math.max(limit - nextUsed, 0),
        resetAt: nextUser.dailyFreeUsageResetAt,
      },
      first: user.totalMessages === 0,
      user: nextUser,
    };
  });
  if (result?.user) {
    await syncCommercialCollections(uid, result.user, { includeUsage: true, timestamp: result.user.updatedAt || now() });
  }
  const { user, ...payload } = result;
  return payload;
}

function titleFrom(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value ? (value.length > 72 ? `${value.slice(0, 69)}...` : value) : 'Untitled conversation';
}

async function listConversations(uid) {
  const snap = await getDb().collection('users').doc(uid).collection('conversations').orderBy('updatedAt', 'desc').limit(100).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title,
      preview: data.preview,
      updatedAt: data.updatedAt,
      isPinned: !!data.isPinned,
      messageCount: Number(data.messageCount || 0),
    };
  });
}

async function getConversation(uid, id) {
  const snap = await getDb().collection('users').doc(uid).collection('conversations').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function saveConversation(uid, payload) {
  const userRef = getDb().collection('users').doc(uid);
  const ref = payload.id ? userRef.collection('conversations').doc(payload.id) : userRef.collection('conversations').doc();
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
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
  const title = current.title || payload.title || titleFrom(payload.userText);
  const doc = {
    title,
    preview: String(payload.answerText || '').slice(0, 180),
    updatedAt: assistantMessageAt,
    createdAt: current.createdAt || userMessageAt,
    isPinned: !!current.isPinned,
    messageCount: nextMessages.length,
    messages: nextMessages,
  };
  const userMessageRef = getDb().collection('messages').doc();
  const assistantMessageRef = getDb().collection('messages').doc();
  const batch = getDb().batch();
  batch.set(ref, doc, { merge: true });
  batch.set(userRef, {
    totalMessages: FieldValue.increment(2),
    totalConversations: snap.exists ? FieldValue.increment(0) : FieldValue.increment(1),
    lastActiveAt: assistantMessageAt,
    updatedAt: assistantMessageAt,
  }, { merge: true });
  batch.set(userMessageRef, {
    message_id: userMessageRef.id,
    conversation_id: ref.id,
    user_id: uid,
    role: 'user',
    content: payload.userText,
    model_used: '',
    timestamp: userMessageAt,
    created_at: userMessageAt,
  });
  batch.set(assistantMessageRef, {
    message_id: assistantMessageRef.id,
    conversation_id: ref.id,
    user_id: uid,
    role: 'assistant',
    content: payload.answerText,
    model_used: payload.model || '',
    model_label: payload.modelLabel || '',
    model_tier: payload.modelTier || '',
    timestamp: assistantMessageAt,
    created_at: assistantMessageAt,
  });
  await batch.commit();
  return { id: ref.id, ...doc };
}

async function setPinned(uid, id, value) {
  await getDb().collection('users').doc(uid).collection('conversations').doc(id).set({ isPinned: !!value, updatedAt: now() }, { merge: true });
}

async function removeConversation(uid, id) {
  await getDb().collection('users').doc(uid).collection('conversations').doc(id).delete();
}

async function renameConversation(uid, id, title) {
  await getDb().collection('users').doc(uid).collection('conversations').doc(id).set({
    title: String(title || '').trim(),
    updatedAt: now(),
  }, { merge: true });
}

async function clearConversations(uid) {
  const snap = await getDb().collection('users').doc(uid).collection('conversations').get();
  if (snap.empty) return;
  const batch = getDb().batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function activatePaidPlan(uid, planId, payment) {
  const current = (await getUser(uid)) || normalize(uid, {});
  const normalizedPlan = normalizePlanId(planId);
  const plan = getPlanConfig(normalizedPlan);
  const paymentOrderId = String(payment?.orderId || '').trim();
  const paymentId = String(payment?.paymentId || '').trim();
  const requestedEndAt = Date.parse(payment?.subscriptionEnd || 0);
  const currentEndAt = Date.parse(current.subscriptionEnd || 0);
  const alreadyApplied = current
    && normalizePlanId(current.plan) === plan.id
    && String(current.subscriptionStatus || '').toLowerCase() === 'active'
    && Date.parse(current.subscriptionEnd || 0) > Date.now()
    && (
      (paymentOrderId && String(current.billingSubscriptionId || '').trim() === paymentOrderId)
      || (paymentId && String(current.billingPaymentId || '').trim() === paymentId)
    );
  if (alreadyApplied && (!Number.isFinite(requestedEndAt) || requestedEndAt <= 0 || currentEndAt >= requestedEndAt)) {
    return current;
  }
  const end = Number.isFinite(requestedEndAt) && requestedEndAt > 0
    ? new Date(requestedEndAt)
    : new Date(Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const currentTime = now();
  const subscriptionStart = String(payment?.subscriptionStart || '').trim() || current.subscriptionStart || currentTime;
  const nextUser = {
    ...current,
    plan: plan.id,
    subscriptionStatus: 'active',
    subscriptionStart,
    subscriptionEnd: end.toISOString(),
    billingProvider: payment.provider || process.env.PAYMENT_PROVIDER || 'cashfree',
    billingCustomerId: payment.customerId || null,
    billingSubscriptionId: payment.subscriptionId || payment.orderId || null,
    billingPaymentId: payment.paymentId || null,
    authProvider: current.authProvider || 'puter',
    accountStatus: 'active',
    dailyFreeUsageCount: 0,
    dailyFreeUsageResetAt: nextReset(),
    updatedAt: currentTime,
    lastActiveAt: currentTime,
    createdAt: current.createdAt || currentTime,
  };
  await getDb().collection('users').doc(uid).set(nextUser, { merge: true });
  await syncCommercialCollections(uid, nextUser, {
    includeUsage: true,
    timestamp: currentTime,
    payment: {
      ...payment,
      amountPaise: payment?.amountPaise ?? plan.pricePaise,
      currency: payment?.currency || 'INR',
      paidAt: currentTime,
    },
  });
  await getDb().collection('billing_events').add({ uid, createdAt: currentTime, planId: plan.id, ...payment });
  return getUser(uid);
}

async function activatePro(uid, payment) {
  return activatePaidPlan(uid, 'pro', payment);
}

async function recordCheckoutIntent(uid, planId, checkout) {
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
  await getDb().collection('payments').doc(paymentRecord.id).set(paymentRecord.data, { merge: true });
  return paymentRecord.data;
}

async function recordPaymentEvent(uid, planId, payment) {
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
  await getDb().collection('payments').doc(paymentRecord.id).set(paymentRecord.data, { merge: true });
  await getDb().collection('billing_events').add({
    uid,
    createdAt: currentTime,
    planId: normalizedPlan,
    type: payment?.eventType || 'webhook_received',
    status: payment?.status || 'received',
    provider: payment?.provider || process.env.PAYMENT_PROVIDER || 'cashfree',
    orderId: payment?.orderId || '',
    paymentId: payment?.paymentId || '',
    raw: payment?.raw || null,
  });
  return paymentRecord.data;
}

async function findUserByEmail(email) {
  const snap = await getDb().collection('users').where('email', '==', String(email || '').toLowerCase()).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
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

async function getAnalyticsSummary() {
  const nowMs = Date.now();
  const usersSnap = await getDb().collection('users').get();
  const analyticsSnap = await getDb().collection('analytics').get();
  const users = usersSnap.docs.map((doc) => normalize(doc.id, doc.data()));
  const analytics = analyticsSnap.docs.map((doc) => doc.data());
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
      const retainedDay = dayKey(new Date(Date.parse(user.createdAt) + (days * 24 * 60 * 60 * 1000)).toISOString());
      return dayKey(user.lastQueryAt) >= retainedDay;
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
  isPro,
  listConversations,
  recordCheckoutIntent,
  recordPaymentEvent,
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
