'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const test = require('node:test');
const {
  buildWindowsExplorerComNavigationScript,
  createExplorerWorker
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

test('Explorer sizing only applies to newly created windows', () => {
  const script = buildWindowsExplorerComNavigationScript('C:\Temp', 'reuseWindow');
  const sizedCalls = script.match(/Activate-ExplorerWindow \S+ \$true/g) || [];

  assert.deepEqual(sizedCalls, ['Activate-ExplorerWindow $window $true']);
  assert.match(script, /if \(\[ProjectLauncherWin32\]::IsIconic\(\$hwnd\)\) \{\s*\[ProjectLauncherWin32\]::ShowWindow\(\$hwnd, 9\)/);
  assert.match(script, /-not \$beforeHandles\.ContainsKey\(\$handle\)\) \{\s*Activate-ExplorerWindow \$window \$true/);
});

test('keystrokes are only sent once Explorer is confirmed in the foreground', () => {
  const script = buildWindowsExplorerComNavigationScript('C:\\Temp', 'newTab');

  assert.match(
    script,
    /RequestForeground\(\$hwnd, \$attempt\) -and \(Wait-ForegroundWindow \$hwnd \d+\)\) \{\s*Start-Sleep -Milliseconds \d+\s*return \$true[\s\S]*?Write-Warning 'Explorer window did not become the foreground window'\s*return \$false/
  );
  assert.match(
    script,
    /if \(-not \(Activate-ExplorerWindow \$target\)\) \{[\s\S]*?return\s*\}\s*\[System\.Windows\.Forms\.SendKeys\]::SendWait\('\^t'\)/
  );
  assert.match(
    script,
    /if \(Activate-ExplorerWindow \$target\) \{\s*try \{ \[System\.Windows\.Forms\.SendKeys\]::SendWait\('\^w'\)/
  );
  assert.match(
    script,
    /if \(-not \(Test-IsForegroundWindow \$hwnd\)\) \{[\s\S]*?return \$false\s*\}\s*\[System\.Windows\.Forms\.SendKeys\]::SendWait\('\{ENTER\}'\)/
  );
});

// The long-lived worker never owns the foreground: the tab must come from
// Explorer's own command, Ctrl+T being the fallback.
test('a new tab is requested from Explorer before any keystroke', () => {
  const script = buildWindowsExplorerComNavigationScript('C:\\Temp', 'newTab');
  const newTab = script.slice(script.indexOf('function Navigate-NewTab'), script.indexOf('function Invoke-ExplorerNavigation'));

  assert.match(script, /FindWindowEx\(frame, IntPtr\.Zero, "ShellTabWindowClass", null\)/);
  assert.match(script, /PostMessage\(tab, 0x0111, new IntPtr\(0xA21B\), IntPtr\.Zero\)/);
  assert.ok(newTab.indexOf('Request-ExplorerNewTab $target') >= 0);
  assert.ok(newTab.indexOf('Request-ExplorerNewTab $target') < newTab.indexOf("SendWait('^t')"));
  assert.match(newTab, /if \(\$null -eq \$newTab\) \{\s*Write-Output 'new-tab-command-failed'/);
  assert.match(newTab, /Write-Output \('opened:new-tab:' \+ \$route\)/);
});

test('a failed COM navigation is reported as a failure', {
  skip: process.platform !== 'win32'
}, () => {
  const script = buildWindowsExplorerComNavigationScript('C:\\Temp', 'newWindow');
  const automation = script.slice(0, script.lastIndexOf('$folderPath ='));
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Sta', '-Command',
    `$source = [Console]::In.ReadToEnd()
. ([ScriptBlock]::Create($source))
$window = New-Object PSObject
$window | Add-Member ScriptMethod Navigate2 { throw 'refused' }
$window | Add-Member ScriptMethod Navigate { throw 'refused' }
$records = @(Invoke-ExplorerNavigate $window 'C:\\Temp' 50 3>&1)
$results = @($records | Where-Object { $_ -isnot [System.Management.Automation.WarningRecord] })
$warnings = @($records | Where-Object { $_ -is [System.Management.Automation.WarningRecord] })
if ($results.Count -ne 1 -or $results[0] -ne $false) { throw 'navigation result is not a single $false' }
if (-not ($warnings[0].Message -like 'com-navigate-error:*refused*')) { throw 'missing diagnostic' }`
  ], { input: automation, encoding: 'utf8', timeout: 15000, windowsHide: true });

  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('the Explorer worker keeps accented paths intact', {
  skip: process.platform !== 'win32'
}, async () => {
  const worker = createExplorerWorker();
  const folderPath = "C:\\Projets\\2026\\2026-4889\\Plans\\Plan d'exécution – 🏭";
  try {
    assert.equal(await worker.request({ op: 'echo', path: folderPath }), folderPath);
    await assert.rejects(
      worker.request({ op: 'navigate', path: ' ' }),
      /Unsupported worker request/
    );
    assert.equal(worker.running, true);
  } finally {
    worker.stop();
  }
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
