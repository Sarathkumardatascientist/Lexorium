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

function getSetupPage() {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Lexorium Enterprise Admin - Setup</title>\n  <style>\n    body { font-family: Arial, sans-serif; background: #0A0A0A; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }\n    .card { background: #1F1F1F; padding: 40px; border-radius: 16px; width: 400px; }\n    h1 { font-size: 24px; margin-bottom: 10px; }\n    h1 span { color: #8B5CF6; }\n    p { color: #C0C0C0; margin-bottom: 20px; font-size: 14px; }\n    input { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #444; background: #2a2a2a; color: #fff; font-size: 14px; box-sizing: border-box; margin-bottom: 16px; }\n    button { width: 100%; padding: 14px; border-radius: 10px; border: none; background: linear-gradient(135deg, #8B5CF6, #6366F1); color: white; font-size: 14px; cursor: pointer; }\n    button:hover { transform: translateY(-1px); }\n    .msg { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 13px; display: none; }\n    .msg.success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; }\n    .msg.error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>Lexorium <span>Enterprise</span></h1>\n    <p>Set up your admin password to manage enterprise users.</p>\n    <input type="password" id="password" placeholder="Enter password (min 6 characters)" minlength="6">\n    <input type="password" id="confirm" placeholder="Confirm password" minlength="6">\n    <button onclick="setup()">Set Password</button>\n    <div class="msg" id="msg"></div>\n  </div>\n  <script>\n    function setup() {\n      var pwd = document.getElementById("password").value;\n      var conf = document.getElementById("confirm").value;\n      var msg = document.getElementById("msg");\n      if (pwd.length < 6) { msg.className = "msg error"; msg.style.display = "block"; msg.textContent = "Password must be at least 6 characters"; return; }\n      if (pwd !== conf) { msg.className = "msg error"; msg.style.display = "block"; msg.textContent = "Passwords do not match"; return; }\n      msg.style.display = "none";\n      fetch("/api/admin/enterprise", {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ password: pwd, action: "setup" })\n      }).then(function(r) { return r.json(); })\n      .then(function(d) {\n        if (d.ok) {\n          msg.className = "msg success"; msg.style.display = "block"; msg.textContent = "Password set! Refreshing...";\n          setTimeout(function() { window.location.reload(); }, 1500);\n        } else {\n          msg.className = "msg error"; msg.style.display = "block"; msg.textContent = d.message || "Error";\n        }\n      })\n      .catch(function() { msg.className = "msg error"; msg.style.display = "block"; msg.textContent = "Connection error"; });\n    }\n    document.getElementById("password").addEventListener("keypress", function(e) { if (e.key === "Enter") setup(); });\n    document.getElementById("confirm").addEventListener("keypress", function(e) { if (e.key === "Enter") setup(); });\n  </script>\n</body>\n</html>';
}

function getLoginPage(error) {
  if (!error) error = '';
  var errorHtml = '';
  if (error) {
    errorHtml = '<div style="color:#f87171;font-size:13px;margin-bottom:16px;padding:10px;background:rgba(239,68,68,0.1);border-radius:8px;">' + error + '</div>';
  }
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Lexorium Enterprise Admin - Login</title>\n  <style>\n    body { font-family: Arial, sans-serif; background: #0A0A0A; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }\n    .card { background: #1F1F1F; padding: 40px; border-radius: 16px; width: 400px; text-align: center; }\n    h1 { font-size: 28px; margin-bottom: 8px; font-style: italic; }\n    h1 span { color: #8B5CF6; }\n    p { color: #C0C0C0; margin-bottom: 30px; font-size: 14px; }\n    input { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #444; background: #2a2a2a; color: #fff; font-size: 14px; box-sizing: border-box; margin-bottom: 16px; }\n    button { width: 100%; padding: 14px; border-radius: 10px; border: none; background: linear-gradient(135deg, #8B5CF6, #6366F1); color: white; font-size: 14px; cursor: pointer; }\n    button:hover { transform: translateY(-1px); }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>Lexorium <span>Enterprise</span></h1>\n    <p>Admin Panel</p>\n    <form method="POST" action="/api/admin/enterprise/login">\n      ' + errorHtml + '\n      <input type="password" name="password" placeholder="Enter admin password" required autofocus>\n      <button type="submit">Login</button>\n    </form>\n  </div>\n</body>\n</html>';
}

function getAdminPage() {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Lexorium Enterprise Admin</title>\n  <style>\n    body { font-family: Arial, sans-serif; background: #0A0A0A; color: #fff; padding: 40px 20px; margin: 0; }\n    .container { max-width: 600px; margin: 0 auto; }\n    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }\n    .brand { font-size: 24px; font-style: italic; }\n    .brand span { color: #8B5CF6; }\n    .logout { background: rgba(255,255,255,0.1); border: 1px solid #444; color: #C0C0C0; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 12px; }\n    .card { background: #1F1F1F; padding: 30px; border-radius: 16px; margin-bottom: 20px; }\n    label { display: block; font-size: 12px; color: #C0C0C0; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }\n    input { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #444; background: #2a2a2a; color: #fff; font-size: 14px; box-sizing: border-box; margin-bottom: 16px; }\n    .btn { padding: 14px 20px; border-radius: 10px; border: none; background: linear-gradient(135deg, #8B5CF6, #6366F1); color: white; font-size: 14px; cursor: pointer; width: 100%; }\n    .btn:hover { transform: translateY(-1px); }\n    .btn-secondary { background: rgba(255,255,255,0.1); margin-top: 10px; }\n    .msg { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 13px; display: none; }\n    .msg.success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; display: block; }\n    .msg.error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; display: block; }\n    h3 { font-size: 12px; color: #C0C0C0; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 16px; border-top: 1px solid #333; padding-top: 24px; }\n    .users { max-height: 300px; overflow-y: auto; }\n    .user { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 8px; margin-bottom: 8px; }\n    .user-info { flex: 1; }\n    .user-email { font-size: 13px; word-break: break-all; }\n    .user-date { font-size: 11px; color: #888; margin-top: 2px; }\n    .btn-remove { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; }\n    .btn-remove:hover { background: rgba(239,68,68,0.2); }\n    .empty { text-align: center; padding: 30px; color: #888; font-size: 13px; }\n    .count { background: #8B5CF6; color: white; padding: 2px 10px; border-radius: 10px; font-size: 11px; margin-left: 8px; }\n  </style>\n</head>\n<body>\n  <div class="container">\n    <div class="header">\n      <div><div class="brand">Lexorium <span>Enterprise</span></div><div style="color:#888;font-size:13px;">Admin Panel</div></div>\n      <button class="logout" onclick="logout()">Logout</button>\n    </div>\n    <div class="card">\n      <label>User Email Address</label>\n      <input type="email" id="email" placeholder="user@company.com">\n      <button class="btn" onclick="addUser()">Activate Enterprise Access</button>\n      <button class="btn btn-secondary" onclick="loadUsers()">Refresh List</button>\n      <div class="msg" id="msg"></div>\n      <h3>Current Enterprise Users <span class="count" id="count">0</span></h3>\n      <div class="users" id="users"><div class="empty">Loading...</div></div>\n    </div>\n  </div>\n  <script>\n    function showMsg(text, isError) {\n      var m = document.getElementById("msg");\n      m.textContent = text;\n      m.className = "msg " + (isError ? "error" : "success");\n      setTimeout(function() { m.className = "msg"; m.style.display = "none"; }, 5000);\n    }\n    function addUser() {\n      var email = document.getElementById("email").value.trim();\n      if (!email || !email.includes("@")) { showMsg("Please enter a valid email", true); return; }\n      fetch("/api/admin/enterprise", {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ email: email, action: "add" })\n      }).then(function(r) { return r.json(); })\n      .then(function(d) {\n        if (d.ok) { showMsg(d.message); document.getElementById("email").value = ""; loadUsers(); }\n        else { showMsg(d.message || "Error", true); }\n      })\n      .catch(function() { showMsg("Connection error", true); });\n    }\n    function removeUser(email) {\n      if (!confirm("Remove " + email + " from Enterprise?")) return;\n      fetch("/api/admin/enterprise", {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ email: email, action: "remove" })\n      }).then(function(r) { return r.json(); })\n      .then(function(d) {\n        if (d.ok) { showMsg(d.message); loadUsers(); }\n        else { showMsg(d.message || "Error", true); }\n      })\n      .catch(function() { showMsg("Connection error", true); });\n    }\n    function loadUsers() {\n      var u = document.getElementById("users");\n      var c = document.getElementById("count");\n      u.innerHTML = "<div class=empty>Loading...</div>";\n      fetch("/api/admin/enterprise").then(function(r) { return r.json(); })\n      .then(function(d) {\n        if (d.ok && d.users && d.users.length > 0) {\n          c.textContent = d.users.length;\n          u.innerHTML = d.users.map(function(user) {\n            return "<div class=user><div class=user-info><div class=user-email>" + escapeHtml(user.email) + "</div><div class=user-date>Added: " + formatDate(user.addedAt) + "</div></div><button class=btn-remove onclick=\"removeUser(\'" + escapeHtml(user.email).replace(/\'/g, "\\\\'") + "\')\">Remove</button></div>";\n          }).join("");\n        } else {\n          c.textContent = "0";\n          u.innerHTML = "<div class=empty>No enterprise users yet</div>";\n        }\n      })\n      .catch(function() { u.innerHTML = "<div class=empty>Failed to load</div>"; });\n    }\n    function logout() {\n      fetch("/api/admin/enterprise", {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ action: "logout" })\n      }).then(function() { window.location.reload(); });\n    }\n    function escapeHtml(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }\n    function formatDate(s) {\n      if (!s) return "Unknown";\n      var d = new Date(s);\n      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });\n    }\n    document.getElementById("email").addEventListener("keypress", function(e) { if (e.key === "Enter") addUser(); });\n    loadUsers();\n  </script>\n</body>\n</html>';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function validateSession(token) {
  if (!token) return false;
  var sessions = readAdminConfig().sessions || {};
  var session = sessions[token];
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    delete sessions[token];
    writeAdminConfig({ passwordHash: readAdminConfig().passwordHash, sessions: sessions });
    return false;
  }
  return true;
}

function createSession() {
  var token = getSessionToken();
  var config = readAdminConfig();
  var sessions = config.sessions || {};
  sessions[token] = {
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000)
  };
  writeAdminConfig({ passwordHash: config.passwordHash, sessions: sessions });
  return token;
}

function parseCookies(req) {
  var cookieHeader = req.headers.cookie || '';
  var cookies = {};
  cookieHeader.split(';').forEach(function(cookie) {
    var parts = cookie.split('=');
    if (parts.length > 1) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return cookies;
}

async function handleAdminEnterprise(req, res) {
  var method = req.method.toUpperCase();
  var accept = req.headers.accept || '';
  var isApiRequest = accept.indexOf('application/json') !== -1 && accept.indexOf('text/html') === -1;
  var cookies = parseCookies(req);
  var sessionToken = cookies.lexorium_admin_session;
  
  var config = readAdminConfig();
  var isConfigured = Boolean(config.passwordHash);
  var isAuthenticated = validateSession(sessionToken);

  if (method === 'GET' && !isApiRequest) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!isConfigured) {
      return res.send(getSetupPage());
    }
    if (!isAuthenticated) {
      return res.send(getLoginPage());
    }
    return res.send(getAdminPage());
  }

  var body = '';
  try {
    for await (var chunk of req) {
      body += chunk;
    }
  } catch (e) {}

  var contentType = req.headers['content-type'] || '';
  var parsed = {};
  
  if (contentType.indexOf('application/x-www-form-urlencoded') !== -1) {
    var params = new URLSearchParams(body);
    params.forEach(function(value, key) { parsed[key] = value; });
  } else if (contentType.indexOf('application/json') !== -1) {
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ ok: false, message: 'Invalid request' });
    }
  }

  if (parsed.action === 'setup') {
    if (isConfigured) {
      return res.json({ ok: false, message: 'Already configured' });
    }
    if (!parsed.password || parsed.password.length < 6) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
    }
    var hash = hashPassword(parsed.password);
    writeAdminConfig({ passwordHash: hash, sessions: {} });
    var token = createSession();
    res.setHeader('Set-Cookie', 'lexorium_admin_session=' + token + '; Path=/api/admin/enterprise; HttpOnly; Max-Age=86400');
    return res.json({ ok: true, message: 'Password set successfully' });
  }

  if (parsed.action === 'login') {
    if (isAuthenticated) {
      return res.json({ ok: true, message: 'Already logged in' });
    }
    if (!verifyPassword(parsed.password, config.passwordHash)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(getLoginPage('Invalid password'));
    }
    var loginToken = createSession();
    res.setHeader('Set-Cookie', 'lexorium_admin_session=' + loginToken + '; Path=/api/admin/enterprise; HttpOnly; Max-Age=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getAdminPage());
  }

  if (parsed.action === 'logout') {
    var cfg = readAdminConfig();
    var sess = cfg.sessions || {};
    delete sess[sessionToken];
    writeAdminConfig({ passwordHash: cfg.passwordHash, sessions: sess });
    res.setHeader('Set-Cookie', 'lexorium_admin_session=; Path=/api/admin/enterprise; HttpOnly; Max-Age=0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getLoginPage());
  }

  if (!isConfigured) {
    return res.status(400).json({ ok: false, message: 'Admin not configured' });
  }

  if (!isAuthenticated) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  var email = parsed.email;
  var action = parsed.action;

  if (action === 'list') {
    var users = readEnterpriseUsers();
    return res.json({
      ok: true,
      users: users.map(function(u) {
        return { email: u.email, addedAt: u.addedAt, addedBy: u.addedBy || 'admin' };
      }),
      count: users.length
    });
  }

  if (!email) {
    return res.status(400).json({ ok: false, message: 'Email required' });
  }

  var normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail.includes('@')) {
    return res.status(400).json({ ok: false, message: 'Invalid email' });
  }

  var users = readEnterpriseUsers();

  if (action === 'remove') {
    var idx = -1;
    for (var i = 0; i < users.length; i++) {
      if (users[i].email === normalizedEmail) { idx = i; break; }
    }
    if (idx === -1) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }
    users.splice(idx, 1);
    if (!writeEnterpriseUsers(users)) {
      return res.status(500).json({ ok: false, message: 'Failed to save' });
    }
    return res.json({ ok: true, message: normalizedEmail + ' removed from Enterprise' });
  }

  if (action === 'add' || !action) {
    for (var j = 0; j < users.length; j++) {
      if (users[j].email === normalizedEmail) {
        return res.json({ ok: true, message: normalizedEmail + ' is already Enterprise', alreadyExists: true });
      }
    }
    users.push({
      email: normalizedEmail,
      addedAt: new Date().toISOString(),
      addedBy: parsed.addedBy || 'admin'
    });
    if (!writeEnterpriseUsers(users)) {
      return res.status(500).json({ ok: false, message: 'Failed to save' });
    }
    return res.json({
      ok: true,
      message: normalizedEmail + ' activated as Enterprise user',
      user: { email: normalizedEmail, addedAt: new Date().toISOString() }
    });
  }

  return res.status(400).json({ ok: false, message: 'Invalid action' });
}

module.exports = handleAdminEnterprise;
