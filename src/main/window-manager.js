'use strict';

const fs = require('fs');
const path = require('path');
const {
  APP_NAME,
  MAIN_WINDOW_SIZE,
  MINI_BASE_WIDTH,
  MINI_DEFAULT_HEIGHT,
  MINI_FRAME_MARGIN,
  MINI_PANEL_GAP,
  SETTINGS_WINDOW_SIZE,
  UPDATE_WINDOW_SIZE,
  VALID_INTEGRATION_MODES
} = require('./constants');
const { isMac, isWindows } = require('./platform');
const { formatAccelerator, formatRecentLabel } = require('../shared/launcher-shared');
const {
  calculateMiniBounds,
  fitWindowToWorkArea,
  layoutMiniBounds
} = require('./window-bounds');

const TRAY_RECENT_COUNT = 3;
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
    // Position of the collapsed mini bar; expanded bounds derive from it.
    this.miniBasePosition = null;
    // Window top-left relative to the base while widened or opened upwards.
    this.miniOffset = { x: 0, y: 0 };
    this.lastMiniLayout = null;
    this.lastMiniBounds = null;
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
      appVersion: this.app.getVersion(),
      dockedMoveMode: this.config.integrationMode === 'docked'
        && !isMac(this.platform)
        && this.dockedMoveMode
    };
  }

  // The popup sits a little above the centre of the display.
  getMainWindowBounds(display) {
    const bounds = fitWindowToWorkArea(MAIN_WINDOW_SIZE, display.workArea, {
      margin: 0,
      minWidth: 640,
      minHeight: 340
    });
    bounds.y = Math.max(display.workArea.y, Math.round(bounds.y - 100));
    return bounds;
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
    const bounds = this.getMainWindowBounds(display);

    const htmlPath = path.join(this.appRoot, 'index.html');
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#00000000',
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
      backgroundColor: '#00000000',
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

      const bounds = win.getBounds();
      // macOS also reports programmatic moves, which must not shift the base.
      if (this.isLastAppliedMiniBounds(bounds)) {
        return;
      }

      // The window may be widened leftwards or opened upwards around the
      // bar: the base is where the collapsed bar now stands.
      const x = bounds.x + this.miniOffset.x;
      const y = bounds.y + this.miniOffset.y;
      this.miniBasePosition = { x, y };
      this.lastMiniBounds = bounds;
      if (mode === 'floating') {
        this.configStore.update(config => {
          config.miniBar.position = { x, y };
        });
      } else if (mode === 'docked' && this.dockedMoveMode && !isMac(this.platform)) {
        this.saveDockedPosition({ x, y });
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
    this.miniBasePosition = { x: bounds.x, y: bounds.y };
    this.miniOffset = { x: 0, y: 0 };
    this.lastMiniLayout = null;
    this.lastMiniBounds = bounds;
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
      margin: 0,
      minWidth: 680,
      minHeight: 480
    });
    const htmlPath = path.join(this.appRoot, 'settings.html');
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: true,
      minWidth: Math.min(680, bounds.width),
      minHeight: Math.min(480, bounds.height),
      skipTaskbar: false,
      alwaysOnTop: true,
      icon: this.getAppIconPath(),
      backgroundColor: '#00000000',
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
      margin: 0,
      minWidth: 560,
      minHeight: 320
    });
    const htmlPath = path.join(this.appRoot, 'update.html');
    const win = new this.BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: true,
      minWidth: Math.min(560, bounds.width),
      minHeight: Math.min(320, bounds.height),
      skipTaskbar: false,
      alwaysOnTop: true,
      show: false,
      icon: this.getAppIconPath(),
      backgroundColor: '#00000000',
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

  // Design 2h: the three latest folders first, then the search, options,
  // update, settings and quit groups.
  buildTrayMenu() {
    const updateState = this.actions.getUpdateState?.();
    const updateLabel = updateState?.status === 'available' && updateState.availableVersion
      ? `Mise à jour ${updateState.availableVersion} disponible…`
      : 'Rechercher une mise à jour…';
    const recents = (this.config.recentFolders || []).slice(0, TRAY_RECENT_COUNT);
    const recentItems = recents.length === 0
      ? []
      : [
        { label: `Récents · ${recents.length}`, enabled: false },
        ...recents.map(recent => ({
          label: formatRecentLabel(recent),
          click: () => this.actions.openRecentFolder?.(recent.id)
        })),
        { type: 'separator' }
      ];

    return this.Menu.buildFromTemplate([
      ...recentItems,
      {
        label: 'Ouvrir la recherche',
        accelerator: this.config.raccourciGlobal,
        // Display only: the global shortcut is registered separately.
        registerAccelerator: false,
        click: () => this.showMainWindow()
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
      {
        label: 'Paramètres…',
        click: () => this.createSettingsWindow()
      },
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
    return formatAccelerator(shortcut, isMac(this.platform));
  }

  showMainWindow() {
    const win = this.createMainWindow();
    const cursorPoint = this.screen.getCursorScreenPoint();
    const display = this.screen.getDisplayNearestPoint(cursorPoint);
    const bounds = this.getMainWindowBounds(display);
    win.setBounds(bounds);
    win.show();
    win.focus();
    win.webContents.send('window-shown');
    this.actions.prepareFolderOpening?.();
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

  // Sizes the mini window around the content measured by its renderer (the
  // bar, plus the drop-down pane while it is open) and tells the renderer on
  // which side of the bar the pane must be drawn.
  setMiniLayout(layout) {
    if (!this.miniWindow || this.miniWindow.isDestroyed()) {
      return { success: false, error: 'Mini-barre indisponible' };
    }

    const frame = MINI_FRAME_MARGIN * 2;
    const panelOpen = layout.panelWidth > 0 && layout.panelHeight > 0;
    const width = Math.max(layout.barWidth, panelOpen ? layout.panelWidth : 0) + frame;
    const collapsedHeight = layout.barHeight + frame;
    const height = collapsedHeight + (panelOpen ? MINI_PANEL_GAP + layout.panelHeight : 0);
    this.lastMiniLayout = layout;

    if (isMac(this.platform) && this.config.integrationMode === 'docked') {
      // Menu bar popover: hangs under the tray icon.
      const anchored = this.calculateMiniBounds(width);
      this.applyMiniBounds({ ...anchored, width, height });
      return { success: true, direction: 'down', align: 'left' };
    }

    const base = this.getMiniBasePosition();
    const { bounds, direction, align } = layoutMiniBounds(base, {
      width,
      height,
      collapsedWidth: layout.collapsedWidth + frame,
      collapsedHeight
    }, this.getMiniDisplay(base).bounds);
    this.miniOffset = { x: base.x - bounds.x, y: base.y - bounds.y };
    this.applyMiniBounds(bounds);

    if (this.config.integrationMode === 'docked' && isWindows(this.platform)) {
      this.saveDockedPosition(base);
    }

    this.bumpMiniWindowAboveTaskbar();
    return { success: true, direction, align };
  }

  getMiniBasePosition() {
    if (this.miniBasePosition) {
      return this.miniBasePosition;
    }

    const { x, y } = this.miniWindow.getBounds();
    return { x, y };
  }

  // The bar may sit on the taskbar, docked or not: only the display edges
  // limit it, never the work area.
  getMiniDisplay(base) {
    return this.screen.getDisplayNearestPoint({
      x: base.x + Math.round(MINI_BASE_WIDTH / 2),
      y: base.y + Math.round(MINI_DEFAULT_HEIGHT / 2)
    });
  }

  applyMiniBounds(bounds) {
    this.lastMiniBounds = bounds;
    this.miniWindow.setBounds(bounds);
  }

  isLastAppliedMiniBounds(bounds) {
    const last = this.lastMiniBounds;
    return Boolean(last)
      && last.x === bounds.x
      && last.y === bounds.y
      && last.width === bounds.width
      && last.height === bounds.height;
  }

  saveDockedPosition(position) {
    const { dockedUseCustomPosition, dockedPosition } = this.config.miniBar;
    if (
      dockedUseCustomPosition
      && dockedPosition
      && dockedPosition.x === position.x
      && dockedPosition.y === position.y
    ) {
      return;
    }

    this.configStore.update(config => {
      config.miniBar.dockedUseCustomPosition = true;
      config.miniBar.dockedPosition = {
        x: position.x,
        y: position.y
      };
    });
  }

  destroyMiniWindow() {
    this.stopMiniZOrderKeeper();
    this.miniBasePosition = null;
    this.miniOffset = { x: 0, y: 0 };
    this.lastMiniLayout = null;
    this.lastMiniBounds = null;
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
    // Outside macOS (where docking means the menu bar popover), pinning and
    // unpinning keep the bar exactly where the user placed it.
    const currentPosition = this.miniWindow && !this.miniWindow.isDestroyed() && !isMac(this.platform)
      ? { ...this.getMiniBasePosition() }
      : null;

    this.configStore.update(config => {
      if (config.integrationMode === 'hidden') {
        config.integrationMode = 'floating';
      } else if (config.integrationMode === 'docked') {
        if (currentPosition) {
          config.miniBar.position = currentPosition;
        }
        config.integrationMode = 'floating';
      } else {
        if (currentPosition) {
          config.miniBar.dockedUseCustomPosition = true;
          config.miniBar.dockedPosition = currentPosition;
        }
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
      this.saveDockedPosition(this.getMiniBasePosition());
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

    this.reapplyMiniLayout();
    win.show();
    win.focus();
    win.webContents.send('mini-popover-shown');
  }

  // Lays the window out again from the last content size its renderer sent.
  reapplyMiniLayout() {
    if (this.lastMiniLayout) {
      this.setMiniLayout(this.lastMiniLayout);
    } else {
      this.applyMiniBounds(this.calculateMiniBounds(MINI_BASE_WIDTH));
    }
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
      const base = this.calculateMiniBounds(MINI_BASE_WIDTH);
      this.miniBasePosition = { x: base.x, y: base.y };
      this.reapplyMiniLayout();
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
