'use strict';

const fs = require('fs');
const path = require('path');
const { assertRelativeSubfolderPath } = require('./config-store');

const FOUR_DIGITS = /^\d{4}$/;
const FULL_PROJECT_NUMBER = /^20\d{2}-\d{4}$/;
const YEAR_FOLDER = /^20\d{2}$/;
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

  // Year folders of the root, newest first.
  async listYears(rootDir = this.getConfig().racine) {
    const root = String(rootDir || '').trim();
    if (!root) {
      return [];
    }

    try {
      const entries = await this.fs.promises.readdir(root, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory() && YEAR_FOLDER.test(entry.name))
        .map(entry => entry.name)
        .sort((left, right) => right.localeCompare(left));
    } catch {
      return [];
    }
  }

  async listProjectsOfYear(rootDir, year) {
    try {
      const entries = await this.fs.promises.readdir(this.path.join(rootDir, year), { withFileTypes: true });
      const pattern = new RegExp(`^${year}-\\d{4}$`);
      return entries
        .filter(entry => entry.isDirectory() && pattern.test(entry.name))
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  // Closest existing project numbers, for the "not found" suggestions.
  async findNearestProjects(digits, limit = 2) {
    if (!FOUR_DIGITS.test(String(digits || ''))) {
      return [];
    }

    const root = String(this.getConfig().racine || '').trim();
    const years = await this.listYears(root);
    const perYear = await Promise.all(years.map(year => this.listProjectsOfYear(root, year)));
    const target = Number(digits);

    return perYear
      .flat()
      .map(projectNumber => ({
        projectNumber,
        year: projectNumber.slice(0, 4),
        distance: Math.abs(Number(projectNumber.slice(5)) - target)
      }))
      .filter(project => project.distance > 0)
      .sort((left, right) => left.distance - right.distance || right.year.localeCompare(left.year))
      .slice(0, limit)
      .map(({ projectNumber, year }) => ({ projectNumber, year }));
  }

  // Years and project counts under a candidate root, shown in the settings.
  async inspectRoot(rootDir) {
    const root = String(rootDir || '').trim();
    if (!root || !this.path.isAbsolute(root) || !(await this.isDirectory(root))) {
      return { exists: false, years: [] };
    }

    const years = await this.listYears(root);
    const counts = await Promise.all(years.map(year => this.listProjectsOfYear(root, year)));
    return {
      exists: true,
      years: years.map((year, index) => ({ year, projects: counts[index].length }))
    };
  }

  async findProjectByDigits(digits) {
    if (!FOUR_DIGITS.test(String(digits || ''))) {
      return null;
    }

    const rootDir = String(this.getConfig().racine || '').trim();
    const candidates = (await this.listYears(rootDir))
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
