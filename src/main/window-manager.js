'use strict';

const fs = require('fs');
const path = require('path');
const {
  APP_NAME,
  MAIN_WINDOW_SIZE,
  MINI_BASE_WIDTH,
  MINI_DEFAULT_HEIGHT,
  SETTINGS_WINDOW_SIZE,
  UPDATE_WINDOW_SIZE,
  VALID_INTEGRATION_MODES
} = require('./constants');
const { isMac, isWindows } = require('./platform');
const {
  calculateMiniBounds,
  fitWindowToWorkArea
} = require('./window-bounds');
const {
  WINDOW_ROLES,
  createSecureWebPreferences,
  hardenWindow
} = require('./security');

class WindowManager {
  constructor(options) {
    this.app = options.app;
    this.BrowserWindow = options.BrowserWindow;
    this.Tray = options.Tray;
    this.Menu = options.Menu;
    this.nativeImage = options.nativeImage;
    this.screen = options.screen;
    this.configStore = options.configStore;
    this.registry = options.registry;
    this.logger = options.logger;
    this.appRoot = options.appRoot;
    this.preloadPath = path.join(this.appRoot, 'preload.js');
    this.platform = options.platform || process.platform;
    this.actions = options.actions || {};
    this.mainWindow = null;
    this.miniWindow = null;
    this.settingsWindow = null;
    this.updateWindow = null;
    this.tray = null;
    this.dockedMoveMode = false;
    this.miniZOrderTimer = null;
    this.destroyingMini = false;
    this.currentUpdateState = null;
  }

  setActions(actions) {
    this.actions = {
      ...this.actions,
      ...actions
    };
  }

  get config() {
    return this.configStore.config;
  }

  getConfigView() {
    return {
      ...this.config,
      dockedMoveMode: this.config.integrationMode === 'docked'
        && !isMac(this.platform)
        && this.dockedMoveMode
    };
  }

  getAppIconPath() {
    return path.join(
      this.appRoot,
      'assets',
      isWindows(this.platform) ? 'icon.ico' : 'icon.png'
    );
  }

  createAll() {
    this.createMainWindow();
    this.createTray();
    this.createMiniWindow();
  }

  createMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }

    const display = this.screen.getPrimaryDisplay();
    const bounds = fitWindowToWorkArea(MAIN_WINDOW_SIZE, display.workArea, {
      margin: 8,
      minWidth: 360,
      minHeight: 320
    });
    bounds.y = Math.max(
      display.workArea.y + 8,
      Math.round(bounds.y - 100)
    );

    const htmlPath = path.join(this.appRoot, 'index.html');
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      ...(isMac(this.platform) && {
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000'
      }),
      webPreferences: createSecureWebPreferences(this.preloadPath)
    });

    this.registerAndLoad(win, WINDOW_ROLES.MAIN, htmlPath);
    win.on('blur', () => this.hideMainWindow());
    win.on('closed', () => {
      if (this.mainWindow === win) {
        this.mainWindow = null;
      }
    });
    this.mainWindow = win;
    this.logger.info('Main search window created');
    return win;
  }

  createMiniWindow() {
    if (this.config.integrationMode === 'hidden') {
      return null;
    }

    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      return this.miniWindow;
    }

    const mode = this.config.integrationMode;
    const macPopover = isMac(this.platform) && mode === 'docked';
    const canMove = mode === 'floating'
      || (mode === 'docked' && this.dockedMoveMode && !isMac(this.platform));
    const htmlPath = path.join(this.appRoot, 'mini-search.html');
    const bounds = this.calculateMiniBounds(MINI_BASE_WIDTH);
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: !macPopover,
      focusable: true,
      movable: canMove,
      ...(isMac(this.platform) && {
        vibrancy: macPopover ? 'menu' : 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000'
      }),
      webPreferences: createSecureWebPreferences(this.preloadPath)
    });

    this.registerAndLoad(win, WINDOW_ROLES.MINI, htmlPath);
    win.setAlwaysOnTop(true, 'screen-saver');

    win.on('blur', () => {
      if (macPopover && !win.isDestroyed()) {
        win.hide();
        return;
      }

      if (isWindows(this.platform)) {
        setTimeout(() => this.bumpMiniWindowAboveTaskbar(), 40);
        setTimeout(() => this.bumpMiniWindowAboveTaskbar(), 180);
      }
    });

    win.on('moved', () => {
      if (win.isDestroyed()) {
        return;
      }

      const [x, y] = win.getPosition();
      if (mode === 'floating') {
        this.configStore.update(config => {
          config.miniBar.position = { x, y };
        });
      } else if (mode === 'docked' && this.dockedMoveMode && !isMac(this.platform)) {
        this.saveDockedPosition(win.getBounds());
      }
    });

    win.on('close', event => {
      if (!this.app.isQuitting && !this.destroyingMini) {
        event.preventDefault();
        win.hide();
      }
    });

    win.on('closed', () => {
      if (this.miniWindow === win) {
        this.miniWindow = null;
      }
    });

    this.miniWindow = win;
    this.startMiniZOrderKeeper();
    this.logger.info('Mini window created', { mode });
    return win;
  }

  createSettingsWindow() {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    const display = this.screen.getPrimaryDisplay();
    const bounds = fitWindowToWorkArea(SETTINGS_WINDOW_SIZE, display.workArea, {
      margin: 12,
      minWidth: 560,
      minHeight: 520
    });
    const htmlPath = path.join(this.appRoot, 'settings.html');
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: true,
      minWidth: Math.min(560, bounds.width),
      minHeight: Math.min(520, bounds.height),
      skipTaskbar: false,
      alwaysOnTop: true,
      icon: this.getAppIconPath(),
      ...(isMac(this.platform) && {
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000'
      }),
      webPreferences: createSecureWebPreferences(this.preloadPath)
    });

    this.registerAndLoad(win, WINDOW_ROLES.SETTINGS, htmlPath);
    win.on('closed', () => {
      if (this.settingsWindow === win) {
        this.settingsWindow = null;
      }
    });
    this.settingsWindow = win;
    this.logger.info('Settings window created');
    return win;
  }

  createUpdateWindow() {
    if (this.updateWindow && !this.updateWindow.isDestroyed()) {
      return this.updateWindow;
    }

    const display = this.screen.getPrimaryDisplay();
    const bounds = fitWindowToWorkArea(UPDATE_WINDOW_SIZE, display.workArea, {
      margin: 12,
      minWidth: 480,
      minHeight: 440
    });
    const htmlPath = path.join(this.appRoot, 'update.html');
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: true,
      minWidth: Math.min(480, bounds.width),
      minHeight: Math.min(440, bounds.height),
      skipTaskbar: false,
      alwaysOnTop: true,
      show: false,
      icon: this.getAppIconPath(),
      ...(isMac(this.platform) && {
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000'
      }),
      webPreferences: createSecureWebPreferences(this.preloadPath)
    });

    this.registerAndLoad(win, WINDOW_ROLES.UPDATE, htmlPath);
    win.webContents.once('did-finish-load', () => {
      if (this.currentUpdateState) {
        this.broadcastUpdateState(this.currentUpdateState);
      }
    });
    win.on('closed', () => {
      if (this.updateWindow === win) {
        this.updateWindow = null;
      }
    });
    this.updateWindow = win;
    this.logger.info('Update window created');
    return win;
  }

  registerAndLoad(win, role, htmlPath) {
    this.registry.register(win, role);
    hardenWindow(win, htmlPath, this.logger);
    win.loadFile(htmlPath).catch(error => {
      this.logger.error('Unable to load renderer', {
        role,
        error: error.message
      });
    });
  }

  createTray() {
    if (this.tray) {
      return this.tray;
    }

    try {
      let trayIcon;
      if (isMac(this.platform)) {
        const templatePath = path.join(this.appRoot, 'assets', 'iconTemplate.png');
        trayIcon = fs.existsSync(templatePath)
          ? this.nativeImage.createFromPath(templatePath)
          : this.nativeImage.createFromPath(path.join(this.appRoot, 'assets', 'icon.png'))
            .resize({ width: 22, height: 22 });
        trayIcon.setTemplateImage(true);
      } else {
        trayIcon = this.nativeImage.createFromPath(this.getAppIconPath());
      }

      this.tray = new this.Tray(trayIcon);
    } catch (error) {
      this.logger.error('Unable to load tray icon', { error: error.message });
      this.tray = new this.Tray(
        this.nativeImage.createEmpty().resize({ width: 16, height: 16 })
      );
    }

    this.tray.setToolTip(APP_NAME);
    this.updateTrayMenu();
    this.tray.on('click', () => {
      if (isMac(this.platform) && this.config.integrationMode === 'docked') {
        this.toggleMacMenuPopover();
      } else {
        this.toggleMainWindow();
      }
    });

    if (isMac(this.platform)) {
      this.tray.on('right-click', () => {
        this.tray.popUpContextMenu(this.buildTrayMenu());
      });
    }

    this.logger.info('Tray created');
    return this.tray;
  }

  buildTrayMenu() {
    const updateState = this.actions.getUpdateState?.();
    const updateLabel = updateState?.status === 'available' && updateState.availableVersion
      ? `Mise à jour ${updateState.availableVersion} disponible...`
      : 'Vérifier les mises à jour...';

    return this.Menu.buildFromTemplate([
      {
        label: 'Ouvrir la recherche',
        click: () => this.showMainWindow()
      },
      {
        label: `Raccourci: ${this.formatShortcutLabel(this.config.raccourciGlobal)}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Afficher la mini-barre',
        type: 'checkbox',
        checked: this.config.integrationMode !== 'hidden',
        click: () => this.toggleMiniVisibility()
      },
      {
        label: 'Déplacer la barre épinglée',
        type: 'checkbox',
        checked: this.dockedMoveMode,
        enabled: this.config.integrationMode === 'docked' && !isMac(this.platform),
        click: () => this.toggleDockedMoveMode()
      },
      {
        label: isMac(this.platform) ? 'Lancer au démarrage' : 'Démarrer avec Windows',
        type: 'checkbox',
        checked: Boolean(this.config.autoStart),
        click: () => this.actions.toggleAutoLaunch?.()
      },
      { type: 'separator' },
      {
        label: updateLabel,
        click: () => this.actions.checkForUpdates?.()
      },
      { type: 'separator' },
      {
        label: 'Paramètres...',
        click: () => this.createSettingsWindow()
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => this.actions.quit?.()
      }
    ]);
  }

  updateTrayMenu() {
    if (!this.tray) {
      return;
    }

    if (isMac(this.platform)) {
      this.tray.setContextMenu(null);
    } else {
      this.tray.setContextMenu(this.buildTrayMenu());
    }
  }

  formatShortcutLabel(shortcut) {
    return (shortcut || 'CommandOrControl+Shift+P')
      .replace('CommandOrControl', isMac(this.platform) ? 'Cmd' : 'Ctrl');
  }

  showMainWindow() {
    const win = this.createMainWindow();
    const cursorPoint = this.screen.getCursorScreenPoint();
    const display = this.screen.getDisplayNearestPoint(cursorPoint);
    const bounds = fitWindowToWorkArea(MAIN_WINDOW_SIZE, display.workArea, {
      margin: 8,
      minWidth: 360,
      minHeight: 320
    });
    bounds.y = Math.max(display.workArea.y + 8, Math.round(bounds.y - 100));
    win.setBounds(bounds);
    win.show();
    win.focus();
    win.webContents.send('window-shown');
  }

  hideMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
      this.mainWindow.hide();
      this.mainWindow.webContents.send('window-hidden');
    }
  }

  toggleMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
      this.hideMainWindow();
    } else {
      this.showMainWindow();
    }
  }

  showUpdateWindow(state = null) {
    if (state) {
      this.currentUpdateState = state;
    }
    const win = this.createUpdateWindow();
    win.show();
    win.focus();
    if (this.currentUpdateState && !win.webContents.isLoading()) {
      this.broadcastUpdateState(this.currentUpdateState);
    }
  }

  closeUpdateWindow() {
    if (this.updateWindow && !this.updateWindow.isDestroyed()) {
      this.updateWindow.close();
    }
  }

  closeSettingsWindow() {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close();
    }
  }

  broadcastConfigUpdated() {
    for (const win of [this.mainWindow, this.miniWindow, this.settingsWindow]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('config-updated');
      }
    }
  }

  broadcastUpdateState(state) {
    this.currentUpdateState = state;
    if (this.updateWindow && !this.updateWindow.isDestroyed()) {
      this.updateWindow.webContents.send('update-state', state);
    }
  }

  setProgressBar(value) {
    for (const win of this.BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && typeof win.setProgressBar === 'function') {
        win.setProgressBar(value);
      }
    }
  }

  calculateMiniBounds(requestedWidth) {
    return calculateMiniBounds({
      requestedWidth,
      integrationMode: this.config.integrationMode,
      miniBar: this.config.miniBar,
      primaryDisplay: this.screen.getPrimaryDisplay(),
      displayNearestPoint: point => this.screen.getDisplayNearestPoint(point),
      platform: this.platform,
      trayBounds: this.tray ? this.tray.getBounds() : null
    });
  }

  resizeMiniWindow(width) {
    if (!this.miniWindow || this.miniWindow.isDestroyed()) {
      return { success: false, error: 'Mini-barre indisponible' };
    }

    const currentBounds = this.miniWindow.getBounds();
    if (isMac(this.platform) && this.config.integrationMode === 'docked') {
      this.miniWindow.setBounds(this.calculateMiniBounds(width));
    } else {
      this.miniWindow.setBounds({
        x: currentBounds.x,
        y: currentBounds.y,
        width,
        height: MINI_DEFAULT_HEIGHT
      });

      if (this.config.integrationMode === 'docked' && isWindows(this.platform)) {
        this.saveDockedPosition(this.miniWindow.getBounds());
      }
    }

    this.bumpMiniWindowAboveTaskbar();
    return { success: true };
  }

  saveDockedPosition(bounds) {
    this.configStore.update(config => {
      config.miniBar.dockedUseCustomPosition = true;
      config.miniBar.dockedPosition = {
        x: bounds.x,
        y: bounds.y
      };
    });
  }

  destroyMiniWindow() {
    this.stopMiniZOrderKeeper();
    if (!this.miniWindow || this.miniWindow.isDestroyed()) {
      this.miniWindow = null;
      return;
    }

    const win = this.miniWindow;
    this.miniWindow = null;
    this.destroyingMini = true;
    win.destroy();
    this.destroyingMini = false;
  }

  recreateMiniWindow() {
    this.destroyMiniWindow();
    if (this.config.integrationMode !== 'hidden') {
      this.createMiniWindow();
    }
  }

  toggleMiniPin() {
    this.configStore.update(config => {
      if (config.integrationMode === 'hidden') {
        config.integrationMode = 'floating';
      } else if (config.integrationMode === 'docked') {
        if (this.miniWindow && !this.miniWindow.isDestroyed() && !isMac(this.platform)) {
          const bounds = this.miniWindow.getBounds();
          config.miniBar.position = { x: bounds.x, y: bounds.y };
        }
        config.integrationMode = 'floating';
      } else {
        config.integrationMode = 'docked';
      }

      config.miniBar.lastVisibleIntegrationMode = config.integrationMode;
    });

    this.dockedMoveMode = false;
    this.recreateMiniWindow();
    this.updateTrayMenu();
    this.broadcastConfigUpdated();
    this.logger.info('Mini pin toggled', { integrationMode: this.config.integrationMode });
    return { success: true, integrationMode: this.config.integrationMode };
  }

  toggleMiniVisibility() {
    this.configStore.update(config => {
      if (config.integrationMode === 'hidden') {
        const previous = config.miniBar.lastVisibleIntegrationMode;
        config.integrationMode = VALID_INTEGRATION_MODES.includes(previous) && previous !== 'hidden'
          ? previous
          : 'floating';
      } else {
        config.miniBar.lastVisibleIntegrationMode = config.integrationMode;
        config.integrationMode = 'hidden';
      }
    });

    this.dockedMoveMode = false;
    this.recreateMiniWindow();
    this.updateTrayMenu();
    this.broadcastConfigUpdated();
    this.logger.info('Mini visibility toggled', { integrationMode: this.config.integrationMode });
  }

  toggleDockedMoveMode() {
    if (isMac(this.platform) || this.config.integrationMode !== 'docked') {
      return;
    }

    if (this.dockedMoveMode && this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.saveDockedPosition(this.miniWindow.getBounds());
    }

    this.dockedMoveMode = !this.dockedMoveMode;
    this.recreateMiniWindow();
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.show();
      if (this.dockedMoveMode) {
        this.miniWindow.focus();
      }
    }
    this.updateTrayMenu();
    this.broadcastConfigUpdated();
    this.logger.info('Docked move mode changed', { enabled: this.dockedMoveMode });
  }

  toggleMacMenuPopover() {
    const win = this.createMiniWindow();
    if (!win) {
      return;
    }

    if (win.isVisible()) {
      win.hide();
      return;
    }

    win.setBounds(this.calculateMiniBounds(MINI_BASE_WIDTH));
    win.show();
    win.focus();
    win.webContents.send('mini-popover-shown');
  }

  hideMacPopoverAfterOpen() {
    if (
      isMac(this.platform)
      && this.config.integrationMode === 'docked'
      && this.miniWindow
      && !this.miniWindow.isDestroyed()
    ) {
      this.miniWindow.hide();
    }
  }

  shouldKeepMiniAboveOtherWindows() {
    return isWindows(this.platform)
      && this.config.integrationMode !== 'hidden'
      && this.miniWindow
      && !this.miniWindow.isDestroyed()
      && this.miniWindow.isVisible();
  }

  bumpMiniWindowAboveTaskbar() {
    if (!this.shouldKeepMiniAboveOtherWindows()) {
      return;
    }

    try {
      this.miniWindow.setAlwaysOnTop(true, 'screen-saver');
      if (typeof this.miniWindow.moveTop === 'function') {
        this.miniWindow.moveTop();
      }
    } catch (error) {
      this.logger.warn('Unable to reassert mini-bar z-order', { error: error.message });
    }
  }

  startMiniZOrderKeeper() {
    this.stopMiniZOrderKeeper();
    if (!this.shouldKeepMiniAboveOtherWindows()) {
      return;
    }

    this.bumpMiniWindowAboveTaskbar();
    this.miniZOrderTimer = setInterval(() => {
      this.bumpMiniWindowAboveTaskbar();
    }, 600);
    if (typeof this.miniZOrderTimer.unref === 'function') {
      this.miniZOrderTimer.unref();
    }
  }

  stopMiniZOrderKeeper() {
    if (this.miniZOrderTimer) {
      clearInterval(this.miniZOrderTimer);
      this.miniZOrderTimer = null;
    }
  }

  handleDisplayChange() {
    if (
      this.config.integrationMode === 'floating'
      && this.miniWindow
      && !this.miniWindow.isDestroyed()
    ) {
      const currentWidth = this.miniWindow.getBounds().width;
      this.miniWindow.setBounds(this.calculateMiniBounds(currentWidth));
    }
    this.bumpMiniWindowAboveTaskbar();
  }

  prepareForQuit() {
    this.stopMiniZOrderKeeper();
  }

  dispose() {
    this.prepareForQuit();
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = {
  WindowManager
};
