const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const AUDIO_EXTS = new Set(['.mp3','.wav','.m4a','.aac','.ogg','.flac','.opus','.wma']);
let mainWindow;

function appDataDir() {
  const dir = path.join(app.getPath('userData'), 'biodanza-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function configPath() { return path.join(appDataDir(), 'config.json'); }
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); }
  catch { return {}; }
}
function writeConfig(data) {
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), 'utf8');
}
function setLibraryRoot(rootPath) {
  const cfg = readConfig();
  cfg.libraryRoot = rootPath;
  cfg.updatedAt = new Date().toISOString();
  writeConfig(cfg);
}
function getLibraryRoot() { return readConfig().libraryRoot || ''; }

async function scanFolder(rootPath) {
  const files = [];
  async function walk(dir) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const st = await fsp.stat(full);
          const rel = path.relative(rootPath, full).split(path.sep).join('/');
          files.push({
            name: entry.name,
            path: full,
            relativePath: rel,
            size: st.size,
            lastModified: Math.trunc(st.mtimeMs),
            type: mimeFromExt(path.extname(entry.name)),
            fileUrl: pathToFileURL(full).href
          });
        } catch {}
      }
    }
  }
  await walk(rootPath);
  return files;
}
function mimeFromExt(ext) {
  switch (String(ext).toLowerCase()) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.ogg': return 'audio/ogg';
    case '.flac': return 'audio/flac';
    case '.opus': return 'audio/opus';
    case '.wma': return 'audio/x-ms-wma';
    default: return 'audio/mpeg';
  }
}
async function libraryPayload(rootPath) {
  if (!rootPath) return { status: 'none', files: [] };
  if (!fs.existsSync(rootPath)) return { status: 'missing', previousPath: rootPath, files: [] };
  const files = await scanFolder(rootPath);
  return { status: 'ok', rootPath, rootName: path.basename(rootPath), files };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1450,
    height: 950,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#eef3f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  ipcMain.handle('music:choose-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'בחר תיקיית מוזיקה',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const rootPath = result.filePaths[0];
    setLibraryRoot(rootPath);
    return libraryPayload(rootPath);
  });

  ipcMain.handle('music:reopen-folder', async () => libraryPayload(getLibraryRoot()));
  ipcMain.handle('music:library-info', async () => {
    const rootPath = getLibraryRoot();
    return { rootPath, rootName: rootPath ? path.basename(rootPath) : '', exists: !!rootPath && fs.existsSync(rootPath) };
  });
  ipcMain.handle('music:read-slice', async (_event, filePath, start, end) => {
    const fh = await fsp.open(filePath, 'r');
    try {
      const stat = await fh.stat();
      const s = Math.max(0, Number(start) || 0);
      const e = Math.min(stat.size, end == null ? stat.size : Number(end));
      const length = Math.max(0, e - s);
      const buffer = Buffer.alloc(length);
      await fh.read(buffer, 0, length, s);
      return buffer;
    } finally { await fh.close(); }
  });
  ipcMain.handle('music:write-playlist', async (_event, filename, content) => {
    const rootPath = getLibraryRoot();
    if (!rootPath || !fs.existsSync(rootPath)) return { ok: false, error: 'ספריית המוזיקה אינה זמינה.' };
    const safe = path.basename(String(filename || 'biodanza_playlist.m3u8'));
    const target = path.join(rootPath, safe);
    await fsp.writeFile(target, '\uFEFF' + String(content || ''), 'utf8');
    return { ok: true, path: target };
  });
  ipcMain.handle('system:open-path', async (_event, targetPath) => {
    const err = await shell.openPath(targetPath);
    return { ok: !err, error: err || '' };
  });
  ipcMain.handle('system:show-item', async (_event, targetPath) => {
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
