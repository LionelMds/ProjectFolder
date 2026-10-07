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

test('all year folders are checked at once', async t => {
  const root = createProjectRoot(t);
  for (const year of ['2022', '2023', '2024', '2025', '2026']) {
    fs.mkdirSync(path.join(root, year), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '2022', '2022-0042'));
  let inFlight = 0;
  let maxInFlight = 0;
  const slowFs = {
    promises: {
      readdir: fs.promises.readdir,
      stat: async target => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight -= 1;
        return fs.promises.stat(target);
      }
    }
  };
  const service = new ProjectService(() => ({ racine: root }), { fs: slowFs });

  const project = await service.resolveProjectInput('0042');

  assert.equal(project.projectNumber, '2022-0042');
  assert.equal(maxInFlight, 5);
});

test('a resolved project is reused when the folder is opened', async t => {
  const root = createProjectRoot(t);
  fs.mkdirSync(path.join(root, '2026', '2026-4889'), { recursive: true });
  const calls = { readdir: 0, stat: 0 };
  let now = 1000;
  const countingFs = {
    promises: {
      readdir: (...args) => {
        calls.readdir += 1;
        return fs.promises.readdir(...args);
      },
      stat: target => {
        calls.stat += 1;
        return fs.promises.stat(target);
      }
    }
  };
  const service = new ProjectService(() => ({ racine: root }), {
    fs: countingFs,
    now: () => now,
    cacheTtlMs: 30000
  });

  await service.resolveProjectInput('4889');
  const afterFirst = { ...calls };
  assert.equal((await service.resolveProjectInput('4889')).projectNumber, '2026-4889');
  assert.deepEqual(calls, afterFirst);

  service.forgetProject('4889');
  await service.resolveProjectInput('4889');
  assert.equal(calls.readdir, afterFirst.readdir + 1);

  now += 30001;
  await service.resolveProjectInput('4889');
  assert.equal(calls.readdir, afterFirst.readdir + 2);
});

test('a missing project is searched again once its folder exists', async t => {
  const root = createProjectRoot(t);
  fs.mkdirSync(path.join(root, '2026'), { recursive: true });
  const service = new ProjectService(() => ({ racine: root }));

  assert.equal(await service.resolveProjectInput('7777'), null);
  fs.mkdirSync(path.join(root, '2026', '2026-7777'));
  assert.equal((await service.resolveProjectInput('7777')).projectNumber, '2026-7777');
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
