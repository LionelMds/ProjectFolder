'use strict';

const fs = require('fs');
const {
  isMac,
  isWindows,
  supportsWindowsExplorerTabs
} = require('../platform');
const {
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
        return await navigateWindowsExplorerWithCom(folderPath, 'newWindow');
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

      return navigateWindowsExplorerWithCom(folderPath, 'newTab');
    }

    if (isMac(this.platform)) {
      return openFolderInFinderTab(folderPath, this.getWorkAreas());
    }

    return this.openInNewWindow(folderPath);
  }

  async reuseWindow(folderPath) {
    if (isWindows(this.platform)) {
      return navigateWindowsExplorerWithCom(folderPath, 'reuseWindow');
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
