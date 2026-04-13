const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENTERPRISE_USERS_FILE = path.join(__dirname, '_data', 'enterprise-users.json');
const ADMIN_CONFIG_FILE = path.join(__dirname, '_data', 'admin-config.json');

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

function readAdminConfig() {
  try {
    ensureDataDir();
    if (!fs.existsSync(ADMIN_CONFIG_FILE)) {
      return { passwordHash: null };
    }
    const data = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { passwordHash: null };
  }
}

function writeAdminConfig(config) {
  try {
    ensureDataDir();
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    return false;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'lexorium-admin-salt').digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function getHtmlPage(configured) {
  const htmlPath = path.join(__dirname, 'enterprise-admin.html');
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf-8');
    if (!configured) {
      html = html.replace('id="emailInput"', 'id="emailInput" disabled');
      html = html.replace('id="addBtn"', 'id="addBtn" disabled');
    }
    return html;
  }
  return '<html><body><h1>Admin page not found</h1></body></html>';
}

function getLoginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lexorium Enterprise Admin - Login</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,9..144,300;0,9..144,400;1,9..144,300;1,9..144,400&family=Jost:wght@200;300;400;500&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0A0A0A;
      --bg2: #1F1F1F;
      --silver: #C0C0C0;
      --white: #FFFFFF;
      --line: rgba(192,192,192,0.12);
      --line2: rgba(192,192,192,0.22);
      --purple: #8B5CF6;
    }

    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--white);
      font-family: 'Jost', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .card {
      background: var(--bg2);
      border: 1px solid var(--line2);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }

    .brand {
      font-family: 'Fraunces', serif;
      font-style: italic;
      font-size: 32px;
      margin-bottom: 8px;
    }

    .brand span { color: var(--purple); }

    .subtitle {
      color: var(--silver);
      font-size: 14px;
      font-weight: 300;
      margin-bottom: 30px;
    }

    input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--line2);
      border-radius: 10px;
      color: var(--white);
      font-family: 'Jost', sans-serif;
      font-size: 14px;
      outline: none;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }

    input:focus { border-color: rgba(139, 92, 246, 0.5); }

    .btn {
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 10px;
      font-family: 'Jost', sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--purple), #6366F1);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.3);
    }

    .error {
      color: #f87171;
      font-size: 13px;
      margin-bottom: 16px;
      padding: 10px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 8px;
    }

    .hint {
      color: var(--silver);
      font-size: 12px;
      margin-top: 20px;
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Lexorium <span>Enterprise</span></div>
    <div class="subtitle">Admin Panel</div>
    <form method="POST" action="/api/admin/enterprise/login">
      ${error ? `<div class="error">${error}</div>` : ''}
      <input type="password" name="password" placeholder="Enter admin password" required autofocus>
      <button type="submit" class="btn btn-primary">Login</button>
    </form>
    <div class="hint">Contact your server administrator for access</div>
  </div>
</body>
</html>`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function validateSession(token) {
  if (!token) return false;
  const sessions = readAdminConfig().sessions || {};
  const session = sessions[token];
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    delete sessions[token];
    writeAdminConfig({ ...readAdminConfig(), sessions });
    return false;
  }
  return true;
}

function createSession() {
  const token = getSessionToken();
  const config = readAdminConfig();
  const sessions = config.sessions || {};
  sessions[token] = {
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000)
  };
  writeAdminConfig({ ...config, sessions });
  return token;
}

async function handleAdminEnterprise(req, res) {
  const method = req.method.toUpperCase();
  const accept = req.headers?.accept || '';
  const contentType = req.headers?.['content-type'] || '';
  const isApiRequest = accept.includes('application/json') && !accept.includes('text/html');
  const cookies = parseCookies(req);
  const sessionToken = cookies['lexorium_admin_session'];
  
  const config = readAdminConfig();
  const isConfigured = Boolean(config.passwordHash);
  const isAuthenticated = validateSession(sessionToken);

  if (method === 'GET' && !isApiRequest) {
    if (!isConfigured) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      let html = getHtmlPage(false);
      html = html.replace('<!-- SETUP_MESSAGE -->', `
        <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 10px; padding: 16px; margin-bottom: 20px; text-align: center;">
          <strong style="color: #a78bfa;">Setup Required</strong>
          <p style="color: var(--silver); font-size: 12px; margin-top: 8px;">Set admin password via terminal or API</p>
          <div style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; text-align: left; font-family: monospace; font-size: 11px; color: #4ade80;">
            curl -X POST https://lexoriumai.com/api/admin/enterprise<br>
            -H "Content-Type: application/json"<br>
            -d '{"password":"your-secure-password"}'
          </div>
        </div>
      `);
      return res.send(html);
    }

    if (!isAuthenticated) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(getLoginPage());
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getHtmlPage(true));
  }

    if (!isAuthenticated) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(getLoginPage());
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getHtmlPage(true));
  }

  if (method === 'GET') {
    if (!isConfigured) {
      return res.json({ ok: false, message: 'Admin not configured. Run setup first.' });
    }
    if (!isAuthenticated) {
      return res.status(401).json({ ok: false, message: 'Unauthorized. Please login.' });
    }
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

    const contentType = req.headers?.['content-type'] || '';
    const isFormData = contentType.includes('application/x-www-form-urlencoded');
    
    let parsed;
    if (isFormData) {
      parsed = Object.fromEntries(new URLSearchParams(body));
    } else {
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ ok: false, message: 'Invalid request body' });
      }
    }

    if (parsed.action === 'setup') {
      if (isConfigured) {
        return res.status(400).json({ ok: false, message: 'Admin already configured' });
      }
      if (!parsed.password || parsed.password.length < 6) {
        return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
      }
      const hash = hashPassword(parsed.password);
      writeAdminConfig({ passwordHash: hash, sessions: {} });
      const token = createSession();
      res.setHeader('Set-Cookie', `lexorium_admin_session=${token}; Path=/api/admin/enterprise; HttpOnly; Max-Age=${60*60*24}; SameSite=Strict`);
      return res.json({ ok: true, message: 'Admin configured successfully' });
    }

    if (!isConfigured) {
      return res.status(400).json({ ok: false, message: 'Admin not configured. Run setup first.' });
    }

    if (parsed.action === 'login') {
      if (isAuthenticated) {
        return res.json({ ok: true, message: 'Already logged in' });
      }
      if (!verifyPassword(parsed.password, config.passwordHash)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getLoginPage('Invalid password'));
      }
      const token = createSession();
      res.setHeader('Set-Cookie', `lexorium_admin_session=${token}; Path=/api/admin/enterprise; HttpOnly; Max-Age=${60*60*24}; SameSite=Strict`);
      if (isHtmlRequest) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getHtmlPage(true));
      }
      return res.json({ ok: true, message: 'Logged in successfully' });
    }

    if (parsed.action === 'logout') {
      const sessions = config.sessions || {};
      delete sessions[sessionToken];
      writeAdminConfig({ ...config, sessions });
      res.setHeader('Set-Cookie', `lexorium_admin_session=; Path=/api/admin/enterprise; HttpOnly; Max-Age=0`);
      if (isHtmlRequest) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(getLoginPage());
      }
      return res.json({ ok: true, message: 'Logged out successfully' });
    }

    if (parsed.action === 'changepassword') {
      if (!isAuthenticated) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' });
      }
      if (!parsed.newPassword || parsed.newPassword.length < 6) {
        return res.status(400).json({ ok: false, message: 'New password must be at least 6 characters' });
      }
      if (!verifyPassword(parsed.currentPassword, config.passwordHash)) {
        return res.status(400).json({ ok: false, message: 'Current password is incorrect' });
      }
      const hash = hashPassword(parsed.newPassword);
      writeAdminConfig({ passwordHash: hash, sessions: {} });
      const token = createSession();
      res.setHeader('Set-Cookie', `lexorium_admin_session=${token}; Path=/api/admin/enterprise; HttpOnly; Max-Age=${60*60*24}; SameSite=Strict`);
      return res.json({ ok: true, message: 'Password changed successfully' });
    }

    if (!isAuthenticated) {
      return res.status(401).json({ ok: false, message: 'Unauthorized. Please login.' });
    }

    const { email, action } = parsed;

    if (!email && action !== 'list') {
      return res.status(400).json({ ok: false, message: 'Email is required' });
    }

    const normalizedEmail = email ? normalizeEmail(email) : '';

    if (normalizedEmail && !normalizedEmail.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Invalid email address' });
    }

    const users = readEnterpriseUsers();

    if (action === 'remove') {
      const existingIndex = users.findIndex(u => u.email === normalizedEmail);
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

    return res.status(400).json({ ok: false, message: 'Invalid action' });
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

function parseCookies(req) {
  const cookieHeader = req.headers?.cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    cookies[name.trim()] = rest.join('=').trim();
  });
  return cookies;
}

module.exports = handleAdminEnterprise;
