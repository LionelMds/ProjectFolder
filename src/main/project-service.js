'use strict';

const fs = require('fs');
const path = require('path');
const { assertRelativeSubfolderPath } = require('./config-store');

const FOUR_DIGITS = /^\d{4}$/;
const FULL_PROJECT_NUMBER = /^20\d{2}-\d{4}$/;

class ProjectService {
  constructor(getConfig, options = {}) {
    this.getConfig = getConfig;
    this.fs = options.fs || fs;
    this.path = options.path || path;
  }

  async resolveProjectInput(projectInput) {
    const value = String(projectInput || '').trim();

    if (FOUR_DIGITS.test(value)) {
      return this.findProjectByDigits(value);
    }

    if (!FULL_PROJECT_NUMBER.test(value)) {
      return null;
    }

    const config = this.getConfig();
    const projectPath = this.buildProjectPath(value);
    if (await this.isDirectory(projectPath)) {
      return {
        projectNumber: value,
        year: value.slice(0, 4),
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
    if (!rootDir || !(await this.isDirectory(rootDir))) {
      return null;
    }

    let entries;
    try {
      entries = await this.fs.promises.readdir(rootDir, { withFileTypes: true });
    } catch {
      return null;
    }

    const years = entries
      .filter(entry => entry.isDirectory() && /^20\d{2}$/.test(entry.name))
      .map(entry => entry.name)
      .sort((left, right) => right.localeCompare(left));

    for (const year of years) {
      const projectNumber = `${year}-${digits}`;
      const projectPath = this.path.join(rootDir, year, projectNumber);
      if (await this.isDirectory(projectPath)) {
        return { projectNumber, year, projectPath };
      }
    }

    return null;
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
