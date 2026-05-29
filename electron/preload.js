// Electron preload — context bridge for safe IPC
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,

  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  setTitleBarTheme: (theme) => ipcRenderer.send('window-set-titlebar-theme', theme),

  onMaximizeChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('maximize-changed', listener);
    return () => ipcRenderer.removeListener('maximize-changed', listener);
  }
});
