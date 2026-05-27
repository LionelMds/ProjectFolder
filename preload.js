const { contextBridge, ipcRenderer } = require('electron');

const api = {
    getConfig: () => ipcRenderer.invoke('get-config'),
    openProjectFolder: (projectNumber, subfolderIndex) =>
        ipcRenderer.invoke('open-project-folder', projectNumber, subfolderIndex),
    hideWindow: () => ipcRenderer.invoke('hide-window'),
    miniBarFocused: () => ipcRenderer.invoke('mini-bar-focused'),
    resizeMiniBar: (width) => ipcRenderer.invoke('resize-mini-bar', width),
    toggleMiniPin: () => ipcRenderer.invoke('toggle-mini-pin'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
    installDownloadedUpdate: () => ipcRenderer.invoke('install-downloaded-update'),
    closeUpdateWindow: () => ipcRenderer.invoke('close-update-window'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    saveSettings: (newConfig) => ipcRenderer.invoke('save-settings', newConfig),
    closeSettings: () => ipcRenderer.invoke('close-settings'),
    onWindowShown: (callback) => ipcRenderer.on('window-shown', callback),
    onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
    onConfigUpdated: (callback) => ipcRenderer.on('config-updated', callback),
    onMiniPopoverShown: (callback) => ipcRenderer.on('mini-popover-shown', callback),
    onUpdateState: (callback) => ipcRenderer.on('update-state', callback)
};

contextBridge.exposeInMainWorld('electronAPI', api);
