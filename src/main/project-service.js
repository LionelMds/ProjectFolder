'use strict';

const fs = require('fs');
const path = require('path');
const { assertRelativeSubfolderPath } = require('./config-store');

const FOUR_DIGITS = /^\d{4}$/;
const FULL_PROJECT_NUMBER = /^20\d{2}-\d{4}$/;
// Typing validates a project, then opening it resolves it again: reusing the
// answer avoids repeating network round trips on a mapped share.
const RESOLUTION_CACHE_TTL_MS = 30 * 1000;

class ProjectService {
  constructor(getConfig, options = {}) {
    this.getConfig = getConfig;
    this.fs = options.fs || fs;
    this.path = options.path || path;
    this.now = options.now || Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? RESOLUTION_CACHE_TTL_MS;
    this.cache = new Map();
  }

  async resolveProjectInput(projectInput) {
    const value = String(projectInput || '').trim();
    if (!FOUR_DIGITS.test(value) && !FULL_PROJECT_NUMBER.test(value)) {
      return null;
    }

    const cacheKey = this.getCacheKey(value);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) {
      return { ...cached.project };
    }
    this.cache.delete(cacheKey);

    const project = FOUR_DIGITS.test(value)
      ? await this.findProjectByDigits(value)
      : await this.findProjectByNumber(value);

    // Only hits are cached so a project folder created meanwhile is found.
    if (project) {
      this.cache.set(cacheKey, {
        project: { ...project },
        expiresAt: this.now() + this.cacheTtlMs
      });
    }
    return project;
  }

  forgetProject(projectInput) {
    this.cache.delete(this.getCacheKey(String(projectInput || '').trim()));
  }

  getCacheKey(value) {
    return `${String(this.getConfig().racine || '').trim()}|${value}`;
  }

  async findProjectByNumber(projectNumber) {
    if (!String(this.getConfig().racine || '').trim()) {
      return null;
    }

    const projectPath = this.buildProjectPath(projectNumber);
    if (await this.isDirectory(projectPath)) {
      return {
        projectNumber,
        year: projectNumber.slice(0, 4),
        projectPath
      };
    }

    return null;
  }

  async findProjectByDigits(digits) {
    if (!FOUR_DIGITS.test(String(digits || ''))) {
      return null;
    }

    const config = this.getConfig();
    const rootDir = String(config.racine || '').trim();
    if (!rootDir) {
      return null;
    }

    let entries;
    try {
      entries = await this.fs.promises.readdir(rootDir, { withFileTypes: true });
    } catch {
      return null;
    }

    const candidates = entries
      .filter(entry => entry.isDirectory() && /^20\d{2}$/.test(entry.name))
      .map(entry => entry.name)
      .sort((left, right) => right.localeCompare(left))
      .map(year => ({
        projectNumber: `${year}-${digits}`,
        year,
        projectPath: this.path.join(rootDir, year, `${year}-${digits}`)
      }));

    // All years are checked at once: one round trip instead of one per year.
    const found = await Promise.all(
      candidates.map(candidate => this.isDirectory(candidate.projectPath))
    );
    const newestIndex = found.indexOf(true);
    return newestIndex >= 0 ? candidates[newestIndex] : null;
  }

  buildProjectPath(projectNumber, subfolderPath = '') {
    if (!FULL_PROJECT_NUMBER.test(String(projectNumber || ''))) {
      throw new Error('Numéro de projet invalide.');
    }

    const config = this.getConfig();
    const rootDir = this.path.resolve(String(config.racine || ''));
    const year = projectNumber.slice(0, 4);
    const projectRoot = this.path.resolve(rootDir, year, projectNumber);
    const requestedSubfolder = String(subfolderPath || '').trim();

    assertRelativeSubfolderPath(requestedSubfolder);
    const fullPath = requestedSubfolder
      ? this.path.resolve(projectRoot, requestedSubfolder.replace(/[\\/]+/g, this.path.sep))
      : projectRoot;

    if (!isPathInside(projectRoot, fullPath, this.path)) {
      throw new Error('Le chemin demandé sort du dossier projet.');
    }

    return fullPath;
  }

  async isDirectory(targetPath) {
    try {
      return (await this.fs.promises.stat(targetPath)).isDirectory();
    } catch {
      return false;
    }
  }
}

function isPathInside(parentPath, childPath, pathApi = path) {
  const relative = pathApi.relative(parentPath, childPath);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${pathApi.sep}`)
    && !pathApi.isAbsolute(relative)
  );
}

module.exports = {
  FOUR_DIGITS,
  FULL_PROJECT_NUMBER,
  ProjectService,
  isPathInside
};
