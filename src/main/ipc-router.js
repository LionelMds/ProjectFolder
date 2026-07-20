'use strict';

class IpcRouter {
  constructor(options) {
    this.ipcMain = options.ipcMain;
    this.registry = options.registry;
    this.logger = options.logger;
    this.notifyError = options.notifyError;
    this.channels = new Set();
  }

  handle(channel, allowedRoles, handler) {
    this.channels.add(channel);
    this.ipcMain.handle(channel, async (event, ...args) => {
      try {
        this.registry.assertAllowed(event.sender, allowedRoles, channel);
        return await handler(event, ...args);
      } catch (error) {
        this.logger.error(`IPC failure: ${channel}`, {
          error: error.message
        });

        if (typeof this.notifyError === 'function' && !/non autorisée/.test(error.message)) {
          this.notifyError(`Erreur: ${channel}`, error);
        }

        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  dispose() {
    for (const channel of this.channels) {
      this.ipcMain.removeHandler(channel);
    }
    this.channels.clear();
  }
}

module.exports = {
  IpcRouter
};
