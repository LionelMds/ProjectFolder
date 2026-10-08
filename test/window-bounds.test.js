'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateMiniBounds,
  detectReservedScreenEdge,
  fitWindowToWorkArea,
  layoutMiniBounds
} = require('../src/main/window-bounds');

const primaryDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
};

// The mini window is the 40 px bar plus an 8 px transparent margin.
const WINDOW_HEIGHT = 56;
const MARGIN = 8;

test('the reserved Windows edge is detected from work area metrics', () => {
  assert.deepEqual(
    detectReservedScreenEdge(primaryDisplay),
    { edge: 'bottom', thickness: 40 }
  );
});

test('floating positions are clamped onto the nearest display', () => {
  const bounds = calculateMiniBounds({
    requestedWidth: 260,
    integrationMode: 'floating',
    miniBar: { position: { x: 9000, y: 9000 } },
    primaryDisplay,
    displayNearestPoint: () => primaryDisplay,
    platform: 'win32'
  });

  // Only the transparent margin may leave the display.
  assert.equal(bounds.x, 1920 - 260 + MARGIN);
  assert.equal(bounds.y, 1080 - WINDOW_HEIGHT + MARGIN);
});

test('a floating bar saved on the taskbar is restored on the taskbar', () => {
  const bounds = calculateMiniBounds({
    requestedWidth: 260,
    integrationMode: 'floating',
    miniBar: { position: { x: 800, y: 1030 } },
    primaryDisplay,
    displayNearestPoint: () => primaryDisplay,
    platform: 'win32'
  });

  assert.deepEqual(bounds, { x: 800, y: 1030, width: 260, height: WINDOW_HEIGHT });
});

test('without a saved position the floating bar starts above the taskbar', () => {
  const bounds = calculateMiniBounds({
    requestedWidth: 260,
    integrationMode: 'floating',
    miniBar: { position: null },
    primaryDisplay,
    displayNearestPoint: () => primaryDisplay,
    platform: 'win32'
  });

  assert.ok(bounds.y + bounds.height <= primaryDisplay.workArea.height);
});

test('custom docked positions are preserved on a secondary display', () => {
  const secondary = {
    bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    workArea: { x: 1920, y: 0, width: 2560, height: 1400 }
  };
  const bounds = calculateMiniBounds({
    requestedWidth: 300,
    integrationMode: 'docked',
    miniBar: {
      dockedUseCustomPosition: true,
      dockedPosition: { x: 3000, y: 1200 }
    },
    primaryDisplay,
    displayNearestPoint: () => secondary,
    platform: 'win32'
  });

  assert.deepEqual(bounds, { x: 3000, y: 1200, width: 300, height: WINDOW_HEIGHT });
});

test('on the taskbar near the right edge the panel opens upwards and leftwards', () => {
  const base = { x: 1920 - 176, y: 1080 - WINDOW_HEIGHT };
  const size = { width: 496, height: WINDOW_HEIGHT + 6 + 200, collapsedWidth: 176, collapsedHeight: WINDOW_HEIGHT };
  const opened = layoutMiniBounds(base, size, primaryDisplay.bounds);

  assert.deepEqual(opened.bounds, { x: 1920 - 496, y: base.y - 206, width: 496, height: 262 });
  assert.equal(opened.direction, 'up');
  assert.equal(opened.align, 'right');
  // The bar keeps its place: same bottom-right corner as the collapsed window.
  assert.equal(opened.bounds.x + opened.bounds.width, base.x + 176);
  assert.equal(opened.bounds.y + opened.bounds.height, base.y + WINDOW_HEIGHT);

  const collapsed = layoutMiniBounds(base, { width: 176, height: WINDOW_HEIGHT }, primaryDisplay.bounds);
  assert.deepEqual(collapsed.bounds, { ...base, width: 176, height: WINDOW_HEIGHT });
  assert.equal(collapsed.direction, 'down');
});

test('with room around it the panel opens below and to the right', () => {
  const opened = layoutMiniBounds(
    { x: 830, y: 300 },
    { width: 496, height: 262, collapsedWidth: 176, collapsedHeight: WINDOW_HEIGHT },
    primaryDisplay.bounds
  );

  assert.deepEqual(opened.bounds, { x: 830, y: 300, width: 496, height: 262 });
  assert.equal(opened.direction, 'down');
  assert.equal(opened.align, 'left');
});

test('the bar itself never leaves the display', () => {
  const { bounds } = layoutMiniBounds(
    { x: -40, y: 500 },
    { width: 656, height: WINDOW_HEIGHT },
    primaryDisplay.workArea
  );

  assert.equal(bounds.x, -MARGIN);
  assert.equal(bounds.width, 656);
});

test('large dialogs fit inside small work areas', () => {
  const bounds = fitWindowToWorkArea(
    { width: 680, height: 760 },
    { x: 0, y: 0, width: 640, height: 600 },
    { margin: 12, minWidth: 480, minHeight: 440 }
  );

  assert.deepEqual(bounds, { x: 12, y: 12, width: 616, height: 576 });
});
