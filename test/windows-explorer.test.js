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

test('native Explorer sizing centers 70 percent within each monitor work area', {
  skip: process.platform !== 'win32'
}, () => {
  const script = buildWindowsExplorerComNavigationScript('C:\\Temp', 'newWindow');
  const nativeCode = script.match(/Add-Type @"\r?\n([\s\S]*?)\r?\n"@/)[1];
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition ([Console]::In.ReadToEnd())
$cases = @(
  @(0, 0, 1920, 1040, 288, 156, 1632, 884),
  @(-2560, -1440, 0, -40, -2176, -1230, -384, -250),
  @(1920, 48, 5760, 2160, 2496, 365, 5184, 1843),
  @(0, 0, 800, 560, 120, 84, 680, 476)
)
foreach ($case in $cases) {
  $area = New-Object ProjectLauncherWin32+RECT
  $area.Left, $area.Top, $area.Right, $area.Bottom = $case[0..3]
  $actual = [ProjectLauncherWin32]::FitWorkArea($area)
  if (($actual.Left, $actual.Top, $actual.Right, $actual.Bottom -join ',') -ne ($case[4..7] -join ',')) {
    throw ('Unexpected centered bounds: ' + ($actual | ConvertTo-Json -Compress))
  }
}`
  ], { input: nativeCode, encoding: 'utf8', timeout: 15000, windowsHide: true });

  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
