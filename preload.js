const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  chooseMusicFolder: () => ipcRenderer.invoke('music:choose-folder'),
  reopenMusicFolder: () => ipcRenderer.invoke('music:reopen-folder'),
  getLibraryInfo: () => ipcRenderer.invoke('music:library-info'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  readFileSlice: async (filePath, start, end) => {
    const data = await ipcRenderer.invoke('music:read-slice', filePath, start, end);
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  },
  writePlaylist: (filename, content) => ipcRenderer.invoke('music:write-playlist', filename, content),
  readPlayerData: () => ipcRenderer.invoke('player-data:read'),
  writePlayerData: (data) => ipcRenderer.invoke('player-data:write', data),
  openPath: (targetPath) => ipcRenderer.invoke('system:open-path', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('system:show-item', targetPath),
  lookupLyrics: (meta) => ipcRenderer.invoke('lyrics:lookup', meta)
});
