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

function getCurrentEmails() {
  const envEmails = process.env.LEXORIUM_ENTERPRISE_EMAILS || '';
  return envEmails.split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(Boolean);
}

function saveEmails(emails) {
  process.env.LEXORIUM_ENTERPRISE_EMAILS = emails.join(', ');
}

async function handleAdminEnterprise(req, res) {
  const url = require('url').parse(req.url, true);
  const query = url.query;
  const pathname = url.pathname;
  const method = req.method.toUpperCase();
  const accept = req.headers.accept || '';
  const isApiRequest = accept.indexOf('application/json') !== -1 && accept.indexOf('text/html') === -1;

  const adminPassword = process.env.LEXORIUM_ADMIN_PASSWORD || '';
  const isConfigured = Boolean(adminPassword);

  if (method === 'GET' && !isApiRequest && !query.action) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!isConfigured) {
      res.statusCode = 200;
      return res.end('<html><body style="font-family:Arial,sans-serif;background:#0A0A0A;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px"><div style="background:#1F1F1F;padding:40px;border-radius:16px;width:100%;max-width:450px;text-align:center"><h1 style="font-size:24px;margin:0 0 8px">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;margin-bottom:24px">Setup Required</p><p style="color:#f87171;font-size:13px;margin-bottom:20px">Set LEXORIUM_ADMIN_PASSWORD in Vercel environment variables.</p><p style="color:#666;font-size:12px;text-align:left;background:#111;padding:16px;border-radius:8px;font-family:monospace">1. Vercel Dashboard<br>2. Project Settings<br>3. Environment Variables<br>4. Add LEXORIUM_ADMIN_PASSWORD<br>5. Redeploy</p></div></body></html>');
    }

    const currentEmails = getCurrentEmails();
    let usersHtml = '';
    if (currentEmails.length === 0) {
      usersHtml = '<p style="color:#666;text-align:center;padding:20px">No enterprise users</p>';
    } else {
      usersHtml = currentEmails.map(function(email) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px"><span style="font-size:13px;word-break:break-all">' + email + '</span></div>';
      }).join('');
    }

    res.statusCode = 200;
    res.end('<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lexorium Enterprise Admin</title></head><body style="font-family:Arial,sans-serif;background:#0A0A0A;color:#fff;padding:40px 20px;margin:0"><div style="max-width:600px;margin:0 auto"><div style="margin-bottom:30px"><h1 style="font-size:24px;font-style:italic;margin:0">Lexorium <span style="color:#8B5CF6">Enterprise</span></h1><p style="color:#888;font-size:13px;margin:4px 0 0">Admin Panel</p></div><div style="background:#1F1F1F;padding:30px;border-radius:16px;margin-bottom:20px"><p style="color:#888;margin-bottom:16px">Enter user email to grant Enterprise access</p><input type="email" id="email" placeholder="user@company.com" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:12px"><button onclick="addUser()" style="width:100%;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:white;font-size:14px;cursor:pointer;margin-bottom:8px">Activate Enterprise Access</button><p id="msg" style="margin-top:12px;font-size:13px;display:none"></p></div><div style="background:#1F1F1F;padding:30px;border-radius:16px"><h3 style="font-size:12px;color:#888;text-transform:uppercase;margin:0 0 16px">Enterprise Users <span style="background:#8B5CF6;color:white;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px">' + currentEmails.length + '</span></h3><div>' + usersHtml + '</div></div></div><script>function showMsg(t,c){var m=document.getElementById("msg");m.textContent=t;m.style.color=c?"#f87171":"#4ade80";m.style.display="block";setTimeout(function(){m.style.display="none"},5000)}function addUser(){var e=document.getElementById("email").value.trim();var p=prompt("Enter admin password:");if(!e||!e.includes("@")){showMsg("Enter valid email",true);return}if(!p){return}fetch("/api/admin/enterprise?email="+encodeURIComponent(e)+"&action=add&key="+encodeURIComponent(p)).then(function(r){return r.json()}).then(function(d){if(d.ok){showMsg(d.message);document.getElementById("email").value="";setTimeout(function(){location.reload()},1000)}else{showMsg(d.message||"Error",true)}}).catch(function(){showMsg("Connection error",true)})}</script></body></html>');
    return;
  }

  const email = query.email || '';
  const action = query.action || '';
  const key = query.key || '';

  if (!isConfigured) {
    return res.json({ ok: false, message: 'Admin not configured. Set LEXORIUM_ADMIN_PASSWORD env var.' });
  }

  if (!verifyPassword(key, hashPassword(adminPassword))) {
    return res.status(401).json({ ok: false, message: 'Invalid admin password' });
  }

  if (action === 'list') {
    const emails = getCurrentEmails();
    return res.json({ ok: true, users: emails, count: emails.length });
  }

  if (action === 'add' && email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Invalid email' });
    }

    const emails = getCurrentEmails();
    if (emails.indexOf(normalizedEmail) !== -1) {
      return res.json({ ok: true, message: normalizedEmail + ' is already Enterprise', alreadyExists: true });
    }

    emails.push(normalizedEmail);
    saveEmails(emails);

    return res.json({ ok: true, message: normalizedEmail + ' activated as Enterprise user' });
  }

  if (action === 'remove' && email) {
    const normalizedEmail = normalizeEmail(email);
    const emails = getCurrentEmails();
    const idx = emails.indexOf(normalizedEmail);
    
    if (idx === -1) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    emails.splice(idx, 1);
    saveEmails(emails);

    return res.json({ ok: true, message: normalizedEmail + ' removed from Enterprise' });
  }

  return res.json({ ok: false, message: 'Use ?action=add&email=...&key=password or open in browser' });
}

module.exports = handleAdminEnterprise;
