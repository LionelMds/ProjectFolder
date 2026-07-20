'use strict';

const electron = require('electron');
const { autoUpdater } = require('electron-updater');
const { ApplicationController } = require('./src/main/application');

const { app } = electron;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let controller = null;

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    controller?.showMainWindow();
  });

  app.whenReady()
    .then(() => {
      controller = new ApplicationController(electron, autoUpdater, {
        appRoot: __dirname
      });
      controller.initialize();

      if (process.env.PFL_SMOKE_TEST === '1') {
        setTimeout(() => app.quit(), 1500);
      }
    })
    .catch(error => {
      console.error('Application startup failed:', error);
      app.quit();
    });

  app.on('activate', () => {
    controller?.handleActivate();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    controller?.windowManager?.prepareForQuit();
  });

  app.on('will-quit', () => {
    if (!controller) {
      return;
    }

    const activeController = controller;
    controller = null;
    activeController.dispose().catch(error => {
      console.error('Application shutdown failed:', error);
    });
  });

  app.on('window-all-closed', () => {
    controller?.logger?.info('All windows closed, app kept alive in tray');
  });

  process.on('uncaughtException', error => {
    if (controller) {
      controller.notifyError('Erreur non interceptée', error);
    } else {
      console.error('Uncaught exception:', error);
    }
  });

  process.on('unhandledRejection', reason => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (controller) {
      controller.notifyError('Promesse rejetée', error);
    } else {
      console.error('Unhandled rejection:', error);
    }
  });
}
