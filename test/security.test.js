'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  WINDOW_ROLES,
  WindowRoleRegistry,
  createSecureWebPreferences
} = require('../src/main/security');

test('renderer preferences keep Node disabled and the sandbox enabled', () => {
  assert.deepEqual(
    createSecureWebPreferences('C:\\app\\preload.js'),
    {
      preload: 'C:\\app\\preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  );
});

test('IPC roles reject actions from the wrong renderer', () => {
  const registry = new WindowRoleRegistry({
    warn: () => {}
  });
  const listeners = {};
  const win = {
    webContents: {
      id: 12,
      once: (name, callback) => {
        listeners[name] = callback;
      }
    }
  };
  const sender = {
    id: 12,
    isDestroyed: () => false,
    getURL: () => 'file:///settings.html'
  };

  registry.register(win, WINDOW_ROLES.SETTINGS);
  assert.equal(
    registry.assertAllowed(sender, [WINDOW_ROLES.SETTINGS], 'save-settings'),
    WINDOW_ROLES.SETTINGS
  );
  assert.throws(
    () => registry.assertAllowed(sender, [WINDOW_ROLES.UPDATE], 'install-downloaded-update'),
    /non autorisée/
  );

  listeners.destroyed();
  assert.equal(registry.getRole(sender), null);
});
