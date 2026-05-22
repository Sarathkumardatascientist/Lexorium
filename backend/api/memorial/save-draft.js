const { sendJson, sendError, parseJsonBody, requireMethod } = require('../_lib/http');
const path = require('path');
const fs = require('fs');

const DRAFTS_DIR = path.join(__dirname, '..', '..', '.local');
const DRAFTS_FILE = path.join(DRAFTS_DIR, 'memorial-drafts.json');

function readDrafts() {
  try {
    if (!fs.existsSync(DRAFTS_FILE)) return {};
    const raw = fs.readFileSync(DRAFTS_FILE, 'utf8');
    return JSON.parse(raw) || {};
  } catch { return {}; }
}

function writeDrafts(data) {
  try {
    if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const uid = String(req.query?.uid || '').trim();
    if (!uid) return sendError(res, 400, 'User ID is required.');
    const drafts = readDrafts();
    const userDrafts = drafts[uid] || [];
    return sendJson(res, 200, { ok: true, drafts: userDrafts });
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req).catch((err) => ({ __error: err }));
    if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

    const uid = String(body.uid || '').trim();
    const draft = body.draft;
    if (!uid || !draft) return sendError(res, 400, 'User ID and draft content are required.');

    const drafts = readDrafts();
    if (!drafts[uid]) drafts[uid] = [];

    const existingIndex = drafts[uid].findIndex((d) => d.id === draft.id);
    if (existingIndex >= 0) {
      drafts[uid][existingIndex] = { ...drafts[uid][existingIndex], ...draft, updatedAt: new Date().toISOString() };
    } else {
      drafts[uid].push({ ...draft, id: draft.id || String(Date.now()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }

    if (!writeDrafts(drafts)) return sendError(res, 500, 'Failed to save draft.');
    return sendJson(res, 200, { ok: true, draft: drafts[uid].find((d) => d.id === draft.id || d.id === (existingIndex >= 0 ? drafts[uid][existingIndex].id : null)) || drafts[uid][drafts[uid].length - 1] });
  }

  if (req.method === 'DELETE') {
    const uid = String(req.query?.uid || '').trim();
    const draftId = String(req.query?.id || '').trim();
    if (!uid || !draftId) return sendError(res, 400, 'User ID and draft ID are required.');

    const drafts = readDrafts();
    if (drafts[uid]) {
      drafts[uid] = drafts[uid].filter((d) => d.id !== draftId);
      writeDrafts(drafts);
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 405, 'Method not allowed.');
};
