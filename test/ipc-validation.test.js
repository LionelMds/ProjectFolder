'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateMiniLayout,
  validateOpenBehavior,
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
  assert.deepEqual(
    validateMiniLayout({ barWidth: 9999, collapsedWidth: 10, panelWidth: 480, panelHeight: 0 }),
    { barWidth: 640, barHeight: 40, collapsedWidth: 160, panelWidth: 0, panelHeight: 0 }
  );
  assert.equal(validateOpenBehavior(undefined), null);
  assert.equal(validateOpenBehavior('reuseWindow'), 'reuseWindow');
  assert.throws(() => validateOpenBehavior('execute'), /ouverture/);
  assert.equal(validateRecentId('0123456789abcdef'), '0123456789abcdef');
  assert.throws(() => validateRecentId('../../config'), /invalide/);
});
