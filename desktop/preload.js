const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('lexoriumDesktop', {
  platform: process.platform,
  version: process.versions.electron,
});
