'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const roots = [
  path.join(projectRoot, 'main.js'),
  path.join(projectRoot, 'preload.js'),
  path.join(projectRoot, 'renderer.js'),
  path.join(projectRoot, 'mini-renderer.js'),
  path.join(projectRoot, 'settings-renderer.js'),
  path.join(projectRoot, 'update-renderer.js'),
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'scripts'),
  path.join(projectRoot, 'test')
];

const files = roots.flatMap(collectJavaScriptFiles).sort();
for (const filePath of files) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`Syntax checked: ${files.length} JavaScript files\n`);

function collectJavaScriptFiles(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return [];
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return targetPath.endsWith('.js') ? [targetPath] : [];
  }

  return fs.readdirSync(targetPath, { withFileTypes: true })
    .flatMap(entry => collectJavaScriptFiles(path.join(targetPath, entry.name)));
}
