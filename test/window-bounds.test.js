'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateMiniBounds,
  detectReservedScreenEdge,
  fitWindowToWorkArea
} = require('../src/main/window-bounds');

const primaryDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
};

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

  assert.equal(bounds.x, 1652);
  assert.equal(bounds.y, 988);
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

  assert.deepEqual(bounds, { x: 3000, y: 1200, width: 300, height: 44 });
});

test('large dialogs fit inside small work areas', () => {
  const bounds = fitWindowToWorkArea(
    { width: 680, height: 760 },
    { x: 0, y: 0, width: 640, height: 600 },
    { margin: 12, minWidth: 480, minHeight: 440 }
  );

  assert.deepEqual(bounds, { x: 12, y: 12, width: 616, height: 576 });
});
