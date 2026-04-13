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
    return [];
  }
}

function writeEnterpriseUsers(users) {
  try {
    ensureDataDir();
    fs.writeFileSync(ENTERPRISE_USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (err) {
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
    writeAdminConfig({ passwordHash: readAdminConfig().passwordHash, sessions: sessions });
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
  writeAdminConfig({ passwordHash: config.passwordHash, sessions: sessions });
  return token;
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
    req.on('data', function(chunk) {
      body += chunk;
    });
    req.on('end', function() {
      resolve(body);
    });
    req.on('error', function() {
      resolve('');
    });
  });
}

function handleAdminEnterprise(req, res) {
  const method = req.method.toUpperCase();
  const accept = req.headers.accept || '';
  const isApiRequest = accept.indexOf('application/json') !== -1 && accept.indexOf('text/html') === -1;
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.lexorium_admin_session;
  
  const config = readAdminConfig();
  const isConfigured = Boolean(config.passwordHash);
  const isAuthenticated = validateSession(sessionToken);

  if (method === 'GET' && !isApiRequest) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!isConfigured) {
      res.statusCode = 200;
      return res.end('<html><body style="font-family:Arial;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:400px;text-align:center"><h1 style="font-size:24px;margin-bottom:16px">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;margin-bottom:24px">Set up your admin password</p><input type="password" id="pwd" placeholder="Password (min 6 chars)" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:12px"><input type="password" id="conf" placeholder="Confirm password" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px"><button onclick="setup()" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer">Set Password</button><p id="msg" style="margin-top:16px;font-size:13px;color:#4ade80;display:none"></p><script>function setup(){var p=document.getElementById("pwd").value;var c=document.getElementById("conf").value;var m=document.getElementById("msg");if(p.length<6){m.style.color="#f87171";m.textContent="Min 6 characters";m.style.display="block";return}if(p!==c){m.style.color="#f87171";m.textContent="Passwords dont match";m.style.display="block";return}fetch("/api/admin/enterprise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p,action:"setup"})}).then(function(r){return r.json()}).then(function(d){if(d.ok){m.style.color="#4ade80";m.textContent="Password set!";setTimeout(function(){location.reload()},1000)}else{m.style.color="#f87171";m.textContent=d.message||"Error"}}).catch(function(){m.style.color="#f87171";m.textContent="Error"}})</script></div></body></html>');
    }
    if (!isAuthenticated) {
      res.statusCode = 200;
      return res.end('<html><body style="font-family:Arial;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:400px;text-align:center"><h1 style="font-size:24px;margin-bottom:16px;font-style:italic">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;margin-bottom:24px">Admin Login</p><form method="POST" action="/api/admin/enterprise/login"><input type="password" name="password" placeholder="Password" required style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px"><button type="submit" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer">Login</button></form></div></body></html>');
    }
    const users = readEnterpriseUsers();
    let usersHtml = '';
    if (users.length === 0) {
      usersHtml = '<p style="color:#666;text-align:center;padding:20px">No enterprise users yet</p>';
    } else {
      usersHtml = users.map(function(u) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px"><div><div style="font-size:13px;word-break:break-all">' + u.email + '</div><div style="font-size:11px;color:#666;margin-top:2px">Added: ' + new Date(u.addedAt).toLocaleDateString() + '</div></div><button onclick="remove(\'' + u.email.replace(/'/g, '\\\'') + '\')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer">Remove</button></div>';
      }).join('');
    }
    res.statusCode = 200;
    res.end('<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lexorium Enterprise Admin</title></head><body style="font-family:Arial;background:#0A0A0A;color:#fff;padding:40px 20px;margin:0"><div style="max-width:600px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px"><div><h1 style="font-size:24px;font-style:italic;margin:0">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;font-size:13px;margin:4px 0 0">Admin Panel</p></div><button onclick="logout()" style="background:rgba(255,255,255,0.1);border:1px solid #444;color:#888;padding:8px 16px;border-radius:8px;font-size:12px;cursor:pointer">Logout</button></div><div style="background:#1F1F1F;padding:30px;border-radius:16px;margin-bottom:20px"><p style="color:#888;margin-bottom:16px">Enter user email to grant Enterprise access</p><input type="email" id="email" placeholder="user@company.com" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:12px"><button onclick="addUser()" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer;margin-bottom:8px">Activate Enterprise Access</button><button onclick="loadUsers()" style="width:100%;padding:12px;border-radius:10px;border:1px solid #444;background:rgba(255,255,255,0.05);color:#888;font-size:14px;cursor:pointer">Refresh List</button><p id="msg" style="margin-top:16px;font-size:13px;display:none"></p></div><div style="background:#1F1F1F;padding:30px;border-radius:16px"><h3 style="font-size:12px;color:#888;text-transform:uppercase;margin:0 0 16px">Enterprise Users <span style="background:#8B5CF6;color:white;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px">' + users.length + '</span></h3><div id="users">' + usersHtml + '</div></div></div><script>function showMsg(t,c){var m=document.getElementById("msg");m.textContent=t;m.style.color=c?"#f87171":"#4ade80";m.style.display="block";setTimeout(function(){m.style.display="none"},5000)}function addUser(){var e=document.getElementById("email").value.trim();if(!e||!e.includes("@")){showMsg("Enter valid email",true);return}fetch("/api/admin/enterprise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,action:"add"})}).then(function(r){return r.json()}).then(function(d){if(d.ok){showMsg(d.message);document.getElementById("email").value="";loadUsers()}else{showMsg(d.message||"Error",true)}}).catch(function(){showMsg("Connection error",true)})}function remove(email){if(!confirm("Remove "+email+"?"))return;fetch("/api/admin/enterprise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email,action:"remove"})}).then(function(r){return r.json()}).then(function(d){if(d.ok){loadUsers()}else{showMsg(d.message||"Error",true)}}).catch(function(){showMsg("Connection error",true)})}function loadUsers(){fetch("/api/admin/enterprise").then(function(r){return r.json()}).then(function(d){var h="";if(d.ok&&d.users&&d.users.length){d.users.forEach(function(u){h+=\'<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px"><div><div style="font-size:13px;word-break:break-all">\'+u.email+\'</div><div style="font-size:11px;color:#666;margin-top:2px">Added: \'+(new Date(u.addedAt)).toLocaleDateString()+\'</div></div><button onclick="remove(\\ \\'\\'+u.email.replace(/\\ \\'/g,"\\\\\\\\\\ \\'\\'\\)+\'\\ \\')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer">Remove</button></div>\'})}else{h=\'<p style="color:#666;text-align:center;padding:20px">No enterprise users yet</p>\'}document.getElementById("users").innerHTML=h;document.querySelector("h3 span").textContent=d.count||0}).catch(function(){document.getElementById("users").innerHTML=\'<p style="color:#f87171;text-align:center;padding:20px">Failed to load</p>\'})}function logout(){fetch("/api/admin/enterprise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})}).then(function(){location.reload()})}document.getElementById("email").addEventListener("keypress",function(e){if(e.key==="Enter")addUser()})</script></body></html>');
  }

  return readBody(req).then(function(body) {
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

    if (parsed.action === 'setup') {
      if (isConfigured) {
        return res.status(400).json({ ok: false, message: 'Already configured' });
      }
      if (!parsed.password || parsed.password.length < 6) {
        return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
      }
      const hash = hashPassword(parsed.password);
      writeAdminConfig({ passwordHash: hash, sessions: {} });
      const token = createSession();
      res.setHeader('Set-Cookie', 'lexorium_admin_session=' + token + '; Path=/api/admin/enterprise; HttpOnly; Max-Age=86400');
      return res.json({ ok: true, message: 'Password set successfully' });
    }

    if (parsed.action === 'login') {
      if (isAuthenticated) {
        return res.json({ ok: true, message: 'Already logged in' });
      }
      if (!verifyPassword(parsed.password, config.passwordHash)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 401;
        return res.end('<html><body style="font-family:Arial;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:400px;text-align:center"><h1 style="font-size:24px;margin-bottom:16px;font-style:italic">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;margin-bottom:24px">Admin Login</p><p style="color:#f87171;margin-bottom:16px;font-size:13px">Invalid password</p><form method="POST" action="/api/admin/enterprise/login"><input type="password" name="password" placeholder="Password" required style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px"><button type="submit" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer">Login</button></form></div></body></html>');
      }
      const loginToken = createSession();
      res.setHeader('Set-Cookie', 'lexorium_admin_session=' + loginToken + '; Path=/api/admin/enterprise; HttpOnly; Max-Age=86400');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 302;
      res.setHeader('Location', '/api/admin/enterprise');
      return res.end('Redirecting...');
    }

    if (parsed.action === 'logout') {
      const cfg = readAdminConfig();
      const sess = cfg.sessions || {};
      delete sess[sessionToken];
      writeAdminConfig({ passwordHash: cfg.passwordHash, sessions: sess });
      res.setHeader('Set-Cookie', 'lexorium_admin_session=; Path=/api/admin/enterprise; HttpOnly; Max-Age=0');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 302;
      res.setHeader('Location', '/api/admin/enterprise');
      return res.end('Redirecting...');
    }

    if (!isConfigured) {
      return res.status(400).json({ ok: false, message: 'Admin not configured' });
    }

    if (!isAuthenticated) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const email = parsed.email;
    const action = parsed.action;

    if (action === 'list') {
      const users = readEnterpriseUsers();
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

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Invalid email' });
    }

    const users = readEnterpriseUsers();

    if (action === 'remove') {
      let idx = -1;
      for (let i = 0; i < users.length; i++) {
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
      for (let j = 0; j < users.length; j++) {
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
  });
}

module.exports = handleAdminEnterprise;
