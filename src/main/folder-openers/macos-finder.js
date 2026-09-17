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
      '  set useExistingDisplay to false',
      '  set targetWindow to make new Finder window'
    ]
    : [
      '  set useExistingDisplay to (count of Finder windows) > 0',
      '  if useExistingDisplay then',
      ...(mode === 'newTab' ? [
        '    activate',
        '    tell application "System Events" to keystroke "t" using command down',
        '    delay 0.15'
      ] : []),
      '    set targetWindow to front Finder window',
      '  else',
      '    set targetWindow to make new Finder window',
      '  end if'
    ];

  return [
    'tell application "Finder"',
    ...navigation,
    `  set target of targetWindow to (POSIX file "${escapedPath}" as alias)`,
    '  my fitFinderWindow(targetWindow, useExistingDisplay)',
    '  activate',
    'end tell',
    '',
    'on fitFinderWindow(targetWindow, useExistingDisplay)',
    `  set workAreas to {${areas.join(', ')}}`,
    '  if (count of workAreas) is 0 then return',
    '  try',
    '    set chosenArea to item 1 of workAreas',
    '    if useExistingDisplay then',
    '      tell application "Finder" to set currentBounds to bounds of targetWindow',
    '      set bestOverlap to 0',
    '      repeat with area in workAreas',
    '        set overlapWidth to (my lesser(item 3 of currentBounds, item 3 of area)) - (my greater(item 1 of currentBounds, item 1 of area))',
    '        set overlapHeight to (my lesser(item 4 of currentBounds, item 4 of area)) - (my greater(item 2 of currentBounds, item 2 of area))',
    '        set overlap to (my greater(0, overlapWidth)) * (my greater(0, overlapHeight))',
    '        if overlap > bestOverlap then',
    '          set bestOverlap to overlap',
    '          set chosenArea to contents of area',
    '        end if',
    '      end repeat',
    '    end if',
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
    'end fitFinderWindow',
    '',
    'on lesser(a, b)',
    '  if a < b then return a',
    '  return b',
    'end lesser',
    '',
    'on greater(a, b)',
    '  if a > b then return a',
    '  return b',
    'end greater'
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
