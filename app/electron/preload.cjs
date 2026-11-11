const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ggDesktop', {
  close: () => ipcRenderer.invoke('win:close'),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  platform: (typeof process !== 'undefined' && process.platform) || 'darwin',
});
