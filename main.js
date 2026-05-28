const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, shell, Notification, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

const APP_NAME = 'Project Folder Launcher';
const MAIN_WINDOW_SIZE = { width: 450, height: 400 };
const SETTINGS_WINDOW_SIZE = { width: 680, height: 760 };
const MINI_BASE_WIDTH = 260;
const MINI_MAX_WIDTH = 520;
const MINI_DEFAULT_HEIGHT = 44;
const MINI_EDGE_PADDING = 8;
const VALID_INTEGRATION_MODES = ['floating', 'docked', 'hidden'];
const VALID_OPEN_BEHAVIORS = ['newWindow', 'newTab', 'reuseWindow'];
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;
let miniWindow = null;
let settingsWindow = null;
let updateWindow = null;
let tray = null;
let config = null;
let configPath = null;
let logPath = null;
let dockedMoveMode = false;
let miniZOrderTimer = null;
let updateCheckTimer = null;
let pendingUpdateInfo = null;
let updateState = {
  status: 'idle',
  message: 'Prêt',
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  error: null,
  manual: false
};

/**
 * Returns true when the app is running on macOS.
 * @returns {boolean}
 */
function isMac() {
  return process.platform === 'darwin';
}

/**
 * Returns true when the app is running on Windows.
 * @returns {boolean}
 */
function isWindows() {
  return process.platform === 'win32';
}

/**
 * Returns true when auto-updates are enabled for this build.
 * macOS updates are disabled until the app is signed and notarized.
 * @returns {boolean}
 */
function supportsAutoUpdates() {
  return isWindows();
}

/**
 * Returns true when Windows Explorer tabs are available.
 * Explorer tabs shipped broadly with Windows 11 22H2, build 22621.
 * @returns {boolean}
 */
function supportsWindowsExplorerTabs() {
  if (!isWindows()) {
    return false;
  }

  const build = Number(os.release().split('.')[2] || 0);
  return build >= 22621;
}

/**
 * Restricts a number to a safe display range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Builds the config path for dev, portable, and installed modes.
 * @returns {string}
 */
function getConfigPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, 'config.json');
  }

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'config.json');
  }

  return path.join(app.getPath('userData'), 'config.json');
}

/**
 * Builds the application log path inside Electron userData.
 * @returns {string}
 */
function getLogPath() {
  return path.join(app.getPath('userData'), '.projectLauncher.log');
}

/**
 * Appends an event to the local log file.
 * @param {string} message
 * @param {object} [details]
 */
function logEvent(message, details = null) {
  try {
    const targetLogPath = logPath || path.join(app.getPath('userData'), '.projectLauncher.log');
    fs.mkdirSync(path.dirname(targetLogPath), { recursive: true });
    const detailText = details ? ` ${JSON.stringify(details)}` : '';
    fs.appendFileSync(targetLogPath, `[${new Date().toISOString()}] ${message}${detailText}\n`, 'utf-8');
  } catch (error) {
    console.error('Unable to write log:', error);
  }
}

/**
 * Shows a desktop notification for an error and writes it to the log.
 * @param {string} title
 * @param {Error|string} error
 */
function notifyError(title, error) {
  const message = error instanceof Error ? error.message : String(error);
  logEvent(title, { error: message });

  if (Notification.isSupported()) {
    new Notification({
      title: APP_NAME,
      body: message
    }).show();
  }
}

/**
 * Formats a byte count for update progress display.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Converts release notes from provider data into plain text.
 * @param {unknown} releaseNotes
 * @returns {string}
 */
function normalizeReleaseNotes(releaseNotes) {
  if (!releaseNotes) {
    return '';
  }

  if (typeof releaseNotes === 'string') {
    return releaseNotes.replace(/<[^>]+>/g, '').trim();
  }

  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          return item.note || item.notes || item.version || '';
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

/**
 * Sends update state to the update window.
 */
function broadcastUpdateState() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-state', updateState);
  }
}

/**
 * Updates the stored updater state.
 * @param {object} partial
 */
function setUpdateState(partial) {
  updateState = {
    ...updateState,
    ...partial
  };

  logEvent('Updater state changed', {
    status: updateState.status,
    message: updateState.message,
    percent: updateState.percent,
    availableVersion: updateState.availableVersion
  });
  broadcastUpdateState();
}

/**
 * Creates the update progress window.
 */
function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  updateWindow = new BrowserWindow({
    width: 430,
    height: 320,
    x: Math.round((width - 430) / 2),
    y: Math.round((height - 320) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    ...(isMac() && {
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000'
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  updateWindow.loadFile('update.html');
  updateWindow.on('closed', () => {
    updateWindow = null;
  });
  updateWindow.webContents.once('did-finish-load', () => {
    broadcastUpdateState();
  });
}

/**
 * Shows the update window and broadcasts current state.
 */
function showUpdateWindow() {
  createUpdateWindow();

  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.show();
    updateWindow.focus();
    broadcastUpdateState();
  }
}

/**
 * Displays a desktop notification for an available update.
 * @param {object} info
 */
function notifyUpdateAvailable(info) {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title: APP_NAME,
    body: `Mise à jour ${info.version} disponible`
  });

  notification.on('click', () => showUpdateWindow());
  notification.show();
}

/**
 * Configures electron-updater event handlers.
 */
function configureAutoUpdater() {
  if (!supportsAutoUpdates()) {
    logEvent('Auto-updater disabled for this platform', { platform: process.platform });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      status: 'checking',
      message: 'Recherche de mise à jour...',
      error: null,
      percent: 0
    });
  });

  autoUpdater.on('update-available', (info) => {
    pendingUpdateInfo = info;
    setUpdateState({
      status: 'available',
      message: `Version ${info.version} disponible`,
      availableVersion: info.version,
      releaseDate: info.releaseDate || null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      error: null,
      percent: 0
    });
    notifyUpdateAvailable(info);
    showUpdateWindow();
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'not-available',
      message: 'Le logiciel est à jour.',
      availableVersion: null,
      percent: 0,
      error: null
    });

    if (updateState.manual) {
      showUpdateWindow();
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(progress.percent || 0, 100));
    app.setProgressBar(percent / 100);
    setUpdateState({
      status: 'downloading',
      message: `Téléchargement ${percent.toFixed(0)} %`,
      percent,
      bytesPerSecond: progress.bytesPerSecond || 0,
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      speedLabel: `${formatBytes(progress.bytesPerSecond || 0)}/s`,
      progressLabel: `${formatBytes(progress.transferred || 0)} / ${formatBytes(progress.total || 0)}`
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    app.setProgressBar(-1);
    setUpdateState({
      status: 'ready',
      message: 'Mise à jour téléchargée. Installation...',
      availableVersion: info.version || updateState.availableVersion,
      percent: 100,
      error: null
    });
    showUpdateWindow();
    setTimeout(() => installDownloadedUpdate(), 900);
  });

  autoUpdater.on('error', (error) => {
    app.setProgressBar(-1);
    setUpdateState({
      status: 'error',
      message: 'La mise à jour a échoué.',
      error: error.message || String(error)
    });
    showUpdateWindow();
    logEvent('Updater error', { error: error.message || String(error) });
  });
}

/**
 * Checks for updates. In development, shows a friendly state instead of failing.
 * @param {boolean} manual
 */
async function checkForUpdates(manual = false) {
  setUpdateState({ manual });

  if (!supportsAutoUpdates()) {
    setUpdateState({
      status: 'not-available',
      message: 'Les mises à jour automatiques macOS sont désactivées sur ce build temporaire non signé.',
      error: null,
      percent: 0
    });

    if (manual) {
      showUpdateWindow();
    }

    return { success: true, disabled: true };
  }

  if (!app.isPackaged) {
    setUpdateState({
      status: 'not-available',
      message: 'Les mises à jour automatiques se testent sur une version installée.',
      error: null,
      percent: 0
    });

    if (manual) {
      showUpdateWindow();
    }

    return { success: true, devMode: true };
  }

  if (['checking', 'downloading'].includes(updateState.status)) {
    if (manual) {
      showUpdateWindow();
    }

    return { success: true, status: updateState.status };
  }

  if (manual) {
    showUpdateWindow();
  }

  await autoUpdater.checkForUpdates();
  return { success: true };
}

/**
 * Starts downloading the update and installs it when ready.
 */
async function startUpdateDownload() {
  if (!supportsAutoUpdates()) {
    await checkForUpdates(true);
    return { success: true, disabled: true };
  }

  if (updateState.status === 'ready') {
    installDownloadedUpdate();
    return { success: true };
  }

  if (!pendingUpdateInfo && updateState.status !== 'available') {
    await checkForUpdates(true);
    return { success: true };
  }

  showUpdateWindow();
  setUpdateState({
    status: 'downloading',
    message: 'Préparation du téléchargement...',
    percent: 0,
    error: null
  });
  await autoUpdater.downloadUpdate();
  return { success: true };
}

/**
 * Installs the downloaded update and restarts the app.
 */
function installDownloadedUpdate() {
  if (!supportsAutoUpdates()) {
    setUpdateState({
      status: 'error',
      message: 'Installation automatique indisponible sur ce build.',
      error: null
    });
    return;
  }

  if (!app.isPackaged) {
    setUpdateState({
      status: 'error',
      message: 'Installation indisponible en mode développement.',
      error: null
    });
    return;
  }

  setUpdateState({
    status: 'installing',
    message: 'Fermeture et lancement de l’installateur...',
    percent: 100,
    error: null
  });
  stopMiniZOrderKeeper();
  app.setProgressBar(-1);
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Schedules background update checks.
 */
function scheduleUpdateChecks() {
  if (!supportsAutoUpdates()) {
    return;
  }

  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }

  setTimeout(() => {
    checkForUpdates(false).catch(error => logEvent('Scheduled update check failed', { error: error.message }));
  }, 15000);

  updateCheckTimer = setInterval(() => {
    checkForUpdates(false).catch(error => logEvent('Scheduled update check failed', { error: error.message }));
  }, UPDATE_CHECK_INTERVAL_MS);

  if (typeof updateCheckTimer.unref === 'function') {
    updateCheckTimer.unref();
  }
}

/**
 * Default application configuration for first launch.
 * @returns {object}
 */
function createDefaultConfig() {
  return {
    racine: '',
    sousDossiers: [
      { nom: 'Dossier principal', chemin: '', raccourci: 'Enter', icone: '📁' },
      { nom: "Plans d'exécution", chemin: "Plans\\Plan d'exécution", raccourci: 'Ctrl+Enter', icone: '📐' },
      { nom: 'Fournisseurs', chemin: 'Fournisseurs', raccourci: 'Shift+Enter', icone: '🏭' },
      { nom: 'Devis', chemin: 'Devis', raccourci: null, icone: '💰' }
    ],
    raccourciGlobal: 'CommandOrControl+Shift+P',
    autoStart: false,
    integrationMode: 'floating',
    openBehavior: 'newTab',
    openInNewTab: true,
    reuseExplorerWindow: false,
    miniBar: {
      enabled: true,
      position: null,
      dockedPosition: null,
      dockedUseCustomPosition: false,
      lastVisibleIntegrationMode: 'floating'
    }
  };
}

/**
 * Migrates legacy configuration fields into the current schema.
 * @param {object} rawConfig
 * @returns {object}
 */
function migrateConfig(rawConfig) {
  const defaults = createDefaultConfig();
  const migrated = {
    ...defaults,
    ...rawConfig
  };

  migrated.sousDossiers = Array.isArray(rawConfig.sousDossiers) && rawConfig.sousDossiers.length > 0
    ? rawConfig.sousDossiers
    : defaults.sousDossiers;

  migrated.miniBar = {
    ...defaults.miniBar,
    ...(rawConfig.miniBar || {})
  };

  migrated.miniBar.dockedUseCustomPosition = Boolean(migrated.miniBar.dockedUseCustomPosition);
  migrated.miniBar.dockedPosition = migrated.miniBar.dockedPosition || null;
  migrated.miniBar.lastVisibleIntegrationMode = VALID_INTEGRATION_MODES.includes(migrated.miniBar.lastVisibleIntegrationMode)
    && migrated.miniBar.lastVisibleIntegrationMode !== 'hidden'
    ? migrated.miniBar.lastVisibleIntegrationMode
    : (migrated.integrationMode !== 'hidden' ? migrated.integrationMode : 'floating');

  if (!VALID_INTEGRATION_MODES.includes(migrated.integrationMode)) {
    const legacyMiniEnabled = rawConfig.miniBar && typeof rawConfig.miniBar.enabled === 'boolean'
      ? rawConfig.miniBar.enabled
      : true;
    migrated.integrationMode = legacyMiniEnabled ? 'floating' : 'hidden';
  }

  if (!VALID_OPEN_BEHAVIORS.includes(migrated.openBehavior)) {
    if (rawConfig.reuseExplorerWindow === true) {
      migrated.openBehavior = 'reuseWindow';
    } else if (rawConfig.openInNewTab === true) {
      migrated.openBehavior = 'newTab';
    } else if (Object.prototype.hasOwnProperty.call(rawConfig, 'reuseExplorerWindow')) {
      migrated.openBehavior = 'newWindow';
    } else {
      migrated.openBehavior = defaults.openBehavior;
    }
  }

  migrated.miniBar.enabled = migrated.integrationMode !== 'hidden';
  migrated.openInNewTab = migrated.openBehavior === 'newTab';
  migrated.reuseExplorerWindow = migrated.openBehavior === 'reuseWindow';

  return migrated;
}

/**
 * Loads config from disk, creating or migrating it when needed.
 * @returns {object}
 */
function loadConfig() {
  const defaults = createDefaultConfig();

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(data);
      config = migrateConfig(parsed);

      if (JSON.stringify(parsed) !== JSON.stringify(config)) {
        saveConfig();
        logEvent('Configuration migrated', {
          integrationMode: config.integrationMode,
          openBehavior: config.openBehavior
        });
      }

      return config;
    }
  } catch (error) {
    notifyError('Erreur de lecture de la configuration', error);
  }

  config = defaults;
  saveConfig();
  logEvent('Default configuration created');
  return config;
}

/**
 * Saves the current config to disk.
 */
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
  } catch (error) {
    notifyError('Erreur de sauvegarde de la configuration', error);
  }
}

/**
 * Enables or disables app launch at login.
 */
function setupAutoLaunch() {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(config.autoStart)
    });
  } catch (error) {
    notifyError('Impossible de configurer le démarrage automatique', error);
  }
}

/**
 * Toggles launch at login from the tray menu.
 */
function toggleAutoLaunch() {
  config.autoStart = !config.autoStart;
  setupAutoLaunch();
  saveConfig();
  updateTrayMenu();
}

/**
 * Creates the frameless main search popup.
 */
function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_SIZE.width,
    height: MAIN_WINDOW_SIZE.height,
    x: Math.round((width - MAIN_WINDOW_SIZE.width) / 2),
    y: Math.round((height - MAIN_WINDOW_SIZE.height) / 2 - 100),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    ...(isMac() && {
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000'
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('blur', () => hideWindow());
  logEvent('Main search window created');
}

/**
 * Detects the taskbar or menu-bar reserved edge for a display.
 * @param {Electron.Display} display
 * @returns {{edge: string, thickness: number}}
 */
function detectReservedScreenEdge(display) {
  const { bounds, workArea } = display;
  const left = workArea.x - bounds.x;
  const top = workArea.y - bounds.y;
  const right = (bounds.x + bounds.width) - (workArea.x + workArea.width);
  const bottom = (bounds.y + bounds.height) - (workArea.y + workArea.height);

  const edges = [
    { edge: 'left', thickness: left },
    { edge: 'top', thickness: top },
    { edge: 'right', thickness: right },
    { edge: 'bottom', thickness: bottom }
  ].filter(item => item.thickness > 0);

  if (edges.length === 0) {
    return { edge: 'bottom', thickness: 48 };
  }

  return edges.sort((a, b) => b.thickness - a.thickness)[0];
}

/**
 * Calculates mini-window bounds for floating, docked, and macOS popover modes.
 * @param {number} requestedWidth
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function calculateMiniBounds(requestedWidth = MINI_BASE_WIDTH) {
  const width = clamp(Math.round(requestedWidth), MINI_BASE_WIDTH, MINI_MAX_WIDTH);

  if (isMac() && config.integrationMode === 'docked' && tray) {
    const trayBounds = tray.getBounds();
    const anchorX = trayBounds.x + Math.round(trayBounds.width / 2);
    const anchorY = trayBounds.y + Math.round(trayBounds.height / 2);
    const display = screen.getDisplayNearestPoint({ x: anchorX, y: anchorY });
    const { workArea } = display;
    const height = MINI_DEFAULT_HEIGHT;
    const x = clamp(
      Math.round(trayBounds.x + (trayBounds.width / 2) - (width / 2)),
      workArea.x + MINI_EDGE_PADDING,
      workArea.x + workArea.width - width - MINI_EDGE_PADDING
    );
    const preferredY = Math.round(trayBounds.y + trayBounds.height + 6);
    const y = preferredY + height <= workArea.y + workArea.height
      ? preferredY
      : workArea.y + MINI_EDGE_PADDING;

    return { x, y, width, height };
  }

  if (config.integrationMode === 'docked' && config.miniBar.dockedUseCustomPosition && config.miniBar.dockedPosition) {
    const saved = config.miniBar.dockedPosition;
    const savedPoint = {
      x: Number(saved.x) || 0,
      y: Number(saved.y) || 0
    };
    const display = screen.getDisplayNearestPoint(savedPoint);
    const { bounds } = display;
    const height = MINI_DEFAULT_HEIGHT;
    const x = clamp(
      savedPoint.x,
      bounds.x + MINI_EDGE_PADDING,
      bounds.x + bounds.width - width - MINI_EDGE_PADDING
    );
    const y = clamp(
      savedPoint.y,
      bounds.y + MINI_EDGE_PADDING,
      bounds.y + bounds.height - height - MINI_EDGE_PADDING
    );

    return { x, y, width, height };
  }

  const display = screen.getPrimaryDisplay();
  const { bounds, workArea } = display;

  if (config.integrationMode === 'docked') {
    const reservedEdge = detectReservedScreenEdge(display);
    const reservedThickness = Math.max(reservedEdge.thickness || MINI_DEFAULT_HEIGHT, MINI_DEFAULT_HEIGHT);
    const height = MINI_DEFAULT_HEIGHT;

    if (reservedEdge.edge === 'top') {
      return {
        x: bounds.x + bounds.width - width - MINI_EDGE_PADDING,
        y: clamp(
          bounds.y + Math.round((reservedThickness - height) / 2),
          bounds.y,
          bounds.y + Math.max(0, reservedThickness - height)
        ),
        width,
        height
      };
    }

    if (reservedEdge.edge === 'left') {
      return {
        x: bounds.x,
        y: bounds.y + bounds.height - height - MINI_EDGE_PADDING,
        width,
        height
      };
    }

    if (reservedEdge.edge === 'right') {
      return {
        x: bounds.x + bounds.width - width,
        y: bounds.y + bounds.height - height - MINI_EDGE_PADDING,
        width,
        height
      };
    }

    return {
      x: bounds.x + bounds.width - width - MINI_EDGE_PADDING,
      y: bounds.y + bounds.height - reservedThickness + Math.round((reservedThickness - height) / 2),
      width,
      height
    };
  }

  const savedPosition = config.miniBar && config.miniBar.position;
  const height = MINI_DEFAULT_HEIGHT;
  const fallbackX = Math.round(workArea.x + (workArea.width - width) / 2);
  const fallbackY = Math.round(workArea.y + workArea.height - height - 6);
  const x = savedPosition ? savedPosition.x : fallbackX;
  const y = savedPosition ? savedPosition.y : fallbackY;

  return { x, y, width, height };
}

/**
 * Returns true when the mini-bar is pinned over the Windows taskbar.
 * @returns {boolean}
 */
function shouldKeepMiniAboveOtherWindows() {
  return isWindows()
    && config
    && config.integrationMode !== 'hidden'
    && miniWindow
    && !miniWindow.isDestroyed()
    && miniWindow.isVisible();
}

/**
 * Reasserts the mini-bar's topmost order without stealing keyboard focus.
 */
function bumpMiniWindowAboveTaskbar() {
  if (!shouldKeepMiniAboveOtherWindows()) {
    return;
  }

  try {
    miniWindow.setAlwaysOnTop(true, 'screen-saver');

    if (typeof miniWindow.moveTop === 'function') {
      miniWindow.moveTop();
    }
  } catch (error) {
    logEvent('Unable to reassert mini-bar z-order', { error: error.message });
  }
}

/**
 * Starts a light z-order keeper so the mini-bar stays above Windows UI surfaces.
 */
function startMiniZOrderKeeper() {
  stopMiniZOrderKeeper();

  if (!shouldKeepMiniAboveOtherWindows()) {
    return;
  }

  bumpMiniWindowAboveTaskbar();
  miniZOrderTimer = setInterval(() => {
    bumpMiniWindowAboveTaskbar();
  }, 600);

  if (typeof miniZOrderTimer.unref === 'function') {
    miniZOrderTimer.unref();
  }
}

/**
 * Stops the mini-bar z-order keeper.
 */
function stopMiniZOrderKeeper() {
  if (miniZOrderTimer) {
    clearInterval(miniZOrderTimer);
    miniZOrderTimer = null;
  }
}

/**
 * Creates the mini search bar or macOS menu-bar popover window.
 */
function createMiniWindow() {
  if (!config || config.integrationMode === 'hidden') {
    return;
  }

  const bounds = calculateMiniBounds(MINI_BASE_WIDTH);
  const mode = config.integrationMode;
  const isMacPopover = isMac() && mode === 'docked';
  const canMove = mode === 'floating' || (mode === 'docked' && dockedMoveMode && !isMac());

  miniWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: !isMacPopover,
    focusable: true,
    movable: canMove,
    ...(isMac() && {
      vibrancy: isMacPopover ? 'menu' : 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000'
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  miniWindow.loadFile('mini-search.html');
  miniWindow.setAlwaysOnTop(true, 'screen-saver');

  miniWindow.on('blur', () => {
    if (isMacPopover && miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide();
      return;
    }

    if (isWindows()) {
      setTimeout(() => bumpMiniWindowAboveTaskbar(), 40);
      setTimeout(() => bumpMiniWindowAboveTaskbar(), 180);
    }
  });

  miniWindow.on('moved', () => {
    if (!miniWindow || miniWindow.isDestroyed()) {
      return;
    }

    if (mode === 'floating') {
      const [x, y] = miniWindow.getPosition();
      config.miniBar.position = { x, y };
      saveConfig();
      return;
    }

    if (mode === 'docked' && dockedMoveMode && !isMac()) {
      const currentBounds = miniWindow.getBounds();
      config.miniBar.dockedUseCustomPosition = true;
      config.miniBar.dockedPosition = {
        x: currentBounds.x,
        y: currentBounds.y,
        height: MINI_DEFAULT_HEIGHT
      };
      saveConfig();
    }
  });

  miniWindow.on('closed', () => {
    miniWindow = null;
  });

  miniWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      miniWindow.hide();
    }
  });

  if (mode === 'docked' && !isMac()) {
    const currentBounds = miniWindow.getBounds();
    config.miniBar.dockedUseCustomPosition = true;
    config.miniBar.dockedPosition = {
      x: currentBounds.x,
      y: currentBounds.y,
      height: MINI_DEFAULT_HEIGHT
    };
    saveConfig();
  }

  startMiniZOrderKeeper();
  logEvent('Mini window created', { mode });
}

/**
 * Destroys the mini window without changing the config.
 */
function destroyMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    stopMiniZOrderKeeper();
    const win = miniWindow;
    miniWindow = null;
    win.removeAllListeners('close');
    win.destroy();
  }
}

/**
 * Recreates the mini window when the integration mode changes.
 */
function recreateMiniWindow() {
  destroyMiniWindow();

  if (config.integrationMode !== 'hidden') {
    createMiniWindow();
  }
}

/**
 * Repositions the mini window for screen and taskbar changes.
 * @param {number} [requestedWidth]
 */
function repositionMiniWindow(requestedWidth = null) {
  if (!miniWindow || miniWindow.isDestroyed() || config.integrationMode === 'hidden') {
    return;
  }

  const currentBounds = miniWindow.getBounds();
  const nextBounds = calculateMiniBounds(requestedWidth || currentBounds.width);
  miniWindow.setBounds(nextBounds);
  bumpMiniWindowAboveTaskbar();
}

/**
 * Resizes the mini window without changing its current screen position.
 * @param {number} requestedWidth
 */
function resizeMiniWindowInPlace(requestedWidth) {
  if (!miniWindow || miniWindow.isDestroyed()) {
    return;
  }

  const width = clamp(Math.round(requestedWidth), MINI_BASE_WIDTH, MINI_MAX_WIDTH);
  const currentBounds = miniWindow.getBounds();
  miniWindow.setBounds({
    x: currentBounds.x,
    y: currentBounds.y,
    width,
    height: MINI_DEFAULT_HEIGHT
  });

  if (config.integrationMode === 'docked' && !isMac()) {
    config.miniBar.dockedUseCustomPosition = true;
    config.miniBar.dockedPosition = {
      x: currentBounds.x,
      y: currentBounds.y,
      height: MINI_DEFAULT_HEIGHT
    };
    saveConfig();
  }

  bumpMiniWindowAboveTaskbar();
}

/**
 * Applies the current movable state to the mini window.
 */
function applyMiniWindowMovableState() {
  if (!miniWindow || miniWindow.isDestroyed()) {
    return;
  }

  if (typeof miniWindow.setMovable === 'function') {
    miniWindow.setMovable(config.integrationMode === 'floating' || (config.integrationMode === 'docked' && dockedMoveMode && !isMac()));
  }

  miniWindow.webContents.send('config-updated');
}

/**
 * Stores the current docked mini-window position as a custom position.
 */
function saveCurrentDockedPosition() {
  if (!miniWindow || miniWindow.isDestroyed() || config.integrationMode !== 'docked' || isMac()) {
    return;
  }

  const currentBounds = miniWindow.getBounds();
  config.miniBar.dockedUseCustomPosition = true;
  config.miniBar.dockedPosition = {
    x: currentBounds.x,
    y: currentBounds.y,
    height: MINI_DEFAULT_HEIGHT
  };
  saveConfig();
}

/**
 * Toggles temporary movement for the pinned mini-bar.
 */
function toggleDockedMoveMode() {
  if (isMac() || config.integrationMode !== 'docked') {
    return;
  }

  if (dockedMoveMode) {
    saveCurrentDockedPosition();
  }

  dockedMoveMode = !dockedMoveMode;
  recreateMiniWindow();

  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    if (dockedMoveMode) {
      miniWindow.focus();
    }
  }

  startMiniZOrderKeeper();
  updateTrayMenu();
  broadcastConfigUpdated();
  logEvent('Docked move mode changed', { enabled: dockedMoveMode });
}

/**
 * Toggles the mini-bar between floating and taskbar-pinned modes.
 * @returns {{success: boolean, integrationMode: string}}
 */
function toggleMiniPin() {
  if (config.integrationMode === 'hidden') {
    config.integrationMode = 'floating';
    config.miniBar.enabled = true;
    dockedMoveMode = false;
    saveConfig();
    recreateMiniWindow();
    updateTrayMenu();
    broadcastConfigUpdated();
    return { success: true, integrationMode: config.integrationMode };
  }

  if (config.integrationMode === 'docked') {
    if (miniWindow && !miniWindow.isDestroyed() && !isMac()) {
      const currentBounds = miniWindow.getBounds();
      config.miniBar.position = {
        x: currentBounds.x,
        y: currentBounds.y
      };
    }

    config.integrationMode = 'floating';
    dockedMoveMode = false;
  } else {
    config.integrationMode = 'docked';
    dockedMoveMode = false;
  }

  config.miniBar.enabled = true;
  config.miniBar.lastVisibleIntegrationMode = config.integrationMode;
  saveConfig();
  recreateMiniWindow();
  updateTrayMenu();
  broadcastConfigUpdated();
  logEvent('Mini pin toggled', { integrationMode: config.integrationMode });

  return { success: true, integrationMode: config.integrationMode };
}

/**
 * Toggles mini-bar visibility while preserving the last visible mode.
 */
function toggleMiniVisibility() {
  if (config.integrationMode === 'hidden') {
    config.integrationMode = config.miniBar.lastVisibleIntegrationMode || 'floating';

    if (!VALID_INTEGRATION_MODES.includes(config.integrationMode) || config.integrationMode === 'hidden') {
      config.integrationMode = 'floating';
    }
  } else {
    config.miniBar.lastVisibleIntegrationMode = config.integrationMode;
    config.integrationMode = 'hidden';
    dockedMoveMode = false;
  }

  config.miniBar.enabled = config.integrationMode !== 'hidden';
  saveConfig();
  recreateMiniWindow();
  updateTrayMenu();
  broadcastConfigUpdated();
  logEvent('Mini visibility toggled', { integrationMode: config.integrationMode });
}

/**
 * Opens or hides the macOS menu-bar popover.
 */
function toggleMacMenuPopover() {
  if (!miniWindow || miniWindow.isDestroyed()) {
    createMiniWindow();
  }

  if (!miniWindow || miniWindow.isDestroyed()) {
    return;
  }

  if (miniWindow.isVisible()) {
    miniWindow.hide();
    return;
  }

  repositionMiniWindow(MINI_BASE_WIDTH);
  miniWindow.show();
  miniWindow.focus();
  miniWindow.webContents.send('mini-popover-shown');
}

/**
 * Creates the settings window.
 */
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_SIZE.width,
    height: SETTINGS_WINDOW_SIZE.height,
    x: Math.round((width - SETTINGS_WINDOW_SIZE.width) / 2),
    y: Math.round((height - SETTINGS_WINDOW_SIZE.height) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    ...(isMac() && {
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000'
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  logEvent('Settings window created');
}

/**
 * Shows the centered main popup on the display under the cursor.
 */
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = currentDisplay.workArea;

  mainWindow.setPosition(
    Math.round(x + (width - MAIN_WINDOW_SIZE.width) / 2),
    Math.round(y + (height - MAIN_WINDOW_SIZE.height) / 2 - 100)
  );

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window-shown');
}

/**
 * Hides the main popup.
 */
function hideWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
    mainWindow.webContents.send('window-hidden');
  }
}

/**
 * Toggles the main popup.
 */
function toggleWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}

/**
 * Formats an Electron accelerator for user-facing labels.
 * @param {string} shortcut
 * @returns {string}
 */
function formatShortcutLabel(shortcut) {
  return (shortcut || 'CommandOrControl+Shift+P')
    .replace('CommandOrControl', isMac() ? 'Cmd' : 'Ctrl');
}

/**
 * Builds the tray context menu.
 * @returns {Electron.Menu}
 */
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Ouvrir la recherche',
      click: () => showWindow()
    },
    {
      label: `Raccourci: ${formatShortcutLabel(config.raccourciGlobal)}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Afficher la mini-barre',
      type: 'checkbox',
      checked: config.integrationMode !== 'hidden',
      click: () => toggleMiniVisibility()
    },
    {
      label: 'Déplacer la barre épinglée',
      type: 'checkbox',
      checked: dockedMoveMode,
      enabled: config.integrationMode === 'docked' && !isMac(),
      click: () => toggleDockedMoveMode()
    },
    {
      label: isMac() ? 'Lancer au démarrage' : 'Démarrer avec Windows',
      type: 'checkbox',
      checked: Boolean(config.autoStart),
      click: () => toggleAutoLaunch()
    },
    { type: 'separator' },
    {
      label: 'Vérifier les mises à jour...',
      click: () => checkForUpdates(true).catch(error => notifyError('Recherche de mise à jour impossible', error))
    },
    { type: 'separator' },
    {
      label: 'Paramètres...',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
}

/**
 * Refreshes the tray context menu.
 */
function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const contextMenu = buildTrayMenu();

  if (isMac()) {
    tray.setContextMenu(null);
  } else {
    tray.setContextMenu(contextMenu);
  }
}

/**
 * Creates the system tray/menu-bar entry.
 */
function createTray() {
  const { nativeImage } = require('electron');
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  try {
    if (isMac()) {
      const templatePath = path.join(__dirname, 'assets', 'iconTemplate.png');
      const trayIcon = fs.existsSync(templatePath)
        ? nativeImage.createFromPath(templatePath)
        : nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
      trayIcon.setTemplateImage(true);
      tray = new Tray(trayIcon);
    } else {
      tray = new Tray(iconPath);
    }
  } catch (error) {
    notifyError("Impossible de charger l'icône de la zone de notification", error);
    const fallbackIcon = nativeImage.createEmpty();
    tray = new Tray(fallbackIcon.resize({ width: 16, height: 16 }));
  }

  tray.setToolTip(APP_NAME);
  updateTrayMenu();

  tray.on('click', () => {
    if (isMac() && config.integrationMode === 'docked') {
      toggleMacMenuPopover();
    } else {
      toggleWindow();
    }
  });

  if (isMac()) {
    tray.on('right-click', () => {
      tray.popUpContextMenu(buildTrayMenu());
    });
  }

  logEvent('Tray created');
}

/**
 * Registers the configured global shortcut.
 */
function registerGlobalShortcut() {
  const shortcut = config.raccourciGlobal || 'CommandOrControl+Shift+P';
  const registered = globalShortcut.register(shortcut, () => toggleWindow());

  if (!registered) {
    notifyError('Raccourci global indisponible', `Impossible d'enregistrer: ${formatShortcutLabel(shortcut)}`);
  } else {
    logEvent('Global shortcut registered', { shortcut });
  }
}

/**
 * Runs an executable with a timeout.
 * @param {string} file
 * @param {string[]} args
 * @param {number} timeout
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execFileAsync(file, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = stderr ? ` ${stderr.trim()}` : '';
        reject(new Error(`${error.message}${stderrText}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

/**
 * Escapes a string for a PowerShell single-quoted literal.
 * @param {string} value
 * @returns {string}
 */
function escapePowerShellSingleQuoted(value) {
  return value.replace(/'/g, "''");
}

/**
 * Escapes a string for AppleScript double-quoted text.
 * @param {string} value
 * @returns {string}
 */
function escapeAppleScriptString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Opens a folder in a new file-manager window.
 * @param {string} folderPath
 */
async function openFolderInNewWindow(folderPath) {
  const errorMessage = await shell.openPath(folderPath);

  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

/**
 * Builds a PowerShell UI Automation script that navigates the active Explorer address bar.
 * @param {string} folderPath
 * @param {boolean} openNewTab
 * @returns {string}
 */
function buildWindowsExplorerAddressBarScript(folderPath, openNewTab) {
  const escapedPath = escapePowerShellSingleQuoted(folderPath);
  const openNewTabValue = openNewTab ? '$true' : '$false';

  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

function ConvertTo-SendKeysLiteral([string]$Text) {
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $Text.ToCharArray()) {
    switch ([string]$char) {
      '+' { [void]$builder.Append('{+}') }
      '^' { [void]$builder.Append('{^}') }
      '%' { [void]$builder.Append('{%}') }
      '~' { [void]$builder.Append('{~}') }
      '(' { [void]$builder.Append('{(}') }
      ')' { [void]$builder.Append('{)}') }
      '[' { [void]$builder.Append('{[}') }
      ']' { [void]$builder.Append('{]}') }
      '{' { [void]$builder.Append('{{}') }
      '}' { [void]$builder.Append('{}}') }
      default { [void]$builder.Append($char) }
    }
  }
  return $builder.ToString()
}

function Set-AddressBarValueWithUiAutomation([string]$Path) {
  try {
    $focusedElement = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -eq $focusedElement) {
      return $false
    }

    $valuePattern = $null
    $supportsValuePattern = $focusedElement.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$valuePattern
    )

    if (-not $supportsValuePattern -or $null -eq $valuePattern) {
      return $false
    }

    if ($valuePattern.Current.IsReadOnly) {
      return $false
    }

    $valuePattern.SetValue($Path)
    return $true
  } catch {
    return $false
  }
}

function Open-PathFromAddressBarFallback([string]$Path) {
  $previousClipboard = $null
  $clipboardCaptured = $false

  try {
    $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
    $clipboardCaptured = $true
  } catch {
    $clipboardCaptured = $false
  }

  try {
    [System.Windows.Forms.Clipboard]::SetText($Path)
    Start-Sleep -Milliseconds 40
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  } catch {
    [System.Windows.Forms.SendKeys]::SendWait((ConvertTo-SendKeysLiteral $Path))
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  } finally {
    if ($clipboardCaptured -and $previousClipboard) {
      Start-Sleep -Milliseconds 250
      try {
        [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
      } catch {}
    }
  }
}

function Navigate-ExplorerAddressBar([string]$Path, [bool]$OpenNewTab) {
  if ($OpenNewTab) {
    [System.Windows.Forms.SendKeys]::SendWait('^t')
    Start-Sleep -Milliseconds 180
  }

  [System.Windows.Forms.SendKeys]::SendWait('^l')
  Start-Sleep -Milliseconds 80

  if (Set-AddressBarValueWithUiAutomation $Path) {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  } else {
    Open-PathFromAddressBarFallback $Path
  }
}

$folderPath = '${escapedPath}'
$openNewTab = ${openNewTabValue}
$shell = New-Object -ComObject Shell.Application
$windows = @($shell.Windows())
$target = $null
foreach ($w in $windows) {
  if ($w.Name -eq 'Explorateur de fichiers' -or $w.Name -eq 'File Explorer') {
    $target = $w
    break
  }
}
if ($target) {
  $hwnd = $target.HWND
  [Win32]::ShowWindow([IntPtr]$hwnd, 9) | Out-Null
  [Win32]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
  Start-Sleep -Milliseconds 120
  Navigate-ExplorerAddressBar $folderPath $openNewTab
} else {
  Start-Process explorer.exe -ArgumentList $folderPath
}
`;
}

/**
 * Navigates an Explorer window through the address bar.
 * @param {string} folderPath
 * @param {boolean} openNewTab
 */
async function navigateWindowsExplorerAddressBar(folderPath, openNewTab) {
  const psScript = buildWindowsExplorerAddressBarScript(folderPath, openNewTab);
  await execFileAsync('powershell.exe', ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', psScript], 7000);
}

/**
 * Opens a folder in an Explorer tab on Windows.
 * @param {string} folderPath
 */
async function openFolderInWindowsExplorerTab(folderPath) {
  if (!supportsWindowsExplorerTabs()) {
    await openFolderInNewWindow(folderPath);
    return;
  }

  await navigateWindowsExplorerAddressBar(folderPath, true);
}

/**
 * Opens a folder in a Finder tab on macOS.
 * @param {string} folderPath
 */
async function openFolderInFinderTab(folderPath) {
  const escapedPath = escapeAppleScriptString(folderPath);
  const appleScript = [
    'tell application "Finder"',
    '  activate',
    '  if (count of windows) > 0 then',
    '    tell application "System Events" to keystroke "t" using command down',
    '    delay 0.15',
    `    set target of front window to (POSIX file "${escapedPath}" as alias)`,
    '  else',
    `    open (POSIX file "${escapedPath}" as alias)`,
    '  end if',
    'end tell'
  ].join('\n');

  await execFileAsync('osascript', ['-e', appleScript], 7000);
}

/**
 * Opens a folder in a new Finder or Explorer tab where supported.
 * @param {string} folderPath
 */
async function openFolderInNewTab(folderPath) {
  if (isWindows()) {
    await openFolderInWindowsExplorerTab(folderPath);
    return;
  }

  if (isMac()) {
    await openFolderInFinderTab(folderPath);
    return;
  }

  await openFolderInNewWindow(folderPath);
}

/**
 * Reuses the active Explorer window on Windows.
 * @param {string} folderPath
 */
async function reuseWindowsExplorerWindow(folderPath) {
  await navigateWindowsExplorerAddressBar(folderPath, false);
}

/**
 * Reuses the active Finder window on macOS.
 * @param {string} folderPath
 */
async function reuseFinderWindow(folderPath) {
  const escapedPath = escapeAppleScriptString(folderPath);
  const appleScript = [
    'tell application "Finder"',
    '  if (count of windows) > 0 then',
    `    set target of front window to (POSIX file "${escapedPath}" as alias)`,
    '  else',
    `    open (POSIX file "${escapedPath}" as alias)`,
    '  end if',
    '  activate',
    'end tell'
  ].join('\n');

  await execFileAsync('osascript', ['-e', appleScript], 5000);
}

/**
 * Reuses an existing file-manager window where supported.
 * @param {string} folderPath
 */
async function reuseFileManagerWindow(folderPath) {
  if (isWindows()) {
    await reuseWindowsExplorerWindow(folderPath);
    return;
  }

  if (isMac()) {
    await reuseFinderWindow(folderPath);
    return;
  }

  await openFolderInNewWindow(folderPath);
}

/**
 * Opens a folder using the configured behavior.
 * @param {string} folderPath
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function openFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    return { success: false, error: `Le dossier n'existe pas:\n${folderPath}` };
  }

  const behavior = config.openBehavior || (config.reuseExplorerWindow ? 'reuseWindow' : 'newWindow');

  try {
    if (behavior === 'newTab') {
      await openFolderInNewTab(folderPath);
    } else if (behavior === 'reuseWindow') {
      await reuseFileManagerWindow(folderPath);
    } else {
      await openFolderInNewWindow(folderPath);
    }

    logEvent('Folder opened', { folderPath, behavior });
    return { success: true };
  } catch (error) {
    logEvent('Configured open behavior failed, trying fallback', {
      folderPath,
      behavior,
      error: error.message
    });

    try {
      await openFolderInNewWindow(folderPath);
      return { success: true };
    } catch (fallbackError) {
      return { success: false, error: fallbackError.message };
    }
  }
}

/**
 * Finds a project directory by its last four digits.
 * @param {string} digits
 * @returns {{projectNumber: string, year: string}|null}
 */
function findProjectByDigits(digits) {
  if (digits.length !== 4) {
    return null;
  }

  try {
    const rootDir = config.racine;

    if (!rootDir || !fs.existsSync(rootDir)) {
      return null;
    }

    const yearDirs = fs.readdirSync(rootDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && /^20\d{2}$/.test(dirent.name))
      .map(dirent => dirent.name)
      .sort((a, b) => b.localeCompare(a));

    for (const year of yearDirs) {
      const projectName = `${year}-${digits}`;
      const projectPath = path.join(rootDir, year, projectName);

      if (fs.existsSync(projectPath)) {
        return { projectNumber: projectName, year };
      }
    }
  } catch (error) {
    notifyError('Erreur pendant la recherche du projet', error);
  }

  return null;
}

/**
 * Builds the absolute path to a project subfolder.
 * @param {string} projectNumber
 * @param {string} [subfolderPath]
 * @returns {string}
 */
function buildProjectPath(projectNumber, subfolderPath = '') {
  const year = projectNumber.substring(0, 4);
  let fullPath = path.join(config.racine, year, projectNumber);

  if (subfolderPath) {
    const normalizedSubfolder = subfolderPath.replace(/[\\/]/g, path.sep);
    fullPath = path.join(fullPath, normalizedSubfolder);
  }

  return fullPath;
}

/**
 * Sends a config refresh event to all renderer windows.
 */
function broadcastConfigUpdated() {
  for (const win of [mainWindow, miniWindow, settingsWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-updated');
    }
  }
}

/**
 * Wraps IPC handlers with consistent logging and errors.
 * @param {string} channel
 * @param {Function} handler
 */
function registerIpcHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      notifyError(`Erreur IPC: ${channel}`, error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Registers all renderer IPC endpoints.
 */
function registerIpcHandlers() {
  registerIpcHandler('get-config', async () => ({
    ...config,
    dockedMoveMode: config.integrationMode === 'docked' && !isMac() && dockedMoveMode
  }));

  registerIpcHandler('open-project-folder', async (event, projectInput, subfolderIndex) => {
    let projectNumber = String(projectInput || '').trim();

    if (/^\d{4}$/.test(projectNumber)) {
      const found = findProjectByDigits(projectNumber);

      if (found) {
        projectNumber = found.projectNumber;
      } else {
        const error = `Projet non trouvé: ${projectNumber}`;
        notifyError('Projet introuvable', `Aucun projet trouvé avec le numéro: ${projectNumber}`);
        return { success: false, error };
      }
    }

    const subfolder = config.sousDossiers[subfolderIndex] || config.sousDossiers[0];
    const folderPath = buildProjectPath(projectNumber, subfolder.chemin);
    const result = await openFolder(folderPath);

    if (result.success) {
      hideWindow();

      if (isMac() && config.integrationMode === 'docked' && miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.hide();
      }
    } else {
      notifyError('Ouverture impossible', result.error);
    }

    return result;
  });

  registerIpcHandler('hide-window', async () => {
    hideWindow();
    return { success: true };
  });

  registerIpcHandler('mini-bar-focused', async () => ({ success: true }));

  registerIpcHandler('toggle-mini-pin', async () => toggleMiniPin());

  registerIpcHandler('check-for-updates', async () => checkForUpdates(true));
  registerIpcHandler('start-update-download', async () => startUpdateDownload());
  registerIpcHandler('install-downloaded-update', async () => {
    installDownloadedUpdate();
    return { success: true };
  });
  registerIpcHandler('close-update-window', async () => {
    if (updateWindow && !updateWindow.isDestroyed() && updateState.status !== 'installing') {
      updateWindow.close();
    }

    return { success: true };
  });

  registerIpcHandler('resize-mini-bar', async (event, newWidth) => {
    if (!miniWindow || miniWindow.isDestroyed()) {
      return { success: false, error: 'Mini-barre indisponible' };
    }

    const width = clamp(Number(newWidth) || MINI_BASE_WIDTH, MINI_BASE_WIDTH, MINI_MAX_WIDTH);

    if (config.integrationMode === 'floating' || (config.integrationMode === 'docked' && isWindows())) {
      resizeMiniWindowInPlace(width);
    } else {
      repositionMiniWindow(width);
    }

    return { success: true };
  });

  registerIpcHandler('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choisir le dossier racine'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }

    return null;
  });

  registerIpcHandler('save-settings', async (event, newConfig) => {
    globalShortcut.unregisterAll();

    config.racine = String(newConfig.racine || '');
    config.sousDossiers = Array.isArray(newConfig.sousDossiers) && newConfig.sousDossiers.length > 0
      ? newConfig.sousDossiers
      : createDefaultConfig().sousDossiers;
    config.raccourciGlobal = String(newConfig.raccourciGlobal || 'CommandOrControl+Shift+P');
    config.autoStart = Boolean(newConfig.autoStart);
    config.integrationMode = VALID_INTEGRATION_MODES.includes(newConfig.integrationMode)
      ? newConfig.integrationMode
      : 'floating';
    config.openBehavior = VALID_OPEN_BEHAVIORS.includes(newConfig.openBehavior)
      ? newConfig.openBehavior
      : 'newWindow';
    config.miniBar.enabled = config.integrationMode !== 'hidden';
    if (config.integrationMode !== 'hidden') {
      config.miniBar.lastVisibleIntegrationMode = config.integrationMode;
    }
    config.openInNewTab = config.openBehavior === 'newTab';
    config.reuseExplorerWindow = config.openBehavior === 'reuseWindow';
    dockedMoveMode = false;

    saveConfig();
    setupAutoLaunch();
    registerGlobalShortcut();
    recreateMiniWindow();
    updateTrayMenu();
    broadcastConfigUpdated();
    logEvent('Settings saved', {
      integrationMode: config.integrationMode,
      openBehavior: config.openBehavior
    });

    return { success: true };
  });

  registerIpcHandler('close-settings', async () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }

    return { success: true };
  });
}

/**
 * Handles display changes without changing the user's pinned mini-bar position.
 */
function handleDisplayMetricsChanged() {
  bumpMiniWindowAboveTaskbar();
}

app.whenReady().then(() => {
  configPath = getConfigPath();
  logPath = getLogPath();
  loadConfig();
  logEvent('App ready', { platform: process.platform, version: app.getVersion() });
  configureAutoUpdater();
  setupAutoLaunch();
  registerIpcHandlers();
  createWindow();
  createTray();
  createMiniWindow();
  registerGlobalShortcut();
  scheduleUpdateChecks();

  screen.on('display-metrics-changed', handleDisplayMetricsChanged);
  screen.on('display-added', handleDisplayMetricsChanged);
  screen.on('display-removed', handleDisplayMetricsChanged);

  if (!config.racine) {
    createSettingsWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  stopMiniZOrderKeeper();
  logEvent('App quitting');
});

app.on('window-all-closed', () => {
  logEvent('All windows closed, app kept alive in tray');
});

process.on('uncaughtException', (error) => {
  notifyError('Erreur non interceptée', error);
});

process.on('unhandledRejection', (reason) => {
  notifyError('Promesse rejetée', reason instanceof Error ? reason : String(reason));
});
