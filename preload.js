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
  getConfig: () => ipcRenderer.invoke('get-config'),
  resolveProject: projectNumber => ipcRenderer.invoke('resolve-project', projectNumber),
  openProjectFolder: (projectNumber, subfolderIndex) => (
    ipcRenderer.invoke('open-project-folder', projectNumber, subfolderIndex)
  ),
  openRecentFolder: recentId => ipcRenderer.invoke('open-recent-folder', recentId),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  miniBarFocused: () => ipcRenderer.invoke('mini-bar-focused'),
  resizeMiniBar: width => ipcRenderer.invoke('resize-mini-bar', width),
  toggleMiniPin: () => ipcRenderer.invoke('toggle-mini-pin'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installDownloadedUpdate: () => ipcRenderer.invoke('install-downloaded-update'),
  closeUpdateWindow: () => ipcRenderer.invoke('close-update-window'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveSettings: newConfig => ipcRenderer.invoke('save-settings', newConfig),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  onWindowShown: callback => subscribe('window-shown', callback),
  onWindowHidden: callback => subscribe('window-hidden', callback),
  onConfigUpdated: callback => subscribe('config-updated', callback),
  onMiniPopoverShown: callback => subscribe('mini-popover-shown', callback),
  onUpdateState: callback => subscribe('update-state', callback)
});

contextBridge.exposeInMainWorld('electronAPI', api);
