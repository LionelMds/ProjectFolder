'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  ConfigStore,
  assertRelativeSubfolderPath,
  createDefaultConfig,
  describeRootError,
  normalizeRootPath,
  validateSettingsInput,
  withFileLockRetry
} = require('../src/main/config-store');

test('legacy settings migrate to the current schema', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    racine: directory,
    sousDossiers: [{ nom: 'Racine', chemin: '', raccourci: 'Enter', icone: 'F' }],
    raccourciGlobal: 'CommandOrControl+Shift+L',
    autoStart: true,
    reuseExplorerWindow: true,
    miniBar: { enabled: false }
  }));

  const store = new ConfigStore(configPath, { platform: 'win32' });
  const config = store.load();

  assert.equal(config.schemaVersion, 4);
  assert.equal(config.sousDossiers[0].icone, 'folder');
  assert.equal(config.integrationMode, 'hidden');
  assert.equal(config.openBehavior, 'reuseWindow');
  assert.equal(config.autoStart, true);
  assert.equal(config.reuseExplorerWindow, undefined);
  assert.equal(config.updates.lastNotifiedVersion, null);
});

// OneDrive reinstalled elsewhere: once the new root is saved, the recents
// must stop opening the folders of the old one.
test('recent folders follow a root that moved', t => {
  const directory = createTempDirectory(t);
  const oldRoot = path.join(directory, 'OneDrive - Ancien', 'Projets');
  const newRoot = path.join(directory, 'CloudStorage', 'OneDrive-Nouveau', 'Projets');
  fs.mkdirSync(newRoot, { recursive: true });
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    ...createDefaultConfig(),
    racine: oldRoot,
    recentFolders: [
      {
        projectNumber: '2026-4889',
        subfolderName: 'Plans',
        subfolderPath: 'Plans\\Exécution',
        folderPath: path.join(oldRoot, '2026', '2026-4889', 'Plans', 'Exécution'),
        openedAt: 2000
      },
      { projectNumber: '', folderPath: path.join(directory, 'Ailleurs'), openedAt: 1000 }
    ]
  }));
  const store = new ConfigStore(configPath, { platform: 'win32' });
  const before = store.load().recentFolders;

  store.applySettings({ ...store.config, racine: newRoot });

  const [project, other] = store.config.recentFolders;
  assert.equal(project.folderPath, path.join(newRoot, '2026', '2026-4889', 'Plans', 'Exécution'));
  assert.notEqual(project.id, before[0].id);
  assert.equal(other.folderPath, path.join(directory, 'Ailleurs'));
  assert.equal(
    JSON.parse(fs.readFileSync(configPath, 'utf8')).recentFolders[0].folderPath,
    project.folderPath
  );
});

test('a root saved by an earlier version rebases its stale recents at startup', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    ...createDefaultConfig(),
    racine: directory,
    recentFolders: [{
      id: 'stale',
      projectNumber: '2025-0042',
      subfolderPath: '',
      folderPath: '/Users/lionel/OneDrive - Ancien/Projets/2025/2025-0042',
      openedAt: 1000
    }]
  }));

  const [recent] = new ConfigStore(configPath, { platform: 'win32' }).load().recentFolders;

  assert.equal(recent.folderPath, path.join(directory, '2025', '2025-0042'));
  assert.notEqual(recent.id, 'stale');
});

test('a typed root is cleaned up and its errors tell missing from refused', t => {
  const directory = createTempDirectory(t);

  assert.equal(normalizeRootPath(`  "${directory}"  `), directory);
  assert.equal(normalizeRootPath('~'), os.homedir());
  assert.equal(normalizeRootPath('~/Library/CloudStorage'), path.join(os.homedir(), 'Library', 'CloudStorage'));
  assert.equal(validateSettingsInput({ ...createDefaultConfig(), racine: `"${directory}"` }).racine, directory);

  const missing = path.join(directory, 'absent');
  assert.throws(
    () => validateSettingsInput({ ...createDefaultConfig(), racine: missing }),
    error => error.message === `Le dossier racine n'existe pas : ${missing}`
  );
  assert.match(
    describeRootError('/Users/lionel/Library/CloudStorage/OneDrive-X', { code: 'EPERM' }, 'darwin'),
    /macOS refuse l'accès .*Confidentialité et sécurité/
  );
  assert.match(describeRootError('P:\\Projets', { code: 'EACCES' }, 'win32'), /^Accès refusé/);
});

test('the last notified update version is sanitized and persisted', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  const store = new ConfigStore(configPath, { platform: 'win32' });
  store.load();

  store.update(config => {
    config.updates.lastNotifiedVersion = '1.5.0';
  });

  assert.equal(store.config.updates.lastNotifiedVersion, '1.5.0');
  assert.equal(
    JSON.parse(fs.readFileSync(configPath, 'utf8')).updates.lastNotifiedVersion,
    '1.5.0'
  );
});

test('configuration writes keep a valid backup and commit atomically', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  const store = new ConfigStore(configPath, { platform: 'win32' });
  store.config = {
    ...createDefaultConfig(),
    racine: directory
  };
  store.save();
  store.update(config => {
    config.autoStart = true;
  });

  const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const backup = JSON.parse(fs.readFileSync(`${configPath}.bak`, 'utf8'));
  assert.equal(current.autoStart, true);
  assert.equal(backup.autoStart, false);
});

test('a corrupt primary configuration is recovered from backup', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  const backupConfig = {
    ...createDefaultConfig(),
    racine: directory,
    autoStart: true
  };
  fs.writeFileSync(`${configPath}.bak`, JSON.stringify(backupConfig));
  fs.writeFileSync(configPath, '{not-json');

  const store = new ConfigStore(configPath, { platform: 'win32' });
  const config = store.load();

  assert.equal(config.autoStart, true);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(configPath, 'utf8')));
  assert.ok(
    fs.readdirSync(directory).some(fileName => fileName.includes('.corrupt-'))
  );
});

test('a missing primary configuration is recovered from backup', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(`${configPath}.bak`, JSON.stringify({
    ...createDefaultConfig(),
    racine: directory,
    autoStart: true
  }));

  const config = new ConfigStore(configPath, { platform: 'win32' }).load();

  assert.equal(config.autoStart, true);
  assert.equal(config.racine, directory);
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).autoStart, true);
});

test('saving never removes the current configuration file', t => {
  const directory = createTempDirectory(t);
  const configPath = path.join(directory, 'config.json');
  const store = new ConfigStore(configPath, { platform: 'win32' });
  store.load();
  const originalRename = fs.renameSync;
  const observed = [];
  t.after(() => {
    fs.renameSync = originalRename;
  });
  fs.renameSync = (from, to) => {
    observed.push(fs.existsSync(configPath));
    return originalRename(from, to);
  };

  store.update(config => {
    config.autoStart = true;
  });

  assert.deepEqual(observed, [true]);
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    ['config.json', 'config.json.bak']
  );
});

test('transient file locks are retried, other errors are not', () => {
  let attempts = 0;
  const result = withFileLockRetry(() => {
    attempts += 1;
    if (attempts < 3) {
      throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    }
    return 'saved';
  }, [1, 1, 1]);
  assert.equal(result, 'saved');
  assert.equal(attempts, 3);

  let missingAttempts = 0;
  assert.throws(() => withFileLockRetry(() => {
    missingAttempts += 1;
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }, [1, 1, 1]), /missing/);
  assert.equal(missingAttempts, 1);
});

test('a subfolder shortcut can only be assigned once', t => {
  const directory = createTempDirectory(t);
  const sousDossiers = [
    { nom: 'Plans', chemin: 'Plans', raccourci: 'Ctrl+Enter' },
    { nom: 'Devis', chemin: 'Devis', raccourci: 'Ctrl+Enter' }
  ];

  assert.throws(
    () => validateSettingsInput({ ...createDefaultConfig(), racine: directory, sousDossiers }),
    /Ctrl\+Enter est attribué à « Plans » et à « Devis »/
  );
});

test('subfolder paths cannot escape the project root', () => {
  assert.doesNotThrow(() => assertRelativeSubfolderPath('Plans\\Execution'));
  assert.throws(
    () => assertRelativeSubfolderPath('..\\Secrets'),
    /sortir du projet/
  );
  assert.throws(
    () => assertRelativeSubfolderPath('C:\\Windows'),
    /relatif/
  );
});

test('settings reject unknown integration and opening modes', t => {
  const directory = createTempDirectory(t);
  const base = {
    ...createDefaultConfig(),
    racine: directory
  };

  assert.throws(
    () => validateSettingsInput({ ...base, integrationMode: 'external' }),
    /intégration/
  );
  assert.throws(
    () => validateSettingsInput({ ...base, openBehavior: 'execute' }),
    /ouverture/
  );
});

function createTempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pfl-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
