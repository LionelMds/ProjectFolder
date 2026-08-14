'use strict';

const { isMac, isWindows } = require('./platform');

class UpdaterService {
  constructor(options) {
    this.autoUpdater = options.autoUpdater;
    this.app = options.app;
    this.logger = options.logger;
    this.windowManager = options.windowManager;
    this.platform = options.platform || process.platform;
    this.pendingUpdateInfo = null;
    this.downloadPromise = null;
    this.installationRequested = false;
    this.handlers = new Map();
    this.lastLoggedStatus = null;
    this.lastLoggedProgressBucket = -1;
    this.state = {
      status: 'idle',
      message: 'Prêt',
      currentVersion: this.app.getVersion(),
      availableVersion: null,
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      releaseNotes: '',
      error: null,
      manual: false
    };
  }

  get supported() {
    return isWindows(this.platform) || isMac(this.platform);
  }

  configure() {
    if (!this.supported) {
      this.logger.info('Auto-updater disabled for platform', { platform: this.platform });
      return;
    }

    this.autoUpdater.logger = this.logger.createUpdaterLogger();
    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = false;
    this.autoUpdater.autoRunAppAfterInstall = true;
    this.autoUpdater.allowPrerelease = false;
    this.autoUpdater.allowDowngrade = false;
    this.autoUpdater.disableWebInstaller = true;
    this.autoUpdater.disableDifferentialDownload = true;

    this.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        message: 'Recherche de mise à jour...',
        error: null,
        percent: 0
      });
    });

    this.on('update-available', info => {
      this.pendingUpdateInfo = info;
      this.setState({
        status: 'available',
        message: `Version ${info.version} disponible`,
        availableVersion: info.version,
        releaseDate: info.releaseDate || null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        error: null,
        percent: 0
      });
      this.windowManager.updateTrayMenu();

      if (this.state.manual) {
        this.windowManager.showUpdateWindow(this.state);
      }
    });

    this.on('update-not-available', () => {
      this.setState({
        status: 'not-available',
        message: 'Le logiciel est à jour.',
        availableVersion: null,
        percent: 0,
        error: null
      });

      if (this.state.manual) {
        this.windowManager.showUpdateWindow(this.state);
      }
      this.windowManager.updateTrayMenu();
    });

    this.on('download-progress', progress => {
      if (!this.state.manual) {
        this.logger.warn('Unsolicited updater download progress ignored');
        return;
      }
      const percent = Math.max(0, Math.min(Number(progress.percent) || 0, 100));
      this.windowManager.setProgressBar(percent / 100);
      this.setState({
        status: 'downloading',
        message: `Téléchargement ${percent.toFixed(0)} %`,
        percent,
        bytesPerSecond: Number(progress.bytesPerSecond) || 0,
        transferred: Number(progress.transferred) || 0,
        total: Number(progress.total) || 0,
        speedLabel: `${formatBytes(Number(progress.bytesPerSecond) || 0)}/s`,
        progressLabel: `${formatBytes(Number(progress.transferred) || 0)} / ${formatBytes(Number(progress.total) || 0)}`
      });
    });

    this.on('update-downloaded', info => {
      if (!this.state.manual) {
        this.logger.warn('Unsolicited downloaded update ignored');
        return;
      }
      this.downloadPromise = null;
      this.windowManager.setProgressBar(-1);
      this.setState({
        status: 'ready',
        message: 'Mise à jour téléchargée. Installation...',
        availableVersion: info.version || this.state.availableVersion,
        percent: 100,
        error: null
      });
      this.windowManager.showUpdateWindow(this.state);
      setTimeout(() => this.install(), 900);
    });

    this.on('error', error => {
      const shouldShowError = this.state.manual
        || this.state.status === 'downloading'
        || this.installationRequested;
      this.downloadPromise = null;
      this.installationRequested = false;
      this.app.isQuitting = false;
      this.windowManager.setProgressBar(-1);
      this.setState({
        status: 'error',
        message: 'La mise à jour a échoué.',
        error: error.message || String(error)
      });
      if (shouldShowError) {
        this.windowManager.showUpdateWindow(this.state);
      }
      this.windowManager.updateTrayMenu();
      this.logger.error('Updater error', { error: error.message || String(error) });
    });

    this.on('before-quit-for-update', () => {
      this.prepareInstallationShutdown();
    });
  }

  on(eventName, handler) {
    this.handlers.set(eventName, handler);
    this.autoUpdater.on(eventName, handler);
  }

  setState(partial) {
    this.state = {
      ...this.state,
      ...partial
    };

    const progressBucket = Math.floor((Number(this.state.percent) || 0) / 10);
    const shouldLog = this.state.status !== this.lastLoggedStatus
      || (this.state.status === 'downloading' && progressBucket !== this.lastLoggedProgressBucket);

    if (shouldLog) {
      this.logger.info('Updater state changed', {
        status: this.state.status,
        percent: Math.round(Number(this.state.percent) || 0),
        availableVersion: this.state.availableVersion
      });
      this.lastLoggedStatus = this.state.status;
      this.lastLoggedProgressBucket = progressBucket;
    }

    this.windowManager.broadcastUpdateState(this.state);
  }

  async check(manual = false) {
    if (!manual) {
      this.logger.info('Automatic update check skipped; manual action required');
      return { success: true, skipped: true };
    }

    this.setState({ manual: true });

    if (!this.supported) {
      this.setState({
        status: 'not-available',
        message: 'Les mises à jour automatiques ne sont pas disponibles sur cette plateforme.',
        error: null,
        percent: 0
      });
      if (manual) {
        this.windowManager.showUpdateWindow(this.state);
      }
      return { success: true, disabled: true };
    }

    if (!this.app.isPackaged) {
      this.setState({
        status: 'not-available',
        message: 'Les mises à jour automatiques se testent sur une version installée.',
        error: null,
        percent: 0
      });
      if (manual) {
        this.windowManager.showUpdateWindow(this.state);
      }
      return { success: true, devMode: true };
    }

    if (['checking', 'downloading'].includes(this.state.status)) {
      if (manual) {
        this.windowManager.showUpdateWindow(this.state);
      }
      return { success: true, status: this.state.status };
    }

    if (manual) {
      this.windowManager.showUpdateWindow(this.state);
    }

    await this.autoUpdater.checkForUpdates();
    return { success: true };
  }

  async openUpdateCenter() {
    this.setState({ manual: true });
    if (['available', 'downloading', 'ready', 'installing'].includes(this.state.status)) {
      this.windowManager.showUpdateWindow(this.state);
      return { success: true, status: this.state.status };
    }

    return this.check(true);
  }

  async startDownload() {
    this.setState({ manual: true });
    if (!this.supported) {
      await this.check(true);
      return { success: true, disabled: true };
    }

    if (this.state.status === 'ready') {
      this.install();
      return { success: true };
    }

    if (this.state.status === 'downloading' && this.downloadPromise) {
      this.windowManager.showUpdateWindow(this.state);
      return { success: true, status: 'downloading' };
    }

    if (!this.pendingUpdateInfo && this.state.status !== 'available') {
      return this.check(true);
    }

    this.windowManager.showUpdateWindow(this.state);
    this.setState({
      status: 'downloading',
      message: 'Préparation du téléchargement...',
      percent: 0,
      error: null
    });

    this.downloadPromise = this.autoUpdater.downloadUpdate()
      .then(files => {
        this.logger.info('Updater download completed', { fileCount: Array.isArray(files) ? files.length : 0 });
        return files;
      })
      .catch(error => {
        this.downloadPromise = null;
        this.windowManager.setProgressBar(-1);
        this.setState({
          status: 'error',
          message: 'La mise à jour a échoué.',
          error: error.message || String(error)
        });
        this.windowManager.showUpdateWindow(this.state);
        throw error;
      });

    await this.downloadPromise;
    return { success: true };
  }

  install() {
    if (this.installationRequested) {
      return { success: true, alreadyRequested: true };
    }

    if (!this.supported || !this.app.isPackaged) {
      this.setState({
        status: 'error',
        message: 'Installation automatique indisponible sur ce build.',
        error: null
      });
      return { success: false, error: this.state.message };
    }

    this.prepareInstallationShutdown();
    this.setState({
      status: 'installing',
      message: "Fermeture et lancement de l'installateur...",
      percent: 100,
      error: null
    });
    this.windowManager.setProgressBar(-1);

    setTimeout(() => {
      try {
        if (isWindows(this.platform)) {
          this.autoUpdater.quitAndInstall(true, true);
        } else {
          this.autoUpdater.quitAndInstall();
        }
      } catch (error) {
        this.installationRequested = false;
        this.app.isQuitting = false;
        this.setState({
          status: 'error',
          message: "Impossible de lancer l'installation.",
          error: error.message || String(error)
        });
        this.windowManager.showUpdateWindow(this.state);
        this.logger.error('Updater install launch failed', { error: error.message || String(error) });
      }
    }, 700);

    return { success: true };
  }

  prepareInstallationShutdown() {
    this.installationRequested = true;
    this.app.isQuitting = true;
    this.windowManager.prepareForQuit();
    this.logger.info('Updater installation shutdown prepared');
  }

  closeWindow() {
    if (this.state.status !== 'installing' && this.state.status !== 'downloading') {
      this.windowManager.closeUpdateWindow();
      this.setState({ manual: false });
    }
    return { success: true };
  }

  dispose() {
    for (const [eventName, handler] of this.handlers) {
      this.autoUpdater.removeListener(eventName, handler);
    }
    this.handlers.clear();
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

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

module.exports = {
  UpdaterService,
  formatBytes,
  normalizeReleaseNotes
};
