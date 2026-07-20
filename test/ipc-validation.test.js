'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateMiniWidth,
  validateProjectInput,
  validateRecentId,
  validateSubfolderIndex
} = require('../src/main/ipc-validation');

test('IPC values are normalized or rejected at the main-process boundary', () => {
  assert.equal(validateProjectInput(' 4889 '), '4889');
  assert.equal(validateProjectInput('2026-4889'), '2026-4889');
  assert.throws(() => validateProjectInput('../4889'), /format/);
  assert.equal(validateSubfolderIndex(2, 3), 2);
  assert.throws(() => validateSubfolderIndex(3, 3), /invalide/);
  assert.equal(validateMiniWidth(9999), 520);
  assert.equal(validateRecentId('0123456789abcdef'), '0123456789abcdef');
  assert.throws(() => validateRecentId('../../config'), /invalide/);
});
