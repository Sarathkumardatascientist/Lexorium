const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lexoriumDesktop', {
  platform: process.platform,
  version: process.versions.electron,
  captureCamera: () => ipcRenderer.invoke('capture-camera'),
  capturePhoto: () => ipcRenderer.invoke('capture-photo'),
});
