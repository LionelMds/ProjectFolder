'use strict';

const { FOLDER_WINDOW_SCALE } = require('../constants');
const {
  escapeAppleScriptString,
  execFileAsync
} = require('../process-runner');

function buildFinderNavigationScript(folderPath, mode, workAreas = []) {
  const escapedPath = escapeAppleScriptString(folderPath);
  const areas = workAreas.map(({ x, y, width, height }) => (
    `{${[x, y, x + width, y + height].map(Math.round).join(', ')}}`
  ));
  const navigation = mode === 'newWindow'
    ? [
      '  set isNewWindow to true',
      '  set targetWindow to make new Finder window'
    ]
    : [
      '  set isNewWindow to (count of Finder windows) is 0',
      '  if isNewWindow then',
      '    set targetWindow to make new Finder window',
      '  else',
      ...(mode === 'newTab' ? [
        '    activate',
        '    tell application "System Events" to keystroke "t" using command down',
        '    delay 0.15'
      ] : []),
      '    set targetWindow to front Finder window',
      '  end if'
    ];

  return [
    'tell application "Finder"',
    ...navigation,
    `  set target of targetWindow to (POSIX file "${escapedPath}" as alias)`,
    // Windows that were already open keep the size the user gave them.
    '  if isNewWindow then my fitFinderWindow(targetWindow)',
    '  activate',
    'end tell',
    '',
    'on fitFinderWindow(targetWindow)',
    `  set workAreas to {${areas.join(', ')}}`,
    '  if (count of workAreas) is 0 then return',
    '  try',
    '    set chosenArea to item 1 of workAreas',
    '    set areaWidth to (item 3 of chosenArea) - (item 1 of chosenArea)',
    '    set areaHeight to (item 4 of chosenArea) - (item 2 of chosenArea)',
    `    set targetWidth to round (areaWidth * ${FOLDER_WINDOW_SCALE})`,
    `    set targetHeight to round (areaHeight * ${FOLDER_WINDOW_SCALE})`,
    '    set targetLeft to (item 1 of chosenArea) + (round ((areaWidth - targetWidth) / 2))',
    '    set targetTop to (item 2 of chosenArea) + (round ((areaHeight - targetHeight) / 2))',
    '    tell application "Finder" to set bounds of targetWindow to {targetLeft, targetTop, targetLeft + targetWidth, targetTop + targetHeight}',
    '  on error errorMessage',
    '    log ("Finder window sizing failed: " & errorMessage)',
    '  end try',
    'end fitFinderWindow'
  ].join('\n');
}

async function openFolderInFinderWindow(folderPath, workAreas) {
  await execFileAsync('osascript', [
    '-e', buildFinderNavigationScript(folderPath, 'newWindow', workAreas)
  ], { timeout: 5000 });
  return 'opened:new-window:applescript';
}

async function openFolderInFinderTab(folderPath, workAreas) {
  await execFileAsync('osascript', [
    '-e', buildFinderNavigationScript(folderPath, 'newTab', workAreas)
  ], { timeout: 7000 });
  return 'opened:new-tab:applescript';
}

async function reuseFinderWindow(folderPath, workAreas) {
  await execFileAsync('osascript', [
    '-e', buildFinderNavigationScript(folderPath, 'reuseWindow', workAreas)
  ], { timeout: 5000 });
  return 'opened:reuse-window:applescript';
}

module.exports = {
  buildFinderNavigationScript,
  openFolderInFinderWindow,
  openFolderInFinderTab,
  reuseFinderWindow
};
