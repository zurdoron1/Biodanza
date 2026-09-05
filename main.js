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
function playerDataPath() { return path.join(appDataDir(), 'player-data.json'); }
function playerDataBackupPath() { return path.join(appDataDir(), 'player-data.backup.json'); }

function readJsonSync(filePath, fallback = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}
async function writeJsonAtomic(filePath, value) {
  const temp = filePath + '.tmp';
  const json = JSON.stringify(value, null, 2);
  await fsp.writeFile(temp, json, 'utf8');
  try {
    await fsp.rename(temp, filePath);
  } catch {
    await fsp.copyFile(temp, filePath);
    try { await fsp.unlink(temp); } catch {}
  }
}

function readConfig() { return readJsonSync(configPath(), {}); }
async function writeConfig(data) { await writeJsonAtomic(configPath(), data); }
async function setLibraryRoot(rootPath) {
  const cfg = readConfig();
  cfg.libraryRoot = rootPath;
  cfg.updatedAt = new Date().toISOString();
  await writeConfig(cfg);
}
function getLibraryRoot() { return readConfig().libraryRoot || ''; }

function sanitizePlayerData(parsed = {}) {
  return {
    version: Number(parsed.version) || 1,
    updatedAt: String(parsed.updatedAt || ''),
    annotations: parsed && typeof parsed.annotations === 'object' && parsed.annotations && !Array.isArray(parsed.annotations) ? parsed.annotations : {},
    chosen: Array.isArray(parsed.chosen) ? parsed.chosen : [],
    playlistName: typeof parsed.playlistName === 'string' ? parsed.playlistName : '',
    exportSequence: Array.isArray(parsed.exportSequence) ? parsed.exportSequence : [],
    logicalAliases: parsed && typeof parsed.logicalAliases === 'object' && parsed.logicalAliases && !Array.isArray(parsed.logicalAliases) ? parsed.logicalAliases : {},
    logicalSongs: parsed && typeof parsed.logicalSongs === 'object' && parsed.logicalSongs && !Array.isArray(parsed.logicalSongs) ? parsed.logicalSongs : {},
    preferences: parsed && typeof parsed.preferences === 'object' && parsed.preferences && !Array.isArray(parsed.preferences) ? parsed.preferences : {}
  };
}

async function tryReadPlayerDataFile(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  return sanitizePlayerData(JSON.parse(raw));
}

async function readPlayerData() {
  const target = playerDataPath();
  const backup = playerDataBackupPath();
  try {
    const data = await tryReadPlayerDataFile(target);
    return { ok: true, exists: true, recoveredFromBackup: false, ...data };
  } catch (primaryError) {
    if (primaryError?.code === 'ENOENT') {
      try {
        const backupData = await tryReadPlayerDataFile(backup);
        try { await fsp.copyFile(backup, target); } catch {}
        return { ok: true, exists: true, recoveredFromBackup: true, ...backupData };
      } catch (backupError) {
        if (backupError?.code === 'ENOENT') return { ok: true, exists: false, recoveredFromBackup: false, ...sanitizePlayerData({}) };
        return { ok: false, exists: false, recoveredFromBackup: false, ...sanitizePlayerData({}), error: `Primary missing; backup unreadable: ${backupError?.message || backupError}` };
      }
    }
    try {
      const backupData = await tryReadPlayerDataFile(backup);
      try { await fsp.copyFile(backup, target); } catch {}
      return { ok: true, exists: true, recoveredFromBackup: true, ...backupData, warning: `Primary database was unreadable and backup was restored: ${primaryError?.message || primaryError}` };
    } catch (backupError) {
      return { ok: false, exists: false, recoveredFromBackup: false, ...sanitizePlayerData({}), error: `Primary database unreadable (${primaryError?.message || primaryError}); backup unreadable (${backupError?.message || backupError})` };
    }
  }
}

async function writePlayerData(data = {}) {
  const payload = {
    version: 2,
    updatedAt: new Date().toISOString(),
    ...sanitizePlayerData(data)
  };
  payload.version = 2;
  payload.updatedAt = new Date().toISOString();
  const json = JSON.stringify(payload);
  const target = playerDataPath();
  const backup = playerDataBackupPath();
  const temp = target + '.tmp';
  try {
    await fsp.writeFile(temp, json, 'utf8');
    if (fs.existsSync(target)) {
      try { await fsp.copyFile(target, backup); } catch {}
    }
    try {
      await fsp.rename(temp, target);
    } catch {
      await fsp.copyFile(temp, target);
      try { await fsp.unlink(temp); } catch {}
    }
    return { ok: true, bytes: Buffer.byteLength(json, 'utf8'), path: target };
  } catch (error) {
    try { await fsp.unlink(temp); } catch {}
    return { ok: false, error: String(error?.message || error) };
  }
}

async function scanFolder(rootPath) {
  const files = [];
  const dirs = [rootPath];
  while (dirs.length) {
    const batch = dirs.splice(0, 24);
    const listings = await Promise.all(batch.map(async dir => {
      try { return { dir, entries: await fsp.readdir(dir, { withFileTypes: true }) }; }
      catch { return { dir, entries: [] }; }
    }));
    const fileJobs = [];
    for (const { dir, entries } of listings) {
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) dirs.push(full);
        else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) fileJobs.push({ full, name: entry.name });
      }
    }
    for (let i = 0; i < fileJobs.length; i += 64) {
      const chunk = fileJobs.slice(i, i + 64);
      const rows = await Promise.all(chunk.map(async ({ full, name }) => {
        try {
          const st = await fsp.stat(full);
          const rel = path.relative(rootPath, full).split(path.sep).join('/');
          return {
            name,
            path: full,
            relativePath: rel,
            size: st.size,
            lastModified: Math.trunc(st.mtimeMs),
            type: mimeFromExt(path.extname(name)),
            fileUrl: pathToFileURL(full).href
          };
        } catch { return null; }
      }));
      for (const row of rows) if (row) files.push(row);
    }
  }
  files.sort((a,b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
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
    const result = await dialog.showOpenDialog(mainWindow, { title: 'בחר תיקיית מוזיקה', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const rootPath = result.filePaths[0];
    await setLibraryRoot(rootPath);
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
      if (length > 4 * 1024 * 1024) throw new Error('Requested file slice is too large');
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

  ipcMain.handle('player-data:read', async () => readPlayerData());
  ipcMain.handle('player-data:write', async (_event, data) => writePlayerData(data));
  ipcMain.handle('app:get-version', async () => app.getVersion());

  ipcMain.handle('system:open-path', async (_event, targetPath) => {
    const p = String(targetPath || '');
    if (!p || !fs.existsSync(p)) return { ok: false, error: 'הקובץ או התיקייה אינם זמינים.' };
    const err = await shell.openPath(p);
    return { ok: !err, error: err || '' };
  });
  ipcMain.handle('system:show-item', async (_event, targetPath) => {
    const p = String(targetPath || '');
    if (!p || !fs.existsSync(p)) return { ok: false, error: 'הקובץ אינו זמין.' };
    shell.showItemInFolder(p);
    return { ok: true };
  });

  ipcMain.handle('lyrics:lookup', async (_event, meta = {}) => {
    const trackName = String(meta.trackName || '').trim();
    const artistName = String(meta.artistName || '').trim();
    if (!trackName || !artistName) return null;
    const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });
    const albumName = String(meta.albumName || '').trim();
    const duration = Math.round(Number(meta.duration) || 0);
    if (albumName) params.set('album_name', albumName);
    if (duration >= 1 && duration <= 3600) params.set('duration', String(duration));
    try {
      const response = await fetch('https://lrclib.net/api/get?' + params.toString(), {
        headers: { Accept: 'application/json', 'Lrclib-Client': `Biodanza Music Player ${app.getVersion()} (https://github.com/zurdoron1/Biodanza)` }
      });
      if (response.status === 404) return null;
      if (response.status === 429) return { rateLimited: true };
      if (!response.ok) return null;
      const data = await response.json();
      return {
        id: data.id || '', instrumental: !!data.instrumental, plainLyrics: String(data.plainLyrics || ''),
        trackName: String(data.trackName || data.name || ''), artistName: String(data.artistName || ''),
        albumName: String(data.albumName || ''), duration: Number(data.duration) || 0
      };
    } catch (error) {
      console.warn('LRCLIB lookup failed', error);
      return null;
    }
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
