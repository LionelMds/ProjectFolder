'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const test = require('node:test');
const {
  UpdaterService,
  formatBytes,
  normalizeReleaseNotes
} = require('../src/main/updater-service');

test('manual update checks explain development mode without contacting GitHub', async () => {
  const updater = new MockUpdater();
  const windows = createWindowManagerMock();
  const service = new UpdaterService({
    autoUpdater: updater,
    app: {
      getVersion: () => '1.4.0',
      isPackaged: false,
      isQuitting: false
    },
    logger: createLoggerMock(),
    windowManager: windows,
    platform: 'win32',
    notifyAvailable: () => {}
  });
  service.configure();

  const result = await service.check(true);

  assert.equal(result.devMode, true);
  assert.equal(updater.checkCalls, 0);
  assert.equal(service.state.status, 'not-available');
  assert.equal(windows.shownStates.length, 1);
  service.dispose();
});

test('download progress updates both the dialog and system progress', () => {
  const updater = new MockUpdater();
  const windows = createWindowManagerMock();
  const service = new UpdaterService({
    autoUpdater: updater,
    app: {
      getVersion: () => '1.4.0',
      isPackaged: true,
      isQuitting: false
    },
    logger: createLoggerMock(),
    windowManager: windows,
    platform: 'win32',
    notifyAvailable: () => {}
  });
  service.configure();

  updater.emit('download-progress', {
    percent: 42.5,
    bytesPerSecond: 2048,
    transferred: 4096,
    total: 8192
  });

  assert.equal(service.state.status, 'downloading');
  assert.equal(service.state.percent, 42.5);
  assert.equal(service.state.speedLabel, '2.0 KB/s');
  assert.equal(windows.progress.at(-1), 0.425);
  service.dispose();
});

test('background update availability notifies once without opening a window', () => {
  const updater = new MockUpdater();
  const windows = createWindowManagerMock();
  const notifications = [];
  let notifiedVersion = null;
  const service = new UpdaterService({
    autoUpdater: updater,
    app: {
      getVersion: () => '1.4.0',
      isPackaged: true,
      isQuitting: false
    },
    logger: createLoggerMock(),
    windowManager: windows,
    platform: 'win32',
    notifyAvailable: info => notifications.push(info.version),
    shouldNotifyVersion: version => notifiedVersion !== version,
    markVersionNotified: version => {
      notifiedVersion = version;
    }
  });
  service.configure();

  updater.emit('update-available', { version: '1.5.0' });
  updater.emit('update-available', { version: '1.5.0' });

  assert.deepEqual(notifications, ['1.5.0']);
  assert.equal(notifiedVersion, '1.5.0');
  assert.equal(windows.shownStates.length, 0);
  assert.equal(windows.trayUpdates, 2);
  service.dispose();
});

test('manual update availability opens the window without a native notification', () => {
  const updater = new MockUpdater();
  const windows = createWindowManagerMock();
  const notifications = [];
  const service = new UpdaterService({
    autoUpdater: updater,
    app: {
      getVersion: () => '1.4.0',
      isPackaged: true,
      isQuitting: false
    },
    logger: createLoggerMock(),
    windowManager: windows,
    platform: 'win32',
    notifyAvailable: info => notifications.push(info.version)
  });
  service.configure();
  service.state.manual = true;

  updater.emit('update-available', { version: '1.5.0' });

  assert.equal(windows.shownStates.length, 1);
  assert.deepEqual(notifications, []);
  service.dispose();
});

test('background update errors stay silent', () => {
  const updater = new MockUpdater();
  const windows = createWindowManagerMock();
  const service = new UpdaterService({
    autoUpdater: updater,
    app: {
      getVersion: () => '1.4.0',
      isPackaged: true,
      isQuitting: false
    },
    logger: createLoggerMock(),
    windowManager: windows,
    platform: 'win32',
    notifyAvailable: () => {}
  });
  service.configure();

  updater.emit('checking-for-update');
  updater.emit('error', new Error('Network unavailable'));

  assert.equal(service.state.status, 'error');
  assert.equal(windows.shownStates.length, 0);
  service.dispose();
});

test('release notes are converted to plain text', () => {
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(
    normalizeReleaseNotes('<b>Correction</b> importante'),
    'Correction importante'
  );
  assert.equal(
    normalizeReleaseNotes([{ version: '1.4.0', note: 'Stable' }]),
    'Stable'
  );
});

class MockUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCalls = 0;
  }

  async checkForUpdates() {
    this.checkCalls += 1;
  }

  async downloadUpdate() {
    return [];
  }

  quitAndInstall() {}
}

function createLoggerMock() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    createUpdaterLogger: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    })
  };
}

function createWindowManagerMock() {
  return {
    shownStates: [],
    broadcasts: [],
    progress: [],
    trayUpdates: 0,
    showUpdateWindow(state) {
      this.shownStates.push(state);
    },
    broadcastUpdateState(state) {
      this.broadcasts.push(state);
    },
    setProgressBar(value) {
      this.progress.push(value);
    },
    prepareForQuit() {},
    closeUpdateWindow() {},
    updateTrayMenu() {
      this.trayUpdates += 1;
    }
  };
}
