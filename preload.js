'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Le callback doit être une fonction.');
  }

  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = Object.freeze({
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('get-config'),
  resolveProject: projectNumber => ipcRenderer.invoke('resolve-project', projectNumber),
  getProjectYears: () => ipcRenderer.invoke('get-project-years'),
  findNearestProjects: digits => ipcRenderer.invoke('find-nearest-projects', digits),
  openProjectFolder: (projectNumber, subfolderIndex, behavior) => (
    ipcRenderer.invoke('open-project-folder', projectNumber, subfolderIndex, behavior)
  ),
  openRecentFolder: (recentId, behavior) => ipcRenderer.invoke('open-recent-folder', recentId, behavior),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  miniBarFocused: () => ipcRenderer.invoke('mini-bar-focused'),
  setMiniLayout: layout => ipcRenderer.invoke('set-mini-layout', layout),
  toggleMiniPin: () => ipcRenderer.invoke('toggle-mini-pin'),
  toggleMiniVisibility: () => ipcRenderer.invoke('toggle-mini-visibility'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openUpdateCenter: () => ipcRenderer.invoke('open-update-center'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installDownloadedUpdate: () => ipcRenderer.invoke('install-downloaded-update'),
  closeUpdateWindow: () => ipcRenderer.invoke('close-update-window'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  inspectRoot: rootPath => ipcRenderer.invoke('inspect-root', rootPath),
  saveSettings: newConfig => ipcRenderer.invoke('save-settings', newConfig),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  onWindowShown: callback => subscribe('window-shown', callback),
  onWindowHidden: callback => subscribe('window-hidden', callback),
  onConfigUpdated: callback => subscribe('config-updated', callback),
  onMiniPopoverShown: callback => subscribe('mini-popover-shown', callback),
  onUpdateState: callback => subscribe('update-state', callback)
});

contextBridge.exposeInMainWorld('electronAPI', api);
