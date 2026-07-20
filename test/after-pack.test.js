'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');
const { getExecutablePath } = require('../scripts/after-pack');

test('packaged executable paths are derived for Windows and macOS', () => {
  assert.equal(
    getExecutablePath('C:\\dist\\win-unpacked', 'Project Folder Launcher', 'win32'),
    path.join('C:\\dist\\win-unpacked', 'Project Folder Launcher.exe')
  );
  assert.equal(
    getExecutablePath('/tmp/mac', 'Project Folder Launcher', 'darwin'),
    path.join(
      '/tmp/mac',
      'Project Folder Launcher.app',
      'Contents',
      'MacOS',
      'Project Folder Launcher'
    )
  );
});
