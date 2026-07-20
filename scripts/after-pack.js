'use strict';

const path = require('path');
const {
  flipFuses,
  FuseVersion,
  FuseV1Options
} = require('@electron/fuses');

module.exports = async function hardenPackagedElectron(context) {
  const productName = context.packager.appInfo.productFilename;
  const executablePath = getExecutablePath(
    context.appOutDir,
    productName,
    context.electronPlatformName
  );

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin',
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
    [FuseV1Options.WasmTrapHandlers]: true
  });
};

function getExecutablePath(appOutDir, productName, platform) {
  if (platform === 'darwin') {
    return path.join(
      appOutDir,
      `${productName}.app`,
      'Contents',
      'MacOS',
      productName
    );
  }

  if (platform === 'win32') {
    return path.join(appOutDir, `${productName}.exe`);
  }

  return path.join(appOutDir, productName);
}

module.exports.getExecutablePath = getExecutablePath;
