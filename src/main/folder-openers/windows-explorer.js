'use strict';

const {
  EXPLORER_NAVIGATION_TIMEOUT_MS,
  EXPLORER_WORKER_IDLE_MS,
  FOLDER_WINDOW_SCALE
} = require('../constants');
const {
  escapePowerShellSingleQuoted,
  execFileAsync
} = require('../process-runner');
const { PowerShellWorker } = require('../powershell-worker');

// Assemblies, native helpers and navigation functions shared by the one-shot
// script and the long-lived worker. Compiling them is what makes a cold
// PowerShell start cost about half a second.
function buildExplorerAutomationScript() {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ProjectLauncherWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(
    IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string title);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool doAttach);
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO {
    public int Size;
    public RECT Monitor, WorkArea;
    public uint Flags;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int Dx, Dy; public uint MouseData, Flags, Time; public IntPtr ExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint Type; public MOUSEINPUT Mouse; }

  // Explorer's own "New tab" command (Windows 11), posted to the active tab:
  // unlike Ctrl+T it does not need the keyboard focus.
  public static bool RequestNewTab(IntPtr frame) {
    IntPtr tab = FindWindowEx(frame, IntPtr.Zero, "ShellTabWindowClass", null);
    return tab != IntPtr.Zero && PostMessage(tab, 0x0111, new IntPtr(0xA21B), IntPtr.Zero);
  }

  // Windows gives the foreground only to the process that received the last
  // input, which the long-lived worker never is. Each attempt escalates: a
  // plain request, then after an empty mouse input, then while sharing the
  // input state of the current foreground thread.
  public static bool RequestForeground(IntPtr hWnd, int attempt) {
    if (attempt == 1) {
      INPUT[] inputs = new INPUT[1];
      SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
    if (attempt < 2) return SetForegroundWindow(hWnd);

    uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint currentThread = GetCurrentThreadId();
    bool attached = foregroundThread != 0 && foregroundThread != currentThread
      && AttachThreadInput(currentThread, foregroundThread, true);
    try {
      BringWindowToTop(hWnd);
      return SetForegroundWindow(hWnd);
    } finally {
      if (attached) AttachThreadInput(currentThread, foregroundThread, false);
    }
  }

  public static RECT FitWorkArea(RECT area) {
    int width = Math.Max(1, (int)Math.Round((area.Right - area.Left) * ${FOLDER_WINDOW_SCALE}));
    int height = Math.Max(1, (int)Math.Round((area.Bottom - area.Top) * ${FOLDER_WINDOW_SCALE}));
    int left = area.Left + (area.Right - area.Left - width) / 2;
    int top = area.Top + (area.Bottom - area.Top - height) / 2;
    return new RECT { Left = left, Top = top, Right = left + width, Bottom = top + height };
  }

  public static bool FitWindow(IntPtr hWnd) {
    IntPtr previousDpi = IntPtr.Zero;
    try {
      // Use physical coordinates on displays with different scaling factors.
      try { previousDpi = SetThreadDpiAwarenessContext(new IntPtr(-3)); }
      catch (EntryPointNotFoundException) {}
      MONITORINFO info = new MONITORINFO();
      info.Size = Marshal.SizeOf(typeof(MONITORINFO));
      if (!GetMonitorInfo(MonitorFromWindow(hWnd, 2), ref info)) return false;
      RECT bounds = FitWorkArea(info.WorkArea);
      ShowWindow(hWnd, 9);
      // Keep the normal z-order and leave activation to the caller.
      return SetWindowPos(hWnd, IntPtr.Zero, bounds.Left, bounds.Top,
        bounds.Right - bounds.Left, bounds.Bottom - bounds.Top, 0x0014);
    } finally {
      if (previousDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi);
    }
  }
}
"@

function Test-IsExplorerWindow($Window) {
  try {
    $fullName = [string]$Window.FullName
    if (-not [string]::IsNullOrWhiteSpace($fullName)) {
      return [string]::Equals(
        [System.IO.Path]::GetFileName($fullName),
        'explorer.exe',
        [System.StringComparison]::OrdinalIgnoreCase
      )
    }
  } catch {}

  try {
    $name = [string]$Window.Name
    return $name -eq 'Explorateur de fichiers' -or $name -eq 'File Explorer'
  } catch {
    return $false
  }
}

function Get-ExplorerWindows($Shell) {
  return @($Shell.Windows() | Where-Object { Test-IsExplorerWindow $_ })
}

function Get-WindowFileSystemPath($Window) {
  try {
    $documentPath = [string]$Window.Document.Folder.Self.Path
    if (-not [string]::IsNullOrWhiteSpace($documentPath) -and [System.IO.Directory]::Exists($documentPath)) {
      return $documentPath
    }
  } catch {}

  try {
    $locationUrl = [string]$Window.LocationURL
    if ($locationUrl.StartsWith('file:///', [System.StringComparison]::OrdinalIgnoreCase)) {
      $uri = [System.Uri]$locationUrl
      return $uri.LocalPath
    }
  } catch {}

  return ''
}

function Normalize-PathForCompare([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ''
  }

  try {
    return ([System.IO.Path]::GetFullPath($Path)).TrimEnd('\\')
  } catch {
    return $Path.TrimEnd('\\')
  }
}

function Test-WindowAtPath($Window, [string]$Path) {
  $currentPath = Normalize-PathForCompare (Get-WindowFileSystemPath $Window)
  $expectedPath = Normalize-PathForCompare $Path

  if ([string]::IsNullOrWhiteSpace($currentPath) -or [string]::IsNullOrWhiteSpace($expectedPath)) {
    return $false
  }

  return [string]::Equals($currentPath, $expectedPath, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-WindowSignature($Window) {
  $hwnd = ''
  $locationUrl = ''
  $folderPath = ''
  try { $hwnd = [string]$Window.HWND } catch {}
  try { $locationUrl = [string]$Window.LocationURL } catch {}
  try { $folderPath = [string]$Window.Document.Folder.Self.Path } catch {}
  return "$hwnd|$locationUrl|$folderPath"
}

function New-SignatureCounts($Windows) {
  $counts = @{}
  foreach ($window in $Windows) {
    $signature = Get-WindowSignature $window
    if ($counts.ContainsKey($signature)) {
      $counts[$signature] = [int]$counts[$signature] + 1
    } else {
      $counts[$signature] = 1
    }
  }
  return $counts
}

function Find-NewExplorerWindow($Shell, $BeforeWindows, [int]$TimeoutMs) {
  $beforeWindowList = @($BeforeWindows)
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)

  do {
    Start-Sleep -Milliseconds 35
    $afterWindows = @(Get-ExplorerWindows $Shell)

    if ($afterWindows.Count -gt $beforeWindowList.Count) {
      $remaining = @{}
      $beforeCounts = New-SignatureCounts $beforeWindowList
      foreach ($key in $beforeCounts.Keys) {
        $remaining[$key] = $beforeCounts[$key]
      }

      foreach ($candidate in $afterWindows) {
        $signature = Get-WindowSignature $candidate
        if ($remaining.ContainsKey($signature) -and [int]$remaining[$signature] -gt 0) {
          $remaining[$signature] = [int]$remaining[$signature] - 1
        } else {
          return $candidate
        }
      }
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  return $null
}

function Select-ExplorerWindow($Shell) {
  $windows = @(Get-ExplorerWindows $Shell)
  if ($windows.Count -eq 0) {
    return $null
  }

  $foregroundHwnd = [ProjectLauncherWin32]::GetForegroundWindow().ToInt64()
  foreach ($window in $windows) {
    try {
      if ([int64]$window.HWND -eq $foregroundHwnd) {
        return $window
      }
    } catch {}
  }

  foreach ($window in $windows) {
    try {
      if ([bool]$window.Visible) {
        return $window
      }
    } catch {}
  }

  return $windows[0]
}

function Test-IsForegroundWindow([IntPtr]$Hwnd) {
  return [ProjectLauncherWin32]::GetForegroundWindow().ToInt64() -eq $Hwnd.ToInt64()
}

function Wait-ForegroundWindow([IntPtr]$Hwnd, [int]$TimeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    if (Test-IsForegroundWindow $Hwnd) {
      return $true
    }
    Start-Sleep -Milliseconds 20
  } while ([DateTime]::UtcNow -lt $deadline)

  return (Test-IsForegroundWindow $Hwnd)
}

# Returns $true only when Explorer really owns the keyboard focus: Windows may
# refuse SetForegroundWindow, and keystrokes would then reach another app.
function Activate-ExplorerWindow($Window, [bool]$FitSize = $false) {
  try {
    $hwnd = [IntPtr]([int64]$Window.HWND)
    if ($FitSize) {
      try {
        if (-not [ProjectLauncherWin32]::FitWindow($hwnd)) {
          Write-Warning 'Explorer window sizing failed'
        }
      } catch { Write-Warning ('Explorer window sizing failed: ' + $_.Exception.Message) }
    }
    # Restoring a maximized window would shrink it: only restore minimized ones.
    if ([ProjectLauncherWin32]::IsIconic($hwnd)) {
      [ProjectLauncherWin32]::ShowWindow($hwnd, 9) | Out-Null
    }
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
      if ([ProjectLauncherWin32]::RequestForeground($hwnd, $attempt) -and (Wait-ForegroundWindow $hwnd 250)) {
        Start-Sleep -Milliseconds 80
        return $true
      }
    }
    Write-Warning 'Explorer window did not become the foreground window'
    return $false
  } catch {
    return $false
  }
}

function Request-ExplorerNewTab($Window) {
  try {
    return [ProjectLauncherWin32]::RequestNewTab([IntPtr]([int64]$Window.HWND))
  } catch {
    Write-Warning ('new-tab-command-error:' + $_.Exception.Message)
    return $false
  }
}

# Diagnostics go to the warning stream: anything written to the output stream
# would become part of the boolean result tested by the callers.
function Invoke-ExplorerNavigate($Window, [string]$Path, [int]$TimeoutMs) {
  try {
    try {
      $Window.Navigate2($Path)
    } catch {
      $Window.Navigate($Path)
    }
  } catch {
    Write-Warning ('com-navigate-error:' + $_.Exception.Message)
    return $false
  }

  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  do {
    Start-Sleep -Milliseconds 35
    if (Test-WindowAtPath $Window $Path) {
      return $true
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  return (Test-WindowAtPath $Window $Path)
}

function Invoke-ActiveTabNavigateWithUiAutomation($Window, [string]$Path) {
  if (-not (Activate-ExplorerWindow $Window)) {
    return $false
  }

  $hwnd = [IntPtr]([int64]$Window.HWND)
  try {
    [System.Windows.Forms.SendKeys]::SendWait('^l')
    Start-Sleep -Milliseconds 45
    if (-not (Test-IsForegroundWindow $hwnd)) {
      Write-Warning 'uia-navigation-error:focus-lost'
      return $false
    }

    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -eq $focused) {
      return $false
    }

    $pattern = $focused.GetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern
    )
    if ($null -eq $pattern) {
      return $false
    }

    $pattern.SetValue($Path)
    if (-not (Test-IsForegroundWindow $hwnd)) {
      Write-Warning 'uia-navigation-error:focus-lost'
      return $false
    }
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 80
    return $true
  } catch {
    if (Test-IsForegroundWindow $hwnd) {
      try { [System.Windows.Forms.SendKeys]::SendWait('{ESC}') } catch {}
    }
    Write-Warning ('uia-navigation-error:' + $_.Exception.Message)
    return $false
  }
}

function Open-InNewExplorerWindow($Shell, [string]$Path) {
  $beforeHandles = @{}
  foreach ($window in @(Get-ExplorerWindows $Shell)) {
    try { $beforeHandles[[string]$window.HWND] = $true } catch {}
  }
  $quotedPath = '"' + $Path.Replace('"', '\\"') + '"'
  Start-Process -FilePath explorer.exe -ArgumentList $quotedPath

  # Wait for the requested folder, not merely an unrelated foreground window.
  try {
    $deadline = [DateTime]::UtcNow.AddMilliseconds(2500)
    do {
      $foregroundHwnd = [ProjectLauncherWin32]::GetForegroundWindow().ToInt64()
      $matchingForeground = $null
      foreach ($window in @(Get-ExplorerWindows $Shell)) {
        if (Test-WindowAtPath $window $Path) {
          $handle = [string]$window.HWND
          if (-not $beforeHandles.ContainsKey($handle)) {
            Activate-ExplorerWindow $window $true | Out-Null
            return
          }
          if ([int64]$window.HWND -eq $foregroundHwnd) { $matchingForeground = $window }
        }
      }
      # Explorer focused a window that was already open: keep its size.
      if ($null -ne $matchingForeground) {
        Activate-ExplorerWindow $matchingForeground | Out-Null
        return
      }
      Start-Sleep -Milliseconds 35
    } while ([DateTime]::UtcNow -lt $deadline)
    Write-Warning 'Folder opened, but its Explorer window was not ready for sizing'
  } catch {
    Write-Warning ('Folder opened, but window sizing failed: ' + $_.Exception.Message)
  }
}


function Navigate-ReuseWindow($Shell, [string]$Path) {
  $target = Select-ExplorerWindow $Shell
  if ($null -eq $target) {
    Open-InNewExplorerWindow $Shell $Path
    Write-Output 'fallback:new-window:no-existing-explorer'
    return
  }

  Activate-ExplorerWindow $target | Out-Null
  if (Invoke-ExplorerNavigate $target $Path 900) {
    Write-Output 'opened:reuse-window:com'
    return
  }

  if (Invoke-ActiveTabNavigateWithUiAutomation $target $Path) {
    Write-Output 'opened:reuse-window:uia'
    return
  }

  Open-InNewExplorerWindow $Shell $Path
  Write-Output 'fallback:new-window:reuse-navigation-failed'
}

function Navigate-NewTab($Shell, [string]$Path) {
  $target = Select-ExplorerWindow $Shell
  if ($null -eq $target) {
    Open-InNewExplorerWindow $Shell $Path
    Write-Output 'fallback:new-window:no-existing-explorer'
    return
  }

  # Explorer's own command first: it works without the keyboard focus.
  $route = 'command'
  $newTab = $null
  $beforeWindows = @(Get-ExplorerWindows $Shell)
  if (Request-ExplorerNewTab $target) {
    $newTab = Find-NewExplorerWindow $Shell $beforeWindows 1500
  }

  if ($null -eq $newTab) {
    Write-Output 'new-tab-command-failed'
    $route = 'com'
    $beforeWindows = @(Get-ExplorerWindows $Shell)
    if (-not (Activate-ExplorerWindow $target)) {
      Open-InNewExplorerWindow $Shell $Path
      Write-Output 'fallback:new-window:explorer-not-foreground'
      return
    }
    [System.Windows.Forms.SendKeys]::SendWait('^t')
    $newTab = Find-NewExplorerWindow $Shell $beforeWindows 1500
  }

  if ($null -ne $newTab) {
    if (Invoke-ExplorerNavigate $newTab $Path 1100) {
      # The tab is open even if Windows keeps Explorer in the background.
      Activate-ExplorerWindow $newTab | Out-Null
      Write-Output ('opened:new-tab:' + $route)
      return
    }
    Write-Output 'new-tab-com-navigation-failed'
    if (Invoke-ActiveTabNavigateWithUiAutomation $newTab $Path) {
      Write-Output 'opened:new-tab:uia'
      return
    }
  } else {
    Write-Output 'new-tab-com-object-not-found'
    if (Invoke-ActiveTabNavigateWithUiAutomation $target $Path) {
      Write-Output 'opened:new-tab:uia'
      return
    }
  }

  # Close the blank tab only when Ctrl+W is certain to reach Explorer.
  if (Activate-ExplorerWindow $target) {
    try { [System.Windows.Forms.SendKeys]::SendWait('^w') } catch {}
  } else {
    Write-Output 'new-tab-cleanup-skipped'
  }
  Open-InNewExplorerWindow $Shell $Path
  Write-Output 'fallback:new-window:new-tab-navigation-failed'
}

function Invoke-ExplorerNavigation($Shell, [string]$Path, [string]$Mode) {
  if ($Mode -eq 'reuseWindow') {
    Navigate-ReuseWindow $Shell $Path
  } elseif ($Mode -eq 'newTab') {
    Navigate-NewTab $Shell $Path
  } else {
    Open-InNewExplorerWindow $Shell $Path
    Write-Output 'opened:new-window:explicit'
  }
}

function Format-NavigationRecords($Records) {
  $lines = foreach ($record in @($Records)) {
    if ($record -is [System.Management.Automation.WarningRecord]) {
      'warning:' + $record.Message
    } elseif ($null -ne $record) {
      [string]$record
    }
  }
  return [string]::Join([string][char]10, [string[]]@($lines))
}
`;
}

// Long-lived variant: one JSON request per stdin line, one JSON answer per
// stdout line. Both directions stay ASCII (\uXXXX escapes) so accented paths
// survive whatever console code page Windows uses.
const WORKER_LOOP_SCRIPT = String.raw`
function ConvertTo-AsciiJson($Value) {
  $json = ConvertTo-Json -InputObject $Value -Compress
  return [regex]::Replace($json, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
}

[Console]::Out.WriteLine((ConvertTo-AsciiJson @{ ready = $true }))
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {
    break
  }
  if ([string]::IsNullOrWhiteSpace($line)) {
    continue
  }

  $id = $null
  try {
    $request = ConvertFrom-Json -InputObject $line
    $id = $request.id
    $requestPath = [string]$request.path
    if ($request.op -eq 'echo') {
      $output = $requestPath
    } elseif ($request.op -eq 'navigate' -and -not [string]::IsNullOrWhiteSpace($requestPath)) {
      # A fresh Shell object per request survives an Explorer restart.
      $shell = New-Object -ComObject Shell.Application
      $output = Format-NavigationRecords @(Invoke-ExplorerNavigation $shell $requestPath ([string]$request.mode) 3>&1)
    } else {
      throw ('Unsupported worker request: ' + [string]$request.op)
    }
    $response = @{ id = $id; ok = $true; output = $output }
  } catch {
    $response = @{ id = $id; ok = $false; error = $_.Exception.Message }
  }

  [Console]::Out.WriteLine((ConvertTo-AsciiJson $response))
  [Console]::Out.Flush()
}
`;

function buildWindowsExplorerComNavigationScript(folderPath, mode) {
  const escapedPath = escapePowerShellSingleQuoted(folderPath);
  const escapedMode = escapePowerShellSingleQuoted(mode);

  return `${buildExplorerAutomationScript()}
$folderPath = '${escapedPath}'
$mode = '${escapedMode}'
$shell = New-Object -ComObject Shell.Application
Format-NavigationRecords @(Invoke-ExplorerNavigation $shell $folderPath $mode 3>&1)
`;
}

function buildWindowsExplorerWorkerScript() {
  return `${buildExplorerAutomationScript()}${WORKER_LOOP_SCRIPT}`;
}

function createExplorerWorker(options = {}) {
  return new PowerShellWorker({
    script: buildWindowsExplorerWorkerScript(),
    logger: options.logger,
    spawn: options.spawn,
    idleTimeoutMs: options.idleTimeoutMs ?? EXPLORER_WORKER_IDLE_MS
  });
}

async function navigateWindowsExplorerWithCom(folderPath, mode, worker = null) {
  if (worker) {
    const output = await worker.request(
      { op: 'navigate', path: folderPath, mode },
      { timeoutMs: EXPLORER_NAVIGATION_TIMEOUT_MS }
    );
    return output.trim();
  }

  const script = buildWindowsExplorerComNavigationScript(folderPath, mode);
  const result = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Sta',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    timeout: EXPLORER_NAVIGATION_TIMEOUT_MS
  });

  return result.stdout.trim();
}

module.exports = {
  buildWindowsExplorerComNavigationScript,
  buildWindowsExplorerWorkerScript,
  createExplorerWorker,
  navigateWindowsExplorerWithCom
};
