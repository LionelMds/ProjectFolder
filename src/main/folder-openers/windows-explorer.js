'use strict';

const {
  escapePowerShellSingleQuoted,
  execFileAsync
} = require('../process-runner');

function buildWindowsExplorerComNavigationScript(folderPath, mode) {
  const escapedPath = escapePowerShellSingleQuoted(folderPath);
  const escapedMode = escapePowerShellSingleQuoted(mode);

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

function Activate-ExplorerWindow($Window) {
  try {
    $hwnd = [IntPtr]([int64]$Window.HWND)
    [ProjectLauncherWin32]::ShowWindow($hwnd, 9) | Out-Null
    [ProjectLauncherWin32]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 80
    return $true
  } catch {
    return $false
  }
}

function Invoke-ExplorerNavigate($Window, [string]$Path, [int]$TimeoutMs) {
  try {
    try {
      $Window.Navigate2($Path)
    } catch {
      $Window.Navigate($Path)
    }
  } catch {
    Write-Output ('com-navigate-error:' + $_.Exception.Message)
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

  try {
    [System.Windows.Forms.SendKeys]::SendWait('^l')
    Start-Sleep -Milliseconds 45
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
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 80
    return $true
  } catch {
    try { [System.Windows.Forms.SendKeys]::SendWait('{ESC}') } catch {}
    Write-Output ('uia-navigation-error:' + $_.Exception.Message)
    return $false
  }
}

function Open-InNewExplorerWindow([string]$Path) {
  $quotedPath = '"' + $Path.Replace('"', '\\"') + '"'
  Start-Process -FilePath explorer.exe -ArgumentList $quotedPath
}

function Navigate-ReuseWindow($Shell, [string]$Path) {
  $target = Select-ExplorerWindow $Shell
  if ($null -eq $target) {
    Open-InNewExplorerWindow $Path
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

  Open-InNewExplorerWindow $Path
  Write-Output 'fallback:new-window:reuse-navigation-failed'
}

function Navigate-NewTab($Shell, [string]$Path) {
  $target = Select-ExplorerWindow $Shell
  if ($null -eq $target) {
    Open-InNewExplorerWindow $Path
    Write-Output 'fallback:new-window:no-existing-explorer'
    return
  }

  $beforeWindows = @(Get-ExplorerWindows $Shell)
  Activate-ExplorerWindow $target | Out-Null
  [System.Windows.Forms.SendKeys]::SendWait('^t')

  $newTab = Find-NewExplorerWindow $Shell $beforeWindows 1500
  if ($null -ne $newTab) {
    Activate-ExplorerWindow $newTab | Out-Null
    if (Invoke-ExplorerNavigate $newTab $Path 1100) {
      Write-Output 'opened:new-tab:com'
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

  try {
    Activate-ExplorerWindow $target | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait('^w')
  } catch {}
  Open-InNewExplorerWindow $Path
  Write-Output 'fallback:new-window:new-tab-navigation-failed'
}

$folderPath = '${escapedPath}'
$mode = '${escapedMode}'
$shell = New-Object -ComObject Shell.Application

if ($mode -eq 'reuseWindow') {
  Navigate-ReuseWindow $shell $folderPath
} elseif ($mode -eq 'newTab') {
  Navigate-NewTab $shell $folderPath
} else {
  Open-InNewExplorerWindow $folderPath
  Write-Output 'opened:new-window:explicit'
}
`;
}

async function navigateWindowsExplorerWithCom(folderPath, mode) {
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
    timeout: 5000
  });

  return result.stdout.trim();
}

module.exports = {
  buildWindowsExplorerComNavigationScript,
  navigateWindowsExplorerWithCom
};
