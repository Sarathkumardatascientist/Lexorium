const { createSessionCookie } = require('./_session');
const { resolvePuterUser, extractPuterToken } = require('../_lib/puter-client');
const { parseJsonBody, requireMethod, sendError, sendJson } = require('../_lib/http');
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
    username: pickFirst(profile.username, profile.handle),
    handle: pickFirst(profile.handle, profile.username),
    full_name: pickFirst(profile.full_name, profile.displayName, profile.name),
    displayName: pickFirst(profile.displayName, profile.full_name, profile.name),
    name: pickFirst(profile.name, profile.displayName, profile.full_name),
    email: pickFirst(profile.email),
    avatar: pickFirst(profile.avatar, profile.picture, profile.profile_picture, profile.photoURL),
    picture: pickFirst(profile.picture, profile.avatar, profile.profile_picture, profile.photoURL),
    profile_picture: pickFirst(profile.profile_picture, profile.picture, profile.avatar, profile.photoURL),
    photoURL: pickFirst(profile.photoURL, profile.picture, profile.avatar, profile.profile_picture),
  };
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = await parseJsonBody(req).catch((error) => ({ __error: error }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const authToken = extractPuterToken(req, body);
  const fallbackProfile = sanitizeProfile(body.profile);
  if (!authToken && !fallbackProfile) return sendError(res, 400, 'A sign-in token is required.');

  let profile;
  try {
    profile = authToken ? await resolvePuterUser(authToken) : fallbackProfile;
  } catch (error) {
    if (fallbackProfile) {
      profile = fallbackProfile;
    } else {
      return sendError(res, error.statusCode || 401, error.message || 'Sign-in could not be verified.');
    }
  }

  const uid = buildStableUid(profile);
  if (!uid) {
    return sendError(res, 400, 'The sign-in profile did not include a stable identifier.');
  }

  const username = pickFirst(profile?.username, profile?.handle, profile?.displayName, profile?.name);
  const email = pickFirst(profile?.email, body.email);
  const avatar = pickFirst(profile?.avatar, profile?.picture, profile?.profile_picture, profile?.photoURL, body.avatar);
  const fallbackEmail = username ? `${username.toLowerCase()}@puter.local` : `${uid.replace(/^puter:/, '')}@puter.local`;
  const user = await upsertUser({
    uid,
    name: pickFirst(profile?.full_name, profile?.displayName, profile?.name, username, email, 'Lexorium User'),
    email: email || fallbackEmail,
    avatar,
  });

  await track(user.uid, 'puter_signin_completed', {
    username,
    email: user.email,
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
    profile: {
      uid: user.uid,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      picture: user.avatar,
      provider: 'puter',
      username,
    },
  });
};
