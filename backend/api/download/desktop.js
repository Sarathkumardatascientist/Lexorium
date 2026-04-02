const fs = require('fs');
const path = require('path');

const LOCAL_INSTALLER_PATH = path.resolve(__dirname, '..', '..', '..', 'downloads', 'Lexorium-Setup.exe');
const LOCAL_INSTALLER_URL = '/downloads/Lexorium-Setup.exe';
const GITHUB_RELEASE_ASSET_URL = 'https://github.com/Sarathkumardatascientist/Lexorium/releases/latest/download/Lexorium-Setup.exe';
const GITHUB_RELEASES_PAGE_URL = 'https://github.com/Sarathkumardatascientist/Lexorium/releases';

function sanitizeUrl(value) {
  return String(value || '').trim();
}

function resolveDesktopDownloadUrl() {
  const configured = sanitizeUrl(process.env.LEXORIUM_DESKTOP_DOWNLOAD_URL);
  if (configured) return configured;
  if (fs.existsSync(LOCAL_INSTALLER_PATH)) return LOCAL_INSTALLER_URL;
  return GITHUB_RELEASE_ASSET_URL;
}

function renderFallbackPage() {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lexorium Desktop Download</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fff;font-family:Segoe UI,Arial,sans-serif;padding:24px}
      .card{max-width:640px;width:100%;padding:32px;border-radius:28px;background:rgba(18,18,18,.96);border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 80px rgba(0,0,0,.35)}
      .eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:14px}
      h1{margin:0 0 14px;font-size:34px;font-weight:600}
      p{margin:0 0 18px;color:rgba(255,255,255,.78);line-height:1.7}
      .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
      a{display:inline-flex;align-items:center;justify-content:center;padding:14px 18px;border-radius:999px;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.18)}
      a.primary{background:#fff;color:#111}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="eyebrow">Lexorium Desktop</div>
      <h1>Choose your download source</h1>
      <p>The direct installer is not hosted inside this deployment yet. You can still download the current Windows installer from GitHub Releases.</p>
      <div class="actions">
        <a class="primary" href="${GITHUB_RELEASE_ASSET_URL}">Direct Installer</a>
        <a href="${GITHUB_RELEASES_PAGE_URL}">All Releases</a>
      </div>
    </div>
  </body>
  </html>`;
}

module.exports = async (req, res) => {
  const target = resolveDesktopDownloadUrl();

  if (String(req.method || 'GET').toUpperCase() !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: 'Method not allowed.' }));
    return;
  }

  if (!target) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderFallbackPage());
    return;
  }

  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', target);
  res.end();
};
