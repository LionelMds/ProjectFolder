'use strict';

const fs = require('fs');
const path = require('path');
const {
  CONFIG_SCHEMA_VERSION,
  MAX_GLOBAL_SHORTCUT_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_RELATIVE_PATH_LENGTH,
  MAX_SUBFOLDERS,
  VALID_INTEGRATION_MODES,
  VALID_OPEN_BEHAVIORS,
  VALID_SUBFOLDER_SHORTCUTS
} = require('./constants');
const { normalizeRecentFolders } = require('./recent-folders');

function createDefaultConfig() {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    racine: '',
    sousDossiers: [
      { nom: 'Dossier principal', chemin: '', raccourci: 'Enter', icone: '📁' },
      { nom: "Plans d'exécution", chemin: "Plans\\Plan d'exécution", raccourci: 'Ctrl+Enter', icone: '📐' },
      { nom: 'Fournisseurs', chemin: 'Fournisseurs', raccourci: 'Shift+Enter', icone: '🏭' },
      { nom: 'Devis', chemin: 'Devis', raccourci: null, icone: '💰' }
    ],
    raccourciGlobal: 'CommandOrControl+Shift+P',
    autoStart: false,
    integrationMode: 'floating',
    openBehavior: 'newTab',
    recentFolders: [],
    updates: {
      lastNotifiedVersion: null
    },
    miniBar: {
      position: null,
      dockedPosition: null,
      dockedUseCustomPosition: false,
      lastVisibleIntegrationMode: 'floating'
    }
  };
}

function sanitizeSubfolder(entry, index = 0) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const fallbackName = index === 0 ? 'Dossier principal' : `Sous-dossier ${index + 1}`;
  const shortcut = VALID_SUBFOLDER_SHORTCUTS.includes(source.raccourci)
    ? source.raccourci
    : null;

  return {
    nom: truncate(String(source.nom || fallbackName).trim(), MAX_LABEL_LENGTH) || fallbackName,
    chemin: truncate(normalizeRelativePath(source.chemin), MAX_RELATIVE_PATH_LENGTH),
    raccourci: shortcut,
    icone: truncate(String(source.icone || '📁').trim(), 12) || '📁'
  };
}

function sanitizeSubfolders(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return createDefaultConfig().sousDossiers;
  }

  return entries
    .slice(0, MAX_SUBFOLDERS)
    .map((entry, index) => sanitizeSubfolder(entry, index));
}

function normalizePosition(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

function migrateConfig(rawConfig, platform = process.platform) {
  const defaults = createDefaultConfig();
  const source = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};
  const legacyMiniBar = source.miniBar && typeof source.miniBar === 'object'
    ? source.miniBar
    : {};
  const sourceUpdates = source.updates && typeof source.updates === 'object'
    ? source.updates
    : {};

  let integrationMode = source.integrationMode;
  if (!VALID_INTEGRATION_MODES.includes(integrationMode)) {
    integrationMode = legacyMiniBar.enabled === false ? 'hidden' : 'floating';
  }

  let openBehavior = source.openBehavior;
  if (!VALID_OPEN_BEHAVIORS.includes(openBehavior)) {
    if (source.reuseExplorerWindow === true) {
      openBehavior = 'reuseWindow';
    } else if (source.openInNewTab === true) {
      openBehavior = 'newTab';
    } else if (Object.prototype.hasOwnProperty.call(source, 'reuseExplorerWindow')) {
      openBehavior = 'newWindow';
    } else {
      openBehavior = defaults.openBehavior;
    }
  }

  const lastVisibleIntegrationMode = VALID_INTEGRATION_MODES.includes(legacyMiniBar.lastVisibleIntegrationMode)
    && legacyMiniBar.lastVisibleIntegrationMode !== 'hidden'
    ? legacyMiniBar.lastVisibleIntegrationMode
    : (integrationMode === 'hidden' ? 'floating' : integrationMode);

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    racine: String(source.racine || '').trim(),
    sousDossiers: sanitizeSubfolders(source.sousDossiers),
    raccourciGlobal: truncate(
      String(source.raccourciGlobal || defaults.raccourciGlobal).trim(),
      MAX_GLOBAL_SHORTCUT_LENGTH
    ) || defaults.raccourciGlobal,
    autoStart: Boolean(source.autoStart),
    integrationMode,
    openBehavior,
    recentFolders: normalizeRecentFolders(source.recentFolders, { platform }),
    updates: {
      lastNotifiedVersion: sanitizeVersion(sourceUpdates.lastNotifiedVersion)
    },
    miniBar: {
      position: normalizePosition(legacyMiniBar.position),
      dockedPosition: normalizePosition(legacyMiniBar.dockedPosition),
      dockedUseCustomPosition: Boolean(legacyMiniBar.dockedUseCustomPosition),
      lastVisibleIntegrationMode
    }
  };
}

function validateSettingsInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Configuration invalide.');
  }

  const root = String(input.racine || '').trim();
  if (root && !path.isAbsolute(root)) {
    throw new Error('Le dossier racine doit être un chemin absolu.');
  }

  if (root) {
    let stat;
    try {
      stat = fs.statSync(root);
    } catch {
      throw new Error("Le dossier racine n'existe pas ou n'est pas accessible.");
    }

    if (!stat.isDirectory()) {
      throw new Error('Le chemin racine doit désigner un dossier.');
    }
  }

  const rawSubfolders = Array.isArray(input.sousDossiers) ? input.sousDossiers : [];
  if (rawSubfolders.length === 0 || rawSubfolders.length > MAX_SUBFOLDERS) {
    throw new Error(`La configuration doit contenir entre 1 et ${MAX_SUBFOLDERS} sous-dossiers.`);
  }

  const sousDossiers = rawSubfolders.map((entry, index) => {
    const subfolder = sanitizeSubfolder(entry, index);
    assertRelativeSubfolderPath(subfolder.chemin);
    return subfolder;
  });

  if (!VALID_INTEGRATION_MODES.includes(input.integrationMode)) {
    throw new Error("Le mode d'intégration est invalide.");
  }

  if (!VALID_OPEN_BEHAVIORS.includes(input.openBehavior)) {
    throw new Error("Le comportement d'ouverture est invalide.");
  }

  const integrationMode = input.integrationMode;
  const openBehavior = input.openBehavior;
  const raccourciGlobal = truncate(
    String(input.raccourciGlobal || 'CommandOrControl+Shift+P').trim(),
    MAX_GLOBAL_SHORTCUT_LENGTH
  );

  if (!raccourciGlobal) {
    throw new Error('Le raccourci global ne peut pas être vide.');
  }

  return {
    racine: root,
    sousDossiers,
    raccourciGlobal,
    autoStart: Boolean(input.autoStart),
    integrationMode,
    openBehavior
  };
}

function assertRelativeSubfolderPath(value) {
  const normalized = normalizeRelativePath(value);
  if (!normalized) {
    return;
  }

  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Le sous-dossier doit être relatif: ${value}`);
  }

  const segments = normalized.split(/[\\/]+/);
  if (segments.some(segment => segment === '..')) {
    throw new Error(`Le sous-dossier ne peut pas sortir du projet: ${value}`);
  }
}

function normalizeRelativePath(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/]+/g, path.sep)
    .replace(/^\.[\\/]/, '');
}

function truncate(value, maxLength) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function sanitizeVersion(value) {
  const version = String(value || '').trim();
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
    ? truncate(version, 64)
    : null;
}

class ConfigStore {
  constructor(configPath, options = {}) {
    this.configPath = configPath;
    this.backupPath = `${configPath}.bak`;
    this.platform = options.platform || process.platform;
    this.logger = options.logger || null;
    this.config = createDefaultConfig();
  }

  load() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const loaded = this.readConfigFile(this.configPath);

    if (loaded.ok) {
      this.config = migrateConfig(loaded.value, this.platform);
      if (JSON.stringify(loaded.value) !== JSON.stringify(this.config)) {
        this.save();
        this.log('info', 'Configuration migrated', {
          schemaVersion: this.config.schemaVersion,
          integrationMode: this.config.integrationMode,
          openBehavior: this.config.openBehavior
        });
      }
      return this.config;
    }

    if (loaded.error) {
      this.preserveCorruptConfig(loaded.error);
      const backup = this.readConfigFile(this.backupPath);
      if (backup.ok) {
        this.config = migrateConfig(backup.value, this.platform);
        this.save();
        this.log('warn', 'Configuration restored from backup');
        return this.config;
      }
    }

    this.config = createDefaultConfig();
    this.save();
    this.log('info', 'Default configuration created');
    return this.config;
  }

  readConfigFile(targetPath) {
    try {
      if (!fs.existsSync(targetPath)) {
        return { ok: false, error: null };
      }

      return {
        ok: true,
        value: JSON.parse(fs.readFileSync(targetPath, 'utf8'))
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  save() {
    this.writeConfig(this.config);
  }

  writeConfig(nextConfig) {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const serialized = `${JSON.stringify(nextConfig, null, 2)}\n`;
    const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    let descriptor = null;
    let movedCurrentToBackup = false;

    try {
      descriptor = fs.openSync(tempPath, 'w', 0o600);
      fs.writeFileSync(descriptor, serialized, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = null;

      if (fs.existsSync(this.configPath)) {
        fs.rmSync(this.backupPath, { force: true });
        fs.renameSync(this.configPath, this.backupPath);
        movedCurrentToBackup = true;
      }

      fs.renameSync(tempPath, this.configPath);
    } catch (error) {
      if (descriptor !== null) {
        fs.closeSync(descriptor);
      }
      fs.rmSync(tempPath, { force: true });

      if (
        movedCurrentToBackup
        && !fs.existsSync(this.configPath)
        && fs.existsSync(this.backupPath)
      ) {
        fs.renameSync(this.backupPath, this.configPath);
      }

      throw error;
    }
  }

  update(mutator) {
    const draft = JSON.parse(JSON.stringify(this.config));
    mutator(draft);
    const nextConfig = migrateConfig(draft, this.platform);
    this.writeConfig(nextConfig);
    this.config = nextConfig;
    return this.config;
  }

  applySettings(input) {
    const settings = validateSettingsInput(input);
    const nextConfig = migrateConfig({
      ...this.config,
      ...settings,
      miniBar: {
        ...this.config.miniBar,
        lastVisibleIntegrationMode: settings.integrationMode === 'hidden'
          ? this.config.miniBar.lastVisibleIntegrationMode
          : settings.integrationMode
      }
    }, this.platform);
    this.writeConfig(nextConfig);
    this.config = nextConfig;
    return this.config;
  }

  preserveCorruptConfig(error) {
    if (!fs.existsSync(this.configPath)) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptPath = `${this.configPath}.corrupt-${timestamp}`;

    try {
      fs.renameSync(this.configPath, corruptPath);
      this.log('error', 'Corrupt configuration preserved', {
        error: error.message,
        corruptFile: path.basename(corruptPath)
      });
    } catch (preserveError) {
      this.log('error', 'Unable to preserve corrupt configuration', {
        error: preserveError.message
      });
    }
  }

  log(level, message, details = null) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message, details);
    }
  }
}

module.exports = {
  ConfigStore,
  assertRelativeSubfolderPath,
  createDefaultConfig,
  migrateConfig,
  normalizePosition,
  sanitizeSubfolder,
  sanitizeSubfolders,
  validateSettingsInput
};
