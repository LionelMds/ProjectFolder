'use strict';

const path = require('path');
const { APP_NAME } = require('./constants');
const { ConfigStore, validateSettingsInput } = require('./config-store');
const { FolderOpener } = require('./folder-openers');
const { IpcRouter } = require('./ipc-router');
const {
  validateGlobalShortcut,
  validateMiniWidth,
  validateProjectInput,
  validateRecentId,
  validateSubfolderIndex
} = require('./ipc-validation');
const { RotatingLogger } = require('./logger');
const { ProjectService } = require('./project-service');
const { rememberRecentFolder } = require('./recent-folders');
const {
  WINDOW_ROLES,
  WindowRoleRegistry,
  configureSessionSecurity
} = require('./security');
const { UpdaterService } = require('./updater-service');
const { WindowManager } = require('./window-manager');

class ApplicationController {
  constructor(electron, autoUpdater, options = {}) {
    this.electron = electron;
    this.autoUpdater = autoUpdater;
    this.appRoot = options.appRoot || path.resolve(__dirname, '..', '..');
    this.platform = options.platform || process.platform;
    this.logger = null;
    this.configStore = null;
    this.registry = null;
    this.windowManager = null;
    this.projectService = null;
    this.folderOpener = null;
    this.updaterService = null;
    this.ipcRouter = null;
    this.initialized = false;
    this.displayChangeHandler = () => this.windowManager?.handleDisplayChange();
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    const { app, session } = this.electron;
    this.logger = new RotatingLogger(
      path.join(app.getPath('userData'), '.projectLauncher.log')
    );
    this.configStore = new ConfigStore(this.getConfigPath(), {
      platform: this.platform,
      logger: this.logger
    });
    this.configStore.load();
    this.registry = new WindowRoleRegistry(this.logger);
    configureSessionSecurity(session.defaultSession);

    this.windowManager = new WindowManager({
      ...this.electron,
      app,
      appRoot: this.appRoot,
      configStore: this.configStore,
      registry: this.registry,
      logger: this.logger,
      platform: this.platform
    });
    this.projectService = new ProjectService(() => this.configStore.config);
    this.folderOpener = new FolderOpener({
      shell: this.electron.shell,
      logger: this.logger,
      platform: this.platform
    });
    this.updaterService = new UpdaterService({
      autoUpdater: this.autoUpdater,
      app,
      logger: this.logger,
      windowManager: this.windowManager,
      platform: this.platform
    });
    this.ipcRouter = new IpcRouter({
      ipcMain: this.electron.ipcMain,
      registry: this.registry,
      logger: this.logger,
      notifyError: (title, error) => this.notifyError(title, error)
    });

    this.windowManager.setActions({
      toggleAutoLaunch: () => this.toggleAutoLaunch(),
      checkForUpdates: () => {
        this.updaterService.openUpdateCenter().catch(error => {
          this.notifyError('Recherche de mise à jour impossible', error);
        });
      },
      getUpdateState: () => this.updaterService.state,
      quit: () => {
        app.isQuitting = true;
        app.quit();
      }
    });

    this.registerIpcHandlers();
    this.updaterService.configure();
    this.setupAutoLaunch();
    this.windowManager.createAll();
    this.registerInitialGlobalShortcut();
    this.registerDisplayListeners();

    if (!this.configStore.config.racine) {
      this.windowManager.createSettingsWindow();
    }

    this.initialized = true;
    this.logger.info('Application initialized', {
      platform: this.platform,
      version: app.getVersion(),
      schemaVersion: this.configStore.config.schemaVersion
    });
  }

  getConfigPath() {
    const { app } = this.electron;
    if (!app.isPackaged) {
      return path.join(this.appRoot, 'config.json');
    }
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'config.json');
    }
    return path.join(app.getPath('userData'), 'config.json');
  }

  registerDisplayListeners() {
    for (const eventName of ['display-metrics-changed', 'display-added', 'display-removed']) {
      this.electron.screen.on(eventName, this.displayChangeHandler);
    }
  }

  unregisterDisplayListeners() {
    for (const eventName of ['display-metrics-changed', 'display-added', 'display-removed']) {
      this.electron.screen.removeListener(eventName, this.displayChangeHandler);
    }
  }

  setupAutoLaunch() {
    try {
      this.electron.app.setLoginItemSettings({
        openAtLogin: Boolean(this.configStore.config.autoStart)
      });
    } catch (error) {
      this.notifyError('Configuration du démarrage automatique impossible', error);
    }
  }

  toggleAutoLaunch() {
    this.configStore.update(config => {
      config.autoStart = !config.autoStart;
    });
    this.setupAutoLaunch();
    this.windowManager.updateTrayMenu();
    this.windowManager.broadcastConfigUpdated();
    this.logger.info('Auto-start changed', {
      enabled: this.configStore.config.autoStart
    });
  }

  registerInitialGlobalShortcut() {
    const shortcut = this.configStore.config.raccourciGlobal;
    if (!this.registerShortcut(shortcut)) {
      this.notifyError(
        'Raccourci global indisponible',
        `Impossible d'enregistrer: ${this.windowManager.formatShortcutLabel(shortcut)}`
      );
    }
  }

  registerShortcut(shortcut) {
    try {
      const registered = this.electron.globalShortcut.register(
        shortcut,
        () => this.windowManager.toggleMainWindow()
      );
      if (registered) {
        this.logger.info('Global shortcut registered', { shortcut });
      }
      return registered;
    } catch (error) {
      this.logger.error('Global shortcut registration failed', {
        shortcut,
        error: error.message
      });
      return false;
    }
  }

  transitionGlobalShortcut(nextShortcut) {
    const globalShortcut = this.electron.globalShortcut;
    const previousShortcut = this.configStore.config.raccourciGlobal;
    if (nextShortcut === previousShortcut) {
      return () => {};
    }

    globalShortcut.unregister(previousShortcut);
    if (!this.registerShortcut(nextShortcut)) {
      this.registerShortcut(previousShortcut);
      throw new Error(
        `Le raccourci ${this.windowManager.formatShortcutLabel(nextShortcut)} est déjà utilisé.`
      );
    }

    return () => {
      globalShortcut.unregister(nextShortcut);
      this.registerShortcut(previousShortcut);
    };
  }

  saveSettings(rawSettings) {
    const validated = validateSettingsInput(rawSettings);
    validated.raccourciGlobal = validateGlobalShortcut(validated.raccourciGlobal);
    const rollbackShortcut = this.transitionGlobalShortcut(validated.raccourciGlobal);

    try {
      this.configStore.applySettings(validated);
    } catch (error) {
      rollbackShortcut();
      throw error;
    }

    this.windowManager.dockedMoveMode = false;
    this.setupAutoLaunch();
    this.windowManager.recreateMiniWindow();
    this.windowManager.updateTrayMenu();
    this.windowManager.broadcastConfigUpdated();
    this.logger.info('Settings saved', {
      integrationMode: this.configStore.config.integrationMode,
      openBehavior: this.configStore.config.openBehavior
    });
    return { success: true };
  }

  registerIpcHandlers() {
    const { MAIN, MINI, SETTINGS, UPDATE } = WINDOW_ROLES;

    this.ipcRouter.handle('get-config', [MAIN, MINI, SETTINGS], async () => (
      this.windowManager.getConfigView()
    ));

    this.ipcRouter.handle('resolve-project', [MAIN, MINI], async (event, rawInput) => {
      const projectInput = validateProjectInput(rawInput);
      const project = await this.projectService.resolveProjectInput(projectInput);
      return project
        ? {
          success: true,
          found: true,
          projectNumber: project.projectNumber
        }
        : {
          success: true,
          found: false
        };
    });

    this.ipcRouter.handle(
      'open-project-folder',
      [MAIN, MINI],
      async (event, rawInput, rawSubfolderIndex) => (
        this.openProjectFolder(rawInput, rawSubfolderIndex)
      )
    );

    this.ipcRouter.handle('open-recent-folder', [MAIN], async (event, rawRecentId) => (
      this.openRecentFolder(rawRecentId)
    ));

    this.ipcRouter.handle('hide-window', [MAIN], async () => {
      this.windowManager.hideMainWindow();
      return { success: true };
    });

    this.ipcRouter.handle('mini-bar-focused', [MINI], async () => ({ success: true }));
    this.ipcRouter.handle('toggle-mini-pin', [MINI], async () => (
      this.windowManager.toggleMiniPin()
    ));
    this.ipcRouter.handle('resize-mini-bar', [MINI], async (event, rawWidth) => (
      this.windowManager.resizeMiniWindow(validateMiniWidth(rawWidth))
    ));

    this.ipcRouter.handle('select-folder', [SETTINGS], async () => {
      const result = await this.electron.dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Choisir le dossier racine'
      });
      return !result.canceled && result.filePaths.length > 0
        ? result.filePaths[0]
        : null;
    });

    this.ipcRouter.handle('save-settings', [SETTINGS], async (event, newConfig) => (
      this.saveSettings(newConfig)
    ));
    this.ipcRouter.handle('close-settings', [SETTINGS], async () => {
      this.windowManager.closeSettingsWindow();
      return { success: true };
    });

    this.ipcRouter.handle('check-for-updates', [UPDATE], async () => (
      this.updaterService.check(true)
    ));
    this.ipcRouter.handle('start-update-download', [UPDATE], async () => (
      this.updaterService.startDownload()
    ));
    this.ipcRouter.handle('install-downloaded-update', [UPDATE], async () => (
      this.updaterService.install()
    ));
    this.ipcRouter.handle('close-update-window', [UPDATE], async () => (
      this.updaterService.closeWindow()
    ));
  }

  async openProjectFolder(rawInput, rawSubfolderIndex) {
    const projectInput = validateProjectInput(rawInput);
    const config = this.configStore.config;
    const subfolderIndex = validateSubfolderIndex(
      rawSubfolderIndex,
      config.sousDossiers.length
    );
    const project = await this.projectService.resolveProjectInput(projectInput);

    if (!project) {
      const error = `Projet non trouvé: ${projectInput}`;
      this.notifyError(
        'Projet introuvable',
        `Aucun projet trouvé avec le numéro: ${projectInput}`
      );
      return { success: false, error };
    }

    const subfolder = config.sousDossiers[subfolderIndex];
    const folderPath = this.projectService.buildProjectPath(
      project.projectNumber,
      subfolder.chemin
    );
    const result = await this.folderOpener.open(folderPath, config.openBehavior);
    if (!result.success) {
      this.notifyError('Ouverture impossible', result.error);
      return result;
    }

    this.rememberRecentFolder({
      projectNumber: project.projectNumber,
      digits: project.projectNumber.slice(-4),
      subfolderName: subfolder.nom || 'Dossier principal',
      subfolderPath: subfolder.chemin || '',
      folderPath
    });
    this.windowManager.hideMainWindow();
    this.windowManager.hideMacPopoverAfterOpen();
    return result;
  }

  async openRecentFolder(rawRecentId) {
    const recentId = validateRecentId(rawRecentId);
    const recent = this.configStore.config.recentFolders.find(
      item => item && item.id === recentId
    );
    if (!recent) {
      return { success: false, error: 'Dossier récent introuvable.' };
    }

    const result = await this.folderOpener.open(
      recent.folderPath,
      this.configStore.config.openBehavior
    );
    if (!result.success) {
      this.notifyError('Ouverture impossible', result.error);
      return result;
    }

    this.rememberRecentFolder(recent);
    this.windowManager.hideMainWindow();
    this.windowManager.hideMacPopoverAfterOpen();
    return result;
  }

  rememberRecentFolder(entry) {
    this.configStore.update(config => {
      config.recentFolders = rememberRecentFolder(
        config.recentFolders,
        entry,
        { platform: this.platform }
      );
    });
    this.windowManager.broadcastConfigUpdated();
  }

  notifyError(title, error) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger?.error(title, { error: message });
    const { Notification } = this.electron;
    if (Notification.isSupported()) {
      new Notification({
        title: APP_NAME,
        body: message
      }).show();
    }
  }

  showMainWindow() {
    this.windowManager?.showMainWindow();
  }

  handleActivate() {
    if (!this.initialized) {
      return;
    }
    if (this.electron.BrowserWindow.getAllWindows().length === 0) {
      this.windowManager.createMainWindow();
      this.windowManager.createTray();
      this.windowManager.createMiniWindow();
    }
    this.windowManager.showMainWindow();
  }

  async dispose() {
    if (!this.initialized) {
      return;
    }

    this.unregisterDisplayListeners();
    this.electron.globalShortcut.unregisterAll();
    this.ipcRouter.dispose();
    this.updaterService.dispose();
    this.windowManager.dispose();
    this.logger.info('Application disposed');
    await this.logger.flush();
    this.initialized = false;
  }
}

module.exports = {
  ApplicationController
};
