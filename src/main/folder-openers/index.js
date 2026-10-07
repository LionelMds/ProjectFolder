'use strict';

const fs = require('fs');
const {
  isMac,
  isWindows,
  supportsWindowsExplorerTabs
} = require('../platform');
const {
  createExplorerWorker,
  navigateWindowsExplorerWithCom
} = require('./windows-explorer');
const {
  openFolderInFinderWindow,
  openFolderInFinderTab,
  reuseFinderWindow
} = require('./macos-finder');

class FolderOpener {
  constructor(options) {
    this.shell = options.shell;
    this.screen = options.screen;
    this.logger = options.logger;
    this.platform = options.platform || process.platform;
    this.osRelease = options.osRelease;
    this.createExplorerWorker = options.createExplorerWorker
      || (() => createExplorerWorker({ logger: this.logger }));
    this.explorerWorker = null;
  }

  // Starts the Explorer automation process ahead of time, typically when the
  // search UI appears, so the first opening does not pay its startup cost.
  prepare() {
    if (!isWindows(this.platform)) {
      return;
    }

    try {
      this.getExplorerWorker().start();
    } catch (error) {
      this.logger.warn('Explorer worker warm-up failed', { error: error.message });
    }
  }

  getExplorerWorker() {
    if (!this.explorerWorker) {
      this.explorerWorker = this.createExplorerWorker();
    }
    return this.explorerWorker;
  }

  dispose() {
    this.explorerWorker?.stop();
  }

  async open(folderPath, behavior) {
    if (!(await isDirectory(folderPath))) {
      return {
        success: false,
        error: `Le dossier n'existe pas:\n${folderPath}`
      };
    }

    try {
      const route = await this.openWithBehavior(folderPath, behavior);
      this.logger.info('Folder opened', { behavior, route });
      return { success: true, route };
    } catch (error) {
      this.logger.warn('Configured open behavior failed, trying fallback', {
        behavior,
        error: error.message
      });

      try {
        const route = await this.openInNewWindow(folderPath);
        return { success: true, route };
      } catch (fallbackError) {
        return {
          success: false,
          error: fallbackError.message
        };
      }
    }
  }

  async openWithBehavior(folderPath, behavior) {
    if (behavior === 'newTab') {
      return this.openInNewTab(folderPath);
    }

    if (behavior === 'reuseWindow') {
      return this.reuseWindow(folderPath);
    }

    return this.openInNewWindow(folderPath);
  }

  async openInNewWindow(folderPath) {
    try {
      if (isWindows(this.platform)) {
        return await navigateWindowsExplorerWithCom(folderPath, 'newWindow', this.getExplorerWorker());
      }
      if (isMac(this.platform)) {
        return await openFolderInFinderWindow(folderPath, this.getWorkAreas());
      }
    } catch (error) {
      this.logger.warn('Native folder window failed, using system default size', {
        error: error.message
      });
    }

    const errorMessage = await this.shell.openPath(folderPath);
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return 'opened:new-window:shell';
  }

  async openInNewTab(folderPath) {
    if (isWindows(this.platform)) {
      if (!supportsWindowsExplorerTabs(this.platform, this.osRelease)) {
        return this.openInNewWindow(folderPath);
      }

      return navigateWindowsExplorerWithCom(folderPath, 'newTab', this.getExplorerWorker());
    }

    if (isMac(this.platform)) {
      return openFolderInFinderTab(folderPath, this.getWorkAreas());
    }

    return this.openInNewWindow(folderPath);
  }

  async reuseWindow(folderPath) {
    if (isWindows(this.platform)) {
      return navigateWindowsExplorerWithCom(folderPath, 'reuseWindow', this.getExplorerWorker());
    }

    if (isMac(this.platform)) {
      return reuseFinderWindow(folderPath, this.getWorkAreas());
    }

    return this.openInNewWindow(folderPath);
  }

  getWorkAreas() {
    if (!this.screen) {
      return [];
    }
    const current = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint());
    return [
      current.workArea,
      ...this.screen.getAllDisplays()
        .filter(display => display.id !== current.id)
        .map(display => display.workArea)
    ];
  }
}

async function isDirectory(targetPath) {
  try {
    return (await fs.promises.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

module.exports = {
  FolderOpener,
  isDirectory
};
