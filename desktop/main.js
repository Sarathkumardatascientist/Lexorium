const { app, BrowserWindow, shell, ipcMain, desktopCapturer, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const DESKTOP_ICON_PATH = path.join(__dirname, 'icon.png');

function readDesktopConfig() {
  const candidates = [
    path.join(process.resourcesPath || '', 'app-config.json'),
    path.join(__dirname, 'app-config.json'),
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && parsed.appUrl) return parsed;
    } catch (_error) {
      continue;
    }
  }

  return {
    appUrl: process.env.LEXORIUM_DESKTOP_APP_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000',
  };
}

function fallbackHtml(targetUrl) {
  let logoMarkup = '';
  try {
    const logoBase64 = fs.readFileSync(DESKTOP_ICON_PATH).toString('base64');
    logoMarkup = `<span class="brand-mark"><img src="data:image/png;base64,${logoBase64}" alt="Lexorium logo"></span>`;
  } catch (_error) {
    logoMarkup = '';
  }

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Lexorium Desktop</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0A;color:#fff;font-family:Segoe UI,Arial,sans-serif}
      .card{max-width:560px;padding:32px;border:1px solid rgba(192,192,192,.16);border-radius:24px;background:#111;text-align:left}
      .brand{display:flex;align-items:center;gap:14px;margin:0 0 18px}
      .brand-mark{width:44px;height:44px;border-radius:14px;overflow:hidden;display:inline-flex;box-shadow:0 16px 32px rgba(0,0,0,.28)}
      .brand-mark img{width:100%;height:100%;object-fit:cover;display:block}
      .brand-copy{display:grid;gap:4px}
      .brand-name{font-family:Georgia,serif;font-size:24px;font-style:italic;line-height:1}
      .brand-tag{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.56)}
      h1{margin:0 0 12px;font-size:28px;font-weight:600}
      p{margin:0 0 14px;line-height:1.6;color:rgba(255,255,255,.78)}
      a{color:#fff}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">${logoMarkup}<div class="brand-copy"><div class="brand-name">Lexorium</div><div class="brand-tag">Desktop</div></div></div>
      <h1>Lexorium could not open</h1>
      <p>The desktop app is configured to load <strong>${targetUrl}</strong>, but that server is not reachable right now.</p>
      <p>Update <code>desktop/app-config.json</code> to your deployed Lexorium URL before packaging the production desktop app.</p>
      <p><a href="${targetUrl}">${targetUrl}</a></p>
    </div>
  </body>
  </html>`;
}

async function getCameraSources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    });
    return sources.filter(s => s.id.startsWith('camera'));
  } catch (_error) {
    return [];
  }
}

async function captureCamera(win) {
  try {
    const cameras = await getCameraSources();
    
    if (cameras.length === 0) {
      const result = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Camera',
        message: 'No camera source found.',
        detail: 'Please connect a webcam to use the camera feature.',
        buttons: ['OK']
      });
      return null;
    }

    const source = cameras[0];
    
    if (desktopCapturer.isScreenCapturerEnabled && !desktopCapturer.isScreenCapturerEnabled()) {
      const result = await dialog.showMessageBox(win, {
        type: 'error',
        title: 'Permission Denied',
        message: 'Screen capture permission is required for camera access.',
        detail: 'Please enable screen capture in your system settings.',
        buttons: ['OK']
      });
      return null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id
        }
      }
    });

    return stream;
  } catch (_error) {
    console.error('Camera capture error:', _error);
    return null;
  }
}

async function createWindow() {
  const config = readDesktopConfig();
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#0A0A0A',
    icon: DESKTOP_ICON_PATH,
    title: 'Lexorium',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  ipcMain.handle('capture-camera', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false
      });

      if (sources.length === 0) {
        return null;
      }

      const source = sources[0];
      const thumbnail = source.thumbnail.toDataURL();
      return thumbnail;
    } catch (_error) {
      console.error('Capture camera error:', _error);
      return null;
    }
  });

  ipcMain.handle('capture-photo', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false
      });

      if (sources.length === 0) {
        return null;
      }

      const source = sources[0];
      const thumbnail = source.thumbnail.toDataURL();
      return thumbnail;
    } catch (_error) {
      console.error('Capture photo error:', _error);
      return null;
    }
  });

  try {
    await win.loadURL(config.appUrl);
  } catch (_error) {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml(config.appUrl))}`);
  }
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
