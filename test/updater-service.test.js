'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const test = require('node:test');
const {
  UpdaterService,
  extractReleaseNoteItems,
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
    platform: 'win32'
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
    platform: 'win32'
  });
  service.configure();
  service.state.manual = true;

  updater.emit('download-progress', {
    percent: 42.5,
    bytesPerSecond: 2048,
    transferred: 4096,
    total: 8192
  });

  assert.equal(service.state.status, 'downloading');
  assert.equal(service.state.percent, 42.5);
  assert.equal(service.state.speedLabel, '2 Ko/s');
  assert.equal(windows.progress.at(-1), 0.425);
  service.dispose();
});

test('non-manual update checks never contact GitHub or open a window', async () => {
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
    platform: 'win32'
  });
  service.configure();

  const result = await service.check(false);

  assert.equal(result.skipped, true);
  assert.equal(updater.checkCalls, 0);
  assert.equal(service.state.status, 'idle');
  assert.equal(windows.shownStates.length, 0);
  service.dispose();
});

test('manual packaged update checks contact GitHub and open the update window', async () => {
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
    platform: 'win32'
  });
  service.configure();

  const result = await service.check(true);

  assert.equal(result.success, true);
  assert.equal(updater.checkCalls, 1);
  assert.equal(service.state.manual, true);
  assert.equal(windows.shownStates.length, 1);
  service.dispose();
});

test('an unsolicited updater event never opens a window', () => {
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
    platform: 'win32'
  });
  service.configure();

  updater.emit('update-available', { version: '1.5.0' });
  updater.emit('download-progress', { percent: 50, total: 100, transferred: 50 });
  updater.emit('update-downloaded', { version: '1.5.0' });

  assert.equal(windows.shownStates.length, 0);
  assert.deepEqual(windows.progress, []);
  assert.equal(updater.quitAndInstallCalls, 0);
  assert.equal(updater.autoInstallOnAppQuit, false);
  service.dispose();
});

test('manual update availability opens the update window', () => {
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
    platform: 'win32'
  });
  service.configure();
  service.state.manual = true;

  updater.emit('update-available', { version: '1.5.0' });

  assert.equal(windows.shownStates.length, 1);
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
    platform: 'win32'
  });
  service.configure();

  updater.emit('checking-for-update');
  updater.emit('error', new Error('Network unavailable'));

  assert.equal(service.state.status, 'error');
  assert.equal(windows.shownStates.length, 0);
  service.dispose();
});

test('sizes are written in French units', () => {
  assert.equal(formatBytes(1536), '2 Ko');
  assert.equal(formatBytes(31142707), '29,7 Mo');
  assert.equal(formatBytes(0), '0 o');
});

test('release notes become a list of changes without the installation section', () => {
  const notes = normalizeReleaseNotes(
    '<h2>Améliorations</h2><ul><li>Ouverture <b>plus rapide</b></li><li>Recherche &amp; cache</li></ul>'
    + '<h2>Installation</h2><ul><li>Windows x64 : <code>Setup.exe</code></li></ul>'
  );

  assert.deepEqual(extractReleaseNoteItems(notes), ['Ouverture plus rapide', 'Recherche & cache']);
  assert.deepEqual(extractReleaseNoteItems('Corrections de stabilité'), ['Corrections de stabilité']);
});

test('release notes are converted to plain text', () => {
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
    this.quitAndInstallCalls = 0;
  }

  async checkForUpdates() {
    this.checkCalls += 1;
  }

  async downloadUpdate() {
    return [];
  }

  quitAndInstall() {
    this.quitAndInstallCalls += 1;
  }
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
