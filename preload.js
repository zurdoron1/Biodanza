const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  chooseMusicFolder: () => ipcRenderer.invoke('music:choose-folder'),
  reopenMusicFolder: () => ipcRenderer.invoke('music:reopen-folder'),
  getLibraryInfo: () => ipcRenderer.invoke('music:library-info'),
  readFileSlice: async (filePath, start, end) => {
    const data = await ipcRenderer.invoke('music:read-slice', filePath, start, end);
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  },
  writePlaylist: (filename, content) => ipcRenderer.invoke('music:write-playlist', filename, content),
  openPath: (targetPath) => ipcRenderer.invoke('system:open-path', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('system:show-item', targetPath)
});
