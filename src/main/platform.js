'use strict';

const os = require('os');

function isMac(platform = process.platform) {
  return platform === 'darwin';
}

function isWindows(platform = process.platform) {
  return platform === 'win32';
}

function supportsWindowsExplorerTabs(platform = process.platform, release = os.release()) {
  if (!isWindows(platform)) {
    return false;
  }

  const build = Number(String(release).split('.')[2] || 0);
  return build >= 22621;
}

module.exports = {
  isMac,
  isWindows,
  supportsWindowsExplorerTabs
};
