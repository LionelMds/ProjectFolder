'use strict';

const {
  escapeAppleScriptString,
  execFileAsync
} = require('../process-runner');

async function openFolderInFinderTab(folderPath) {
  const escapedPath = escapeAppleScriptString(folderPath);
  const appleScript = [
    'tell application "Finder"',
    '  activate',
    '  if (count of windows) > 0 then',
    '    tell application "System Events" to keystroke "t" using command down',
    '    delay 0.15',
    `    set target of front window to (POSIX file "${escapedPath}" as alias)`,
    '  else',
    `    open (POSIX file "${escapedPath}" as alias)`,
    '  end if',
    'end tell'
  ].join('\n');

  await execFileAsync('osascript', ['-e', appleScript], { timeout: 7000 });
  return 'opened:new-tab:applescript';
}

async function reuseFinderWindow(folderPath) {
  const escapedPath = escapeAppleScriptString(folderPath);
  const appleScript = [
    'tell application "Finder"',
    '  if (count of windows) > 0 then',
    `    set target of front window to (POSIX file "${escapedPath}" as alias)`,
    '  else',
    `    open (POSIX file "${escapedPath}" as alias)`,
    '  end if',
    '  activate',
    'end tell'
  ].join('\n');

  await execFileAsync('osascript', ['-e', appleScript], { timeout: 5000 });
  return 'opened:reuse-window:applescript';
}

module.exports = {
  openFolderInFinderTab,
  reuseFinderWindow
};
