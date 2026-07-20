'use strict';

const { execFile } = require('child_process');

function execFileAsync(file, args, options = {}) {
  const timeout = options.timeout || 5000;
  const maxBuffer = options.maxBuffer || 1024 * 1024;

  return new Promise((resolve, reject) => {
    execFile(file, args, {
      timeout,
      maxBuffer,
      windowsHide: true,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = stderr ? ` ${String(stderr).trim()}` : '';
        reject(new Error(`${error.message}${stderrText}`));
        return;
      }

      resolve({
        stdout: String(stdout || ''),
        stderr: String(stderr || '')
      });
    });
  });
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = {
  escapeAppleScriptString,
  escapePowerShellSingleQuoted,
  execFileAsync
};
