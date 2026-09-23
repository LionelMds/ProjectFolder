'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');
const { buildFinderNavigationScript } = require('../src/main/folder-openers/macos-finder');

test('Finder sizing only applies to newly created windows', () => {
  for (const mode of ['newWindow', 'newTab', 'reuseWindow']) {
    const script = buildFinderNavigationScript('/Users/Test', mode, [
      { x: 0, y: 25, width: 1440, height: 835 }
    ]);
    assert.match(script, /if isNewWindow then my fitFinderWindow\(targetWindow\)/);
    assert.equal(script.match(/my fitFinderWindow/g).length, 1);
  }
});

test('Finder scripts compile for each opening mode with multiple displays', {
  skip: process.platform !== 'darwin'
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pfl-finder-script-'));
  try {
    for (const mode of ['newWindow', 'newTab', 'reuseWindow']) {
      const script = buildFinderNavigationScript('/Users/Test/Plans "A"', mode, [
        { x: 0, y: 25, width: 1440, height: 835 },
        { x: -1920, y: -1080, width: 1920, height: 1040 }
      ]);
      const result = spawnSync('osacompile', [
        '-o', path.join(directory, `${mode}.scpt`), '-'
      ], { input: script, encoding: 'utf8', timeout: 15000 });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
