'use strict';

const crypto = require('crypto');
const path = require('path');
const { RECENT_FOLDERS_LIMIT } = require('./constants');

const FULL_PROJECT_NUMBER = /^20\d{2}-\d{4}$/;

function createRecentFolderId(folderPath, platform = process.platform) {
  const normalizedPath = path.normalize(String(folderPath || ''));
  const identity = platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;

  return crypto
    .createHash('sha256')
    .update(identity)
    .digest('hex')
    .slice(0, 16);
}

function normalizeRecentFolder(entry, platform = process.platform) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const folderPath = String(entry.folderPath || '').trim();
  if (!folderPath) {
    return null;
  }

  const projectNumber = String(entry.projectNumber || '').trim();
  const openedAt = Number(entry.openedAt || Date.now());

  return {
    id: String(entry.id || createRecentFolderId(folderPath, platform)),
    projectNumber,
    digits: String(entry.digits || projectNumber.slice(-4)).trim(),
    subfolderName: String(entry.subfolderName || '').trim(),
    subfolderPath: String(entry.subfolderPath || '').trim(),
    folderPath,
    openedAt: Number.isFinite(openedAt) ? openedAt : Date.now()
  };
}

function normalizeRecentFolders(entries, options = {}) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const platform = options.platform || process.platform;
  const limit = options.limit || RECENT_FOLDERS_LIMIT;
  const deduped = new Map();

  for (const entry of entries) {
    const normalized = normalizeRecentFolder(entry, platform);
    if (!normalized) {
      continue;
    }

    const existing = deduped.get(normalized.id);
    if (!existing || normalized.openedAt > existing.openedAt) {
      deduped.set(normalized.id, normalized);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.openedAt - left.openedAt)
    .slice(0, limit);
}

// Folder of a project's subfolder under a root, or null when the entry does
// not describe one (older recents, a subfolder path leaving the project).
function projectFolderPath(root, projectNumber, subfolderPath) {
  const number = String(projectNumber || '').trim();
  if (!root || !FULL_PROJECT_NUMBER.test(number)) {
    return null;
  }

  const segments = String(subfolderPath || '').trim().split(/[\\/]+/).filter(Boolean);
  if (segments.some(segment => segment === '..' || /^[A-Za-z]:$/.test(segment))) {
    return null;
  }
  return path.join(root, number.slice(0, 4), number, ...segments);
}

// Recents remember the absolute folder they opened, but the root may move
// since (OneDrive reinstalled, share renamed): each project recent follows
// it, its path rebuilt from the project number and the subfolder.
function rebaseRecentFolders(entries, root, options = {}) {
  const rootDir = String(root || '').trim();
  if (!Array.isArray(entries) || !rootDir) {
    return normalizeRecentFolders(entries, options);
  }

  return normalizeRecentFolders(entries.map(entry => {
    const folderPath = entry && projectFolderPath(rootDir, entry.projectNumber, entry.subfolderPath);
    return folderPath && folderPath !== entry.folderPath
      ? { ...entry, id: undefined, folderPath }
      : entry;
  }), options);
}

function rememberRecentFolder(currentEntries, entry, options = {}) {
  const normalized = normalizeRecentFolder({
    ...entry,
    openedAt: Date.now()
  }, options.platform || process.platform);

  if (!normalized) {
    return normalizeRecentFolders(currentEntries, options);
  }

  const remaining = Array.isArray(currentEntries)
    ? currentEntries.filter(recent => recent && recent.id !== normalized.id)
    : [];

  return normalizeRecentFolders([normalized, ...remaining], options);
}

module.exports = {
  createRecentFolderId,
  normalizeRecentFolder,
  normalizeRecentFolders,
  projectFolderPath,
  rebaseRecentFolders,
  rememberRecentFolder
};
