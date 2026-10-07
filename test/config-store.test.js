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

  assert.equal(config.schemaVersion, 3);
  assert.equal(config.integrationMode, 'hidden');
  assert.equal(config.openBehavior, 'reuseWindow');
  assert.equal(config.autoStart, true);
  assert.equal(config.reuseExplorerWindow, undefined);
  assert.equal(config.updates.lastNotifiedVersion, null);
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
