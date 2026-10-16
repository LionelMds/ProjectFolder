'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');
const {
  createRecentFolderId,
  normalizeRecentFolders,
  projectFolderPath,
  rebaseRecentFolders,
  rememberRecentFolder
} = require('../src/main/recent-folders');

test('project recents are rebuilt under the current root', () => {
  const root = path.resolve('/Nouveau/Projets');
  const entries = [
    { projectNumber: '2026-4889', subfolderPath: 'Plans/Exécution', folderPath: path.resolve('/Ancien/Projets/2026/2026-4889/Plans/Exécution'), openedAt: 3 },
    // The same folder already reopened under the new root: one entry stays.
    { projectNumber: '2026-4889', subfolderPath: 'Plans\\Exécution', folderPath: path.join(root, '2026', '2026-4889', 'Plans', 'Exécution'), openedAt: 2 },
    { projectNumber: '2025-0042', subfolderPath: '..\\..\\Secrets', folderPath: path.resolve('/Ancien/x'), openedAt: 1 },
    { projectNumber: '', folderPath: path.resolve('/Ailleurs'), openedAt: 0.5 }
  ];

  const rebased = rebaseRecentFolders(entries, root);

  assert.deepEqual(rebased.map(entry => entry.folderPath), [
    path.join(root, '2026', '2026-4889', 'Plans', 'Exécution'),
    path.resolve('/Ancien/x'),
    path.resolve('/Ailleurs')
  ]);
  assert.equal(rebased[0].openedAt, 3);
  assert.deepEqual(rebaseRecentFolders(rebased, root), rebased);
  assert.equal(rebaseRecentFolders(entries, '').length, 4);
  assert.equal(projectFolderPath(root, '2026-4889', ''), path.join(root, '2026', '2026-4889'));
  assert.equal(projectFolderPath(root, '2026-4889', 'C:\\Windows'), null);
  assert.equal(projectFolderPath(root, '4889', ''), null);
});

test('Windows recent IDs are case-insensitive', () => {
  assert.equal(
    createRecentFolderId('C:\\Projects\\2026-1234', 'win32'),
    createRecentFolderId('c:\\projects\\2026-1234', 'win32')
  );
});

test('macOS recent IDs preserve case-sensitive paths', () => {
  assert.notEqual(
    createRecentFolderId('/Users/lionel/Project', 'darwin'),
    createRecentFolderId('/Users/lionel/project', 'darwin')
  );
});

test('remembering a folder deduplicates and moves it to the front', () => {
  const first = {
    projectNumber: '2026-1234',
    folderPath: 'C:\\Projects\\2026-1234'
  };
  const second = {
    projectNumber: '2026-5678',
    folderPath: 'C:\\Projects\\2026-5678'
  };

  let entries = rememberRecentFolder([], first, { platform: 'win32' });
  entries = rememberRecentFolder(entries, second, { platform: 'win32' });
  entries = rememberRecentFolder(entries, first, { platform: 'win32' });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].projectNumber, '2026-1234');
  assert.equal(normalizeRecentFolders(entries).length, 2);
});
