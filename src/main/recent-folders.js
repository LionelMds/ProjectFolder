'use strict';

const crypto = require('crypto');
const path = require('path');
const { RECENT_FOLDERS_LIMIT } = require('./constants');

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
  rememberRecentFolder
};
