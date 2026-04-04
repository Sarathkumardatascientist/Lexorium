const { createSessionCookie } = require('./_session');
const { resolvePuterUser, extractPuterToken } = require('../_lib/puter-client');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
const { getPlanForProfile, getPublicPlanSummary, getUsageForPlan } = require('../_lib/plan-access');
const { buildRetentionSummary } = require('../_lib/retention');
const db = require('../_lib/db');
const devStore = require('../_lib/dev-store');

const store = devStore.isLocalDevStoreEnabled() ? devStore : db;
const { track, upsertUser } = store;

function clean(value) {
  return String(value || '').trim();
}

function pickFirst(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
}

function buildStableUid(profile) {
  const raw = pickFirst(profile?.uuid, profile?.id, profile?._id, profile?.username, profile?.email);
  return raw ? `puter:${raw.toLowerCase()}` : '';
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    uuid: pickFirst(profile.uuid, profile.id, profile._id),
    id: pickFirst(profile.id, profile.uuid, profile._id),
    _id: pickFirst(profile._id, profile.id, profile.uuid),
    username: pickFirst(profile.username, profile.handle, profile.login, profile.user_name),
    handle: pickFirst(profile.handle, profile.username, profile.login, profile.user_name),
    full_name: pickFirst(profile.full_name, profile.fullName, profile.display_name, profile.displayName, profile.name),
    fullName: pickFirst(profile.fullName, profile.full_name, profile.display_name, profile.displayName, profile.name),
    display_name: pickFirst(profile.display_name, profile.displayName, profile.full_name, profile.fullName, profile.name),
    displayName: pickFirst(profile.displayName, profile.display_name, profile.full_name, profile.fullName, profile.name),
    nickname: pickFirst(profile.nickname, profile.username, profile.handle),
    name: pickFirst(profile.name, profile.displayName, profile.display_name, profile.full_name, profile.fullName, profile.nickname),
    email: pickFirst(profile.email, profile.email_address, profile.mail),
    avatar: pickFirst(profile.avatar, profile.picture, profile.profile_picture, profile.photoURL),
    picture: pickFirst(profile.picture, profile.avatar, profile.profile_picture, profile.photoURL),
    profile_picture: pickFirst(profile.profile_picture, profile.picture, profile.avatar, profile.photoURL),
    photoURL: pickFirst(profile.photoURL, profile.picture, profile.avatar, profile.profile_picture),
  };
}

function mergeProfiles(primary, fallback) {
  const left = sanitizeProfile(primary) || {};
  const right = sanitizeProfile(fallback) || {};
  const merged = {
    uuid: pickFirst(left.uuid, right.uuid),
    id: pickFirst(left.id, right.id),
    _id: pickFirst(left._id, right._id),
    username: pickFirst(left.username, right.username),
    handle: pickFirst(left.handle, right.handle),
    full_name: pickFirst(left.full_name, left.fullName, left.display_name, left.displayName, left.name, right.full_name, right.fullName, right.display_name, right.displayName, right.name),
    displayName: pickFirst(left.displayName, left.display_name, left.full_name, left.fullName, left.name, right.displayName, right.display_name, right.full_name, right.fullName, right.name),
    name: pickFirst(left.name, left.displayName, left.display_name, left.full_name, left.fullName, left.nickname, right.name, right.displayName, right.display_name, right.full_name, right.fullName, right.nickname),
    nickname: pickFirst(left.nickname, right.nickname),
    email: pickFirst(left.email, right.email),
    avatar: pickFirst(left.avatar, left.picture, left.profile_picture, left.photoURL, right.avatar, right.picture, right.profile_picture, right.photoURL),
    picture: pickFirst(left.picture, left.avatar, left.profile_picture, left.photoURL, right.picture, right.avatar, right.profile_picture, right.photoURL),
    profile_picture: pickFirst(left.profile_picture, left.picture, left.avatar, right.profile_picture, right.picture, right.avatar),
    photoURL: pickFirst(left.photoURL, left.picture, left.avatar, right.photoURL, right.picture, right.avatar),
  };
  return Object.values(merged).some((value) => clean(value)) ? merged : null;
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const authToken = extractPuterToken(req, body);
  const fallbackProfile = sanitizeProfile(body.profile);
  if (!authToken && !fallbackProfile) return sendError(res, 400, 'A sign-in token is required.');

  let resolvedProfile = null;
  try {
    resolvedProfile = authToken ? sanitizeProfile(await resolvePuterUser(authToken)) : fallbackProfile;
  } catch (error) {
    if (fallbackProfile) {
      resolvedProfile = null;
    } else {
      return sendError(res, error.statusCode || 401, error.message || 'Sign-in could not be verified.');
    }
  }
  const profile = mergeProfiles(resolvedProfile, fallbackProfile);
  if (!profile) return sendError(res, 400, 'The sign-in profile could not be normalized.');

  const uid = buildStableUid(profile);
  if (!uid) {
    return sendError(res, 400, 'The sign-in profile did not include a stable identifier.');
  }

  const username = pickFirst(profile?.username, profile?.handle, profile?.nickname, profile?.displayName, profile?.name);
  const email = pickFirst(profile?.email, body.email);
  const avatar = pickFirst(profile?.avatar, profile?.picture, profile?.profile_picture, profile?.photoURL, body.avatar);
  const fallbackEmail = username ? `${username.toLowerCase()}@puter.local` : `${uid.replace(/^puter:/, '')}@puter.local`;
  const resolvedName = pickFirst(
    profile?.full_name,
    profile?.fullName,
    profile?.display_name,
    profile?.displayName,
    profile?.name,
    profile?.nickname,
    username,
    email
  );
  const fallbackName = uid.replace(/^puter:/, '') || 'Lexorium User';
  const user = await upsertUser({
    uid,
    authProvider: 'puter',
    name: resolvedName || fallbackName,
    email: email || fallbackEmail,
    avatar,
  });
  const planId = getPlanForProfile(user, req);
  const plan = getPublicPlanSummary(planId);
  const usage = getUsageForPlan(plan.id, user);
  const retention = buildRetentionSummary(user, plan, usage);

  await track(user.uid, 'puter_signin_completed', {
    username,
    email: user.email,
    planId,
  }).catch(() => null);

  res.setHeader('Set-Cookie', createSessionCookie({
    sub: user.uid,
    name: user.name,
    email: user.email,
    picture: user.avatar,
    provider: 'puter',
  }));

  return sendJson(res, 200, {
    ok: true,
    authenticated: true,
    profile: {
      uid: user.uid,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatar: user.avatar,
      picture: user.avatar,
      provider: 'puter',
      username,
      currentPlan: plan.id,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      totalMessages: user.totalMessages,
      totalConversations: user.totalConversations,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      features: plan.features,
      retention,
    },
    plan,
    usage,
    retention,
  });
};
