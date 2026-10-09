'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { ApplicationController } = require('../src/main/application');
const { ProjectService } = require('../src/main/project-service');

function createController(t, pickedPath) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pfl-subfolder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '2026', '2026-4889', 'Plans'), { recursive: true });

  const dialogCalls = [];
  const settingsWindow = { isDestroyed: () => false };
  const dialog = {
    async showOpenDialog(owner, options) {
      assert.equal(owner, settingsWindow, 'the dialog must belong to the always-on-top settings window');
      dialogCalls.push(options);
      return pickedPath === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [pickedPath(root)] };
    }
  };
  const controller = new ApplicationController({ dialog }, null, { platform: 'win32' });
  controller.configStore = { config: { recentFolders: [{ projectNumber: '2026-4889' }] } };
  controller.projectService = new ProjectService(() => ({ racine: '' }));
  controller.windowManager = { settingsWindow };
  return { controller, root, dialogCalls };
}

test('browsing for a subfolder stores its path relative to the project', async t => {
  const { controller, root, dialogCalls } = createController(
    t,
    base => path.join(base, '2026', '2026-4889', 'Plans', 'Exécution')
  );

  assert.deepEqual(
    await controller.selectSubfolder(root, 'Plans'),
    { success: true, chemin: path.join('Plans', 'Exécution') }
  );
  assert.equal(dialogCalls[0].defaultPath, path.join(root, '2026', '2026-4889', 'Plans'));
  assert.deepEqual(dialogCalls[0].properties, ['openDirectory']);
});

test('a canceled subfolder dialog changes nothing', async t => {
  const { controller, root } = createController(t, null);

  assert.deepEqual(await controller.selectSubfolder(root, ''), { success: true, chemin: null });
});

test('a folder outside every project is refused', async t => {
  const { controller, root } = createController(t, base => path.join(base, '2026'));

  await assert.rejects(controller.selectSubfolder(root, ''), /situé dans un projet/);
});
