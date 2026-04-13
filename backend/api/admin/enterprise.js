const fs = require('fs');
const path = require('path');

const ENTERPRISE_USERS_FILE = path.join(__dirname, '_data', 'enterprise-users.json');

function ensureDataDir() {
  const dataDir = path.join(__dirname, '_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

function readEnterpriseUsers() {
  try {
    ensureDataDir();
    if (!fs.existsSync(ENTERPRISE_USERS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(ENTERPRISE_USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading enterprise users:', err);
    return [];
  }
}

function writeEnterpriseUsers(users) {
  try {
    ensureDataDir();
    fs.writeFileSync(ENTERPRISE_USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing enterprise users:', err);
    return false;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function handleAdminEnterprise(req, res) {
  const method = req.method.toUpperCase();

  if (method === 'GET') {
    const users = readEnterpriseUsers();
    return res.json({
      ok: true,
      users: users.map(u => ({
        email: u.email,
        addedAt: u.addedAt,
        addedBy: u.addedBy || 'admin'
      })),
      count: users.length
    });
  }

  if (method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ ok: false, message: 'Invalid JSON body' });
    }

    const { email, action } = parsed;

    if (!email) {
      return res.status(400).json({ ok: false, message: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Invalid email address' });
    }

    const users = readEnterpriseUsers();
    const existingIndex = users.findIndex(u => u.email === normalizedEmail);

    if (action === 'remove') {
      if (existingIndex === -1) {
        return res.status(404).json({ ok: false, message: 'User not found in enterprise list' });
      }
      users.splice(existingIndex, 1);
      if (!writeEnterpriseUsers(users)) {
        return res.status(500).json({ ok: false, message: 'Failed to save changes' });
      }
      return res.json({
        ok: true,
        message: `${normalizedEmail} has been removed from Enterprise`
      });
    }

    if (action === 'add' || !action) {
      if (existingIndex !== -1) {
        return res.json({
          ok: true,
          message: `${normalizedEmail} is already an Enterprise user`,
          alreadyExists: true
        });
      }

      users.push({
        email: normalizedEmail,
        addedAt: new Date().toISOString(),
        addedBy: parsed.addedBy || 'admin'
      });

      if (!writeEnterpriseUsers(users)) {
        return res.status(500).json({ ok: false, message: 'Failed to save changes' });
      }

      return res.json({
        ok: true,
        message: `${normalizedEmail} has been activated as Enterprise user`,
        user: {
          email: normalizedEmail,
          addedAt: new Date().toISOString()
        }
      });
    }

    return res.status(400).json({ ok: false, message: 'Invalid action. Use "add" or "remove"' });
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

module.exports = handleAdminEnterprise;
