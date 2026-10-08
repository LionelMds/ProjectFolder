'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const test = require('node:test');
const { createDefaultConfig, migrateConfig } = require('../src/main/config-store');
const { WindowRoleRegistry } = require('../src/main/security');
const { WindowManager } = require('../src/main/window-manager');

// Two 2048x1152 displays (2560x1440 at 125 %) with a 48 px taskbar.
const displays = [
  {
    id: 1,
    bounds: { x: 0, y: 0, width: 2048, height: 1152 },
    workArea: { x: 0, y: 0, width: 2048, height: 1104 }
  },
  {
    id: 2,
    bounds: { x: 2048, y: 0, width: 2048, height: 1152 },
    workArea: { x: 2048, y: 0, width: 2048, height: 1104 }
  }
];

const screen = {
  getPrimaryDisplay: () => displays[0],
  getAllDisplays: () => displays,
  getDisplayNearestPoint: point => (point.x >= 2048 ? displays[1] : displays[0]),
  getCursorScreenPoint: () => ({ x: 100, y: 100 })
};

let nextWebContentsId = 1;

class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
    this.destroyed = false;
    this.visible = options.show !== false;
    this.webContents = Object.assign(new EventEmitter(), {
      id: nextWebContentsId++,
      setWindowOpenHandler() {},
      getURL: () => 'file:///mini-search.html',
      isLoading: () => false,
      send() {}
    });
  }

  loadFile() {
    return Promise.resolve();
  }

  getBounds() {
    return { ...this.bounds };
  }

  setBounds(bounds) {
    this.bounds = { ...this.bounds, ...bounds };
  }

  // Simulates the user dropping the bar after dragging it.
  dragTo(x, y) {
    this.bounds = { ...this.bounds, x, y };
    this.emit('moved');
  }

  getPosition() {
    return [this.bounds.x, this.bounds.y];
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  destroy() {
    this.destroyed = true;
    this.webContents.emit('destroyed');
    this.emit('closed');
  }

  setAlwaysOnTop() {}
  moveTop() {}
  show() { this.visible = true; }
  hide() { this.visible = false; }
  focus() {}
}

function createManager(miniBar, integrationMode = 'floating') {
  const logger = { info() {}, warn() {}, error() {} };
  const configStore = {
    config: migrateConfig({ ...createDefaultConfig(), integrationMode, miniBar }, 'win32'),
    update(mutator) {
      const draft = JSON.parse(JSON.stringify(this.config));
      mutator(draft);
      this.config = migrateConfig(draft, 'win32');
    }
  };
  const manager = new WindowManager({
    app: { isQuitting: false, getVersion: () => '1.4.6' },
    BrowserWindow: FakeWindow,
    screen,
    configStore,
    registry: new WindowRoleRegistry(logger),
    logger,
    appRoot: __dirname,
    platform: 'win32'
  });
  return { manager, configStore };
}

// The bar (window y + 8) sits inside the 48 px taskbar of the second display.
const onSecondTaskbar = { x: 2111, y: 1100 };

function barLayout(barWidth, panel = null) {
  return {
    barWidth,
    barHeight: 40,
    collapsedWidth: 160,
    panelWidth: panel ? panel.width : 0,
    panelHeight: panel ? panel.height : 0
  };
}

test('a floating bar left on the taskbar does not jump when its buttons appear', t => {
  const { manager } = createManager({ position: onSecondTaskbar });
  t.after(() => manager.dispose());
  const win = manager.createMiniWindow();

  assert.deepEqual(win.getPosition(), [2111, 1100]);
  manager.setMiniLayout(barLayout(372));
  assert.deepEqual(win.getBounds(), { x: 2111, y: 1100, width: 388, height: 56 });
  manager.setMiniLayout(barLayout(160));
  assert.deepEqual(win.getBounds(), { x: 2111, y: 1100, width: 176, height: 56 });
});

test('on the taskbar the drop-down pane opens above the bar, which stays put', t => {
  const { manager } = createManager({ position: onSecondTaskbar });
  t.after(() => manager.dispose());
  const win = manager.createMiniWindow();

  const result = manager.setMiniLayout(barLayout(300, { width: 480, height: 200 }));
  assert.equal(result.direction, 'up');
  const bounds = win.getBounds();
  assert.deepEqual(bounds, { x: 2111, y: 1100 + 56 - 262, width: 496, height: 262 });
  assert.equal(bounds.y + bounds.height, 1100 + 56);

  manager.setMiniLayout(barLayout(160));
  assert.deepEqual(win.getPosition(), [2111, 1100]);
});

test('the bar expands from wherever the user dropped it, even with its pane open', t => {
  const { manager, configStore } = createManager({ position: onSecondTaskbar });
  t.after(() => manager.dispose());
  const win = manager.createMiniWindow();

  win.dragTo(2600, 1100);
  manager.setMiniLayout(barLayout(372));
  assert.deepEqual(win.getPosition(), [2600, 1100]);
  assert.deepEqual(configStore.config.miniBar.position, { x: 2600, y: 1100 });

  // Dragged while the pane is open above the bar: the bar's own position counts.
  manager.setMiniLayout(barLayout(300, { width: 480, height: 200 }));
  win.dragTo(2700, 800);
  assert.deepEqual(configStore.config.miniBar.position, { x: 2700, y: 800 + 206 });
});

test('pinning and unpinning keep the bar where the user placed it', t => {
  const { manager, configStore } = createManager({
    position: null,
    dockedUseCustomPosition: true,
    dockedPosition: { x: 2228, y: 1080 }
  });
  t.after(() => manager.dispose());
  manager.createMiniWindow().dragTo(3000, 1100);

  manager.toggleMiniPin();
  assert.equal(configStore.config.integrationMode, 'docked');
  assert.deepEqual(manager.miniWindow.getPosition(), [3000, 1100]);
  assert.deepEqual(configStore.config.miniBar.dockedPosition, { x: 3000, y: 1100 });

  manager.setMiniLayout(barLayout(372));
  assert.deepEqual(manager.miniWindow.getPosition(), [3000, 1100]);

  manager.toggleMiniPin();
  assert.equal(configStore.config.integrationMode, 'floating');
  assert.deepEqual(manager.miniWindow.getPosition(), [3000, 1100]);
});

test('the tray menu starts with the three latest folders', t => {
  const { manager, configStore } = createManager({ position: null });
  t.after(() => manager.dispose());
  configStore.config.recentFolders = ['2026-4889', '2025-0042', '2026-5245', '2024-4810'].map((projectNumber, index) => ({
    id: `00000000000000${index}a`,
    projectNumber,
    subfolderName: '',
    subfolderPath: '',
    folderPath: `C:/${projectNumber}`,
    openedAt: 1000 - index
  }));
  const opened = [];
  manager.setActions({ openRecentFolder: id => opened.push(id) });
  manager.Menu = { buildFromTemplate: template => template };

  const menu = manager.buildTrayMenu();
  assert.deepEqual(menu.slice(0, 4).map(item => item.label), ['Récents · 3', '2026-4889', '2025-0042', '2026-5245']);
  const search = menu.find(item => item.label === 'Ouvrir la recherche');
  assert.equal(search.accelerator, 'CommandOrControl+Shift+P');
  assert.equal(search.registerAccelerator, false);
  menu[1].click();
  assert.deepEqual(opened, ['000000000000000a']);
});
