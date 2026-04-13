const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'lexorium-admin-salt').digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(function(cookie) {
    const parts = cookie.split('=');
    if (parts.length > 1) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return cookies;
}

async function readBody(req) {
  return new Promise(function(resolve) {
    let body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() { resolve(body); });
    req.on('error', function() { resolve(''); });
  });
}

async function handleAdminEnterprise(req, res) {
  const method = req.method.toUpperCase();
  const url = require('url').parse(req.url, true);
  const accept = req.headers.accept || '';
  const isApiRequest = accept.indexOf('application/json') !== -1 && accept.indexOf('text/html') === -1;
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.lexorium_admin_session;

  const adminPassword = process.env.LEXORIUM_ADMIN_PASSWORD || '';
  const adminPasswordHash = adminPassword ? hashPassword(adminPassword) : '';
  const isConfigured = Boolean(adminPassword);

  let sessions = {};
  if (process.env.LEXORIUM_ADMIN_SESSIONS) {
    try {
      sessions = JSON.parse(Buffer.from(process.env.LEXORIUM_ADMIN_SESSIONS, 'base64').toString());
    } catch (e) { sessions = {}; }
  }

  function validateSession(token) {
    if (!token) return false;
    const session = sessions[token];
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      delete sessions[token];
      return false;
    }
    return true;
  }

  function saveSessions() {
    process.env.LEXORIUM_ADMIN_SESSIONS = Buffer.from(JSON.stringify(sessions)).toString('base64');
  }

  function createSession() {
    const token = getSessionToken();
    sessions[token] = {
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
    saveSessions();
    return token;
  }

  const isAuthenticated = validateSession(sessionToken);

  if (method === 'GET' && !isApiRequest) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!isConfigured) {
      res.statusCode = 200;
      return res.end('<html><body style="font-family:Arial,sans-serif;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:100%;max-width:400px;text-align:center"><h1 style="font-size:24px;margin:0 0 8px">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;margin-bottom:24px">Admin Setup Required</p><p style="color:#f87171;font-size:13px;margin-bottom:20px">Set LEXORIUM_ADMIN_PASSWORD in Vercel environment variables first.</p><p style="color:#666;font-size:12px;text-align:left;background:#111;padding:16px;border-radius:8px">1. Go to Vercel Dashboard<br>2. Select your project<br>3. Go to Settings → Environment Variables<br>4. Add: LEXORIUM_ADMIN_PASSWORD = yourpassword<br>5. Redeploy</p></div></body></html>');
    }

    if (!isAuthenticated) {
      res.statusCode = 200;
      return res.end('<html><body style="font-family:Arial,sans-serif;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:400px;text-align:center"><h1 style="font-size:24px;margin:0 0 8px;font-style:italic">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;margin-bottom:24px">Admin Login</p><form method="POST"><input type="password" name="password" placeholder="Password" required style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px"><button type="submit" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer">Login</button></form></div></body></html>');
    }

    res.statusCode = 200;
    res.end('<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lexorium Enterprise Admin</title></head><body style="font-family:Arial,sans-serif;background:#0A0A0A;color:#fff;padding:40px 20px;margin:0"><div style="max-width:600px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px"><div><h1 style="font-size:24px;font-style:italic;margin:0">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;font-size:13px;margin:4px 0 0">Admin Panel</p></div><button onclick="logout()" style="background:rgba(255,255,255,0.1);border:1px solid #444;color:#888;padding:8px 16px;border-radius:8px;font-size:12px;cursor:pointer">Logout</button></div><div style="background:#1F1F1F;padding:30px;border-radius:16px;margin-bottom:20px"><p style="color:#888;margin-bottom:16px">Enter user email to grant Enterprise access</p><input type="email" id="email" placeholder="user@company.com" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:12px"><button onclick="addUser()" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer;margin-bottom:8px">Activate Enterprise Access</button><p id="msg" style="margin-top:12px;font-size:13px;display:none"></p></div><p style="color:#666;font-size:12px;text-align:center">Refresh page to see updated user list. Enterprise users are checked from LEXORIUM_ENTERPRISE_EMAILS env var.</p></div><script>function showMsg(t,c){var m=document.getElementById("msg");m.textContent=t;m.style.color=c?"#f87171":"#4ade80";m.style.display="block";setTimeout(function(){m.style.display="none"},5000)}function addUser(){var e=document.getElementById("email").value.trim();if(!e||!e.includes("@")){showMsg("Enter valid email",true);return}fetch("/api/admin/enterprise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,action:"add"})}).then(function(r){return r.json()}).then(function(d){if(d.ok){showMsg(d.message);document.getElementById("email").value=""}else{showMsg(d.message||"Error",true)}}).catch(function(){showMsg("Connection error",true)})}function logout(){fetch("/api/admin/enterprise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})}).then(function(){location.reload()})}</script></body></html>');
    return;
  }

  const body = await readBody(req);
  const contentType = req.headers['content-type'] || '';
  var parsed = {};

  if (contentType.indexOf('application/x-www-form-urlencoded') !== -1) {
    const params = new URLSearchParams(body);
    params.forEach(function(value, key) { parsed[key] = value; });
  } else if (contentType.indexOf('application/json') !== -1) {
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ ok: false, message: 'Invalid request' });
    }
  }

  if (parsed.action === 'login') {
    if (!isConfigured) {
      return res.status(400).json({ ok: false, message: 'Admin not configured. Set LEXORIUM_ADMIN_PASSWORD env var.' });
    }
    if (!verifyPassword(parsed.password, adminPasswordHash)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 401;
      return res.end('<html><body style="font-family:Arial,sans-serif;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:400px;text-align:center"><h1 style="font-size:24px;margin:0 0 8px;font-style:italic">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#f87171;margin-bottom:24px;font-size:13px">Invalid password</p><form method="POST"><input type="password" name="password" placeholder="Password" required style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px"><button type="submit" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer">Login</button></form></div></body></html>');
    }
    const loginToken = createSession();
    res.setHeader('Set-Cookie', 'lexorium_admin_session=' + loginToken + '; Path=/api/admin/enterprise; HttpOnly; Max-Age=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 302;
    res.setHeader('Location', '/api/admin/enterprise');
    return res.end('Redirecting...');
  }

  if (parsed.action === 'logout') {
    delete sessions[sessionToken];
    saveSessions();
    res.setHeader('Set-Cookie', 'lexorium_admin_session=; Path=/api/admin/enterprise; HttpOnly; Max-Age=0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 302;
    res.setHeader('Location', '/api/admin/enterprise');
    return res.end('Redirecting...');
  }

  if (!isConfigured) {
    return res.status(400).json({ ok: false, message: 'Admin not configured. Set LEXORIUM_ADMIN_PASSWORD env var.' });
  }

  if (!isAuthenticated) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const email = parsed.email;
  const action = parsed.action;

  if (action === 'add' && email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Invalid email' });
    }

    const currentEmails = process.env.LEXORIUM_ENTERPRISE_EMAILS || '';
    const emailList = currentEmails ? currentEmails.split(',').map(function(e) { return e.trim().toLowerCase(); }) : [];

    if (emailList.indexOf(normalizedEmail) !== -1) {
      return res.json({ ok: true, message: normalizedEmail + ' is already Enterprise', alreadyExists: true });
    }

    emailList.push(normalizedEmail);
    process.env.LEXORIUM_ENTERPRISE_EMAILS = emailList.join(', ');

    return res.json({ ok: true, message: normalizedEmail + ' activated as Enterprise user' });
  }

  if (action === 'list') {
    const currentEmails = process.env.LEXORIUM_ENTERPRISE_EMAILS || '';
    const emailList = currentEmails ? currentEmails.split(',').map(function(e) { return { email: e.trim(), addedAt: new Date().toISOString() }; }) : [];
    return res.json({ ok: true, users: emailList, count: emailList.length });
  }

  return res.status(400).json({ ok: false, message: 'Invalid request' });
}

module.exports = handleAdminEnterprise;
