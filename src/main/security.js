'use strict';

const { pathToFileURL } = require('url');

const WINDOW_ROLES = Object.freeze({
  MAIN: 'main',
  MINI: 'mini',
  SETTINGS: 'settings',
  UPDATE: 'update'
});

function createSecureWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false
  };
}

function hardenWindow(win, htmlPath, logger) {
  const allowedUrl = pathToFileURL(htmlPath);

  win.webContents.setWindowOpenHandler(details => {
    logger.warn('Blocked renderer window creation', {
      source: win.webContents.getURL(),
      target: details.url
    });
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isSameLocalDocument(targetUrl, allowedUrl)) {
      event.preventDefault();
      logger.warn('Blocked renderer navigation', {
        source: win.webContents.getURL(),
        target: targetUrl
      });
    }
  });

  win.webContents.on('will-attach-webview', event => {
    event.preventDefault();
    logger.warn('Blocked webview attachment', {
      source: win.webContents.getURL()
    });
  });
}

function configureSessionSecurity(electronSession) {
  electronSession.setPermissionCheckHandler(() => false);
  electronSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false);
  });
}

function isSameLocalDocument(targetUrl, allowedUrl) {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === allowedUrl.protocol
      && parsed.host === allowedUrl.host
      && decodeURIComponent(parsed.pathname) === decodeURIComponent(allowedUrl.pathname);
  } catch {
    return false;
  }
}

class WindowRoleRegistry {
  constructor(logger) {
    this.logger = logger;
    this.roles = new Map();
  }

  register(win, role) {
    const id = win.webContents.id;
    this.roles.set(id, role);

    win.webContents.once('destroyed', () => {
      this.roles.delete(id);
    });
  }

  getRole(sender) {
    if (!sender || sender.isDestroyed()) {
      return null;
    }

    return this.roles.get(sender.id) || null;
  }

  assertAllowed(sender, allowedRoles, channel) {
    const role = this.getRole(sender);
    if (!role || !allowedRoles.includes(role)) {
      this.logger.warn('Rejected IPC sender', {
        channel,
        role,
        url: sender && !sender.isDestroyed() ? sender.getURL() : null
      });
      throw new Error('Action non autorisée depuis cette fenêtre.');
    }

    return role;
  }
}

module.exports = {
  WINDOW_ROLES,
  WindowRoleRegistry,
  configureSessionSecurity,
  createSecureWebPreferences,
  hardenWindow,
  isSameLocalDocument
};
