'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createRecentFolderId,
  normalizeRecentFolders,
  rememberRecentFolder
} = require('../src/main/recent-folders');

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
