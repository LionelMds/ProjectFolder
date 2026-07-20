'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { ProjectService } = require('../src/main/project-service');

test('four digits resolve to the newest matching project directory', async t => {
  const root = createProjectRoot(t);
  fs.mkdirSync(path.join(root, '2024', '2024-4889'), { recursive: true });
  fs.mkdirSync(path.join(root, '2026', '2026-4889'), { recursive: true });
  const service = new ProjectService(() => ({ racine: root }));

  const project = await service.resolveProjectInput('4889');

  assert.equal(project.projectNumber, '2026-4889');
  assert.equal(project.year, '2026');
});

test('full project numbers are verified on disk', async t => {
  const root = createProjectRoot(t);
  fs.mkdirSync(path.join(root, '2025', '2025-0042'), { recursive: true });
  const service = new ProjectService(() => ({ racine: root }));

  assert.equal(
    (await service.resolveProjectInput('2025-0042')).projectNumber,
    '2025-0042'
  );
  assert.equal(await service.resolveProjectInput('2025-9999'), null);
});

test('project subfolder paths remain contained in the project', t => {
  const root = createProjectRoot(t);
  const service = new ProjectService(() => ({ racine: root }));

  assert.equal(
    service.buildProjectPath('2025-0042', 'Plans\\Execution'),
    path.join(root, '2025', '2025-0042', 'Plans', 'Execution')
  );
  assert.throws(
    () => service.buildProjectPath('2025-0042', '..\\Other'),
    /sortir du projet/
  );
});

function createProjectRoot(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pfl-projects-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
