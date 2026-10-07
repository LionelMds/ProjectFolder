'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ApplicationController } = require('../src/main/application');

function createController(currentShortcut) {
  const registered = new Set([currentShortcut]);
  const globalShortcut = {
    register(accelerator) {
      if (accelerator === 'CommandOrControl+Shift++') {
        throw new TypeError('conversion failure');
      }
      if (accelerator === 'CommandOrControl+Alt+T') {
        return false;
      }
      registered.add(accelerator);
      return true;
    },
    unregister(accelerator) {
      registered.delete(accelerator);
    }
  };
  const controller = new ApplicationController({ globalShortcut }, null, { platform: 'win32' });
  controller.configStore = { config: { raccourciGlobal: currentShortcut } };
  controller.logger = { info() {}, warn() {}, error() {} };
  controller.windowManager = {
    formatShortcutLabel: shortcut => shortcut.replace('CommandOrControl', 'Ctrl'),
    toggleMainWindow() {}
  };
  return { controller, registered };
}

test('an unparsable global shortcut is reported as invalid, not as taken', () => {
  const { controller, registered } = createController('CommandOrControl+Shift+P');

  assert.throws(
    () => controller.transitionGlobalShortcut('CommandOrControl+Shift++'),
    /Ctrl\+Shift\+\+ n'est pas valide/
  );
  assert.deepEqual([...registered], ['CommandOrControl+Shift+P']);
});

test('a global shortcut owned by another application keeps the previous one', () => {
  const { controller, registered } = createController('CommandOrControl+Shift+P');

  assert.throws(
    () => controller.transitionGlobalShortcut('CommandOrControl+Alt+T'),
    /déjà utilisé par une autre application/
  );
  assert.deepEqual([...registered], ['CommandOrControl+Shift+P']);
});
