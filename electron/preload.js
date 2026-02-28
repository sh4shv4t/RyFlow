// Electron preload — context bridge for safe IPC
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // Extend with IPC channels as needed:
  // send: (channel, data) => ipcRenderer.send(channel, data),
  // on:   (channel, fn)   => ipcRenderer.on(channel, (_, ...args) => fn(...args)),
});
