'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const test = require('node:test');
const {
  buildWindowsExplorerComNavigationScript
} = require('../src/main/folder-openers/windows-explorer');

test('Explorer scripts escape apostrophes and select the requested behavior', () => {
  const script = buildWindowsExplorerComNavigationScript(
    "C:\\Clients\\2026-1234\\Dossier d'exécution",
    'newTab'
  );

  assert.match(script, /Dossier d''exécution/);
  assert.match(script, /\$mode = 'newTab'/);
  assert.match(script, /Invoke-ExplorerNavigate/);
  assert.doesNotMatch(script, /-ArgumentList \$Path/);
});

test('the generated Explorer PowerShell is syntactically valid', {
  skip: process.platform !== 'win32'
}, () => {
  const script = buildWindowsExplorerComNavigationScript('C:\\Temp', 'newTab');
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$source = [Console]::In.ReadToEnd(); [void][ScriptBlock]::Create($source)'
  ], {
    input: script,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
});
