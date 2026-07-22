const { contextBridge, ipcRenderer } = require('electron');

// Bridge to the native window. Only present under Electron -- the renderer
// falls back to the DOM Fullscreen API when tepris is served as a web page.
contextBridge.exposeInMainWorld('teprisWindow', {
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  close: () => ipcRenderer.send('window:close'),
  onFullscreenChanged: (cb) => {
    ipcRenderer.on('window:fullscreen-changed', (_e, value) => cb(value));
  }
});
