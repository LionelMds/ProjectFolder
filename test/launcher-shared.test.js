'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  acceleratorFromKeyboardEvent,
  defaultSubfolderIndex,
  formatAccelerator,
  resolveSubfolderIndex
} = require('../src/shared/launcher-shared');

const subfolders = [
  { nom: 'Dossier principal', raccourci: null },
  { nom: 'Plans', raccourci: 'Ctrl+Enter' },
  { nom: 'Fournisseurs', raccourci: 'Enter' },
  { nom: 'Devis', raccourci: 'Alt+Enter' },
  { nom: 'Photos', raccourci: 'Shift+Enter' }
];

function keyEvent(overrides) {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides
  };
}

test('every subfolder shortcut opens the subfolder bound to it', () => {
  assert.equal(resolveSubfolderIndex(keyEvent({ ctrlKey: true }), subfolders, 0), 1);
  assert.equal(resolveSubfolderIndex(keyEvent({ metaKey: true }), subfolders, 0), 1);
  assert.equal(resolveSubfolderIndex(keyEvent({ shiftKey: true }), subfolders, 0), 4);
  assert.equal(resolveSubfolderIndex(keyEvent({ altKey: true }), subfolders, 0), 3);
});

test('plain Enter opens the selection, which starts on the Enter subfolder', () => {
  assert.equal(defaultSubfolderIndex(subfolders), 2);
  assert.equal(resolveSubfolderIndex(keyEvent({}), subfolders, 2), 2);
  assert.equal(resolveSubfolderIndex(keyEvent({}), subfolders, 4), 4);
  assert.equal(defaultSubfolderIndex([{ raccourci: null }, { raccourci: 'Ctrl+Enter' }]), 0);
});

test('an unassigned modified Enter falls back to the selection', () => {
  const withoutAlt = subfolders.filter(subfolder => subfolder.raccourci !== 'Alt+Enter');
  assert.equal(resolveSubfolderIndex(keyEvent({ altKey: true }), withoutAlt, 2), 2);
});

test('global shortcuts use the digit key, not the character Shift produces', () => {
  // Swiss French keyboard: Shift+1 types "+".
  const capture = acceleratorFromKeyboardEvent(
    keyEvent({ key: '+', code: 'Digit1', ctrlKey: true, shiftKey: true }),
    false
  );
  assert.deepEqual(capture, { accelerator: 'CommandOrControl+Shift+1' });
});

test('global shortcut letters follow the keyboard layout', () => {
  // QWERTZ: the key labelled Z sits where QWERTY has Y.
  assert.deepEqual(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'z', code: 'KeyY', ctrlKey: true, altKey: true }), false),
    { accelerator: 'CommandOrControl+Alt+Z' }
  );
  // macOS Option changes the character: the physical key is used instead.
  assert.deepEqual(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'π', code: 'KeyP', metaKey: true, altKey: true }), true),
    { accelerator: 'CommandOrControl+Alt+P' }
  );
});

test('global shortcuts map named keys and keep Control distinct on macOS', () => {
  assert.deepEqual(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true }), false),
    { accelerator: 'CommandOrControl+Up' }
  );
  assert.deepEqual(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'p', code: 'KeyP', ctrlKey: true, shiftKey: true }), true),
    { accelerator: 'Control+Shift+P' }
  );
  assert.deepEqual(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'F13', code: 'F13' }), false),
    { accelerator: 'F13' }
  );
});

test('incomplete or unusable global shortcuts are not accepted', () => {
  assert.deepEqual(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), false),
    { pending: true }
  );
  assert.match(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'P', code: 'KeyP', shiftKey: true }), false).error,
    /Ctrl ou Alt/
  );
  assert.ok(
    acceleratorFromKeyboardEvent(keyEvent({ key: 'è', code: 'BracketLeft', ctrlKey: true }), false).error
  );
});

test('accelerators are displayed with platform modifier names', () => {
  assert.equal(formatAccelerator('CommandOrControl+Shift+P', false), 'Ctrl+Shift+P');
  assert.equal(formatAccelerator('CommandOrControl+Shift+P', true), 'Cmd+Shift+P');
  assert.equal(formatAccelerator('Control+Alt+K', true), 'Ctrl+Alt+K');
  assert.equal(formatAccelerator('Super+Shift+P', false), 'Win+Shift+P');
});

test('popup key glyphs and shortcut chips follow the platform', () => {
  const { formatKeyGlyph, formatAcceleratorChip } = require('../src/shared/launcher-shared');
  assert.equal(formatKeyGlyph('Ctrl+Enter', false), 'Ctrl+↵');
  assert.equal(formatKeyGlyph('Shift+Enter', true), '⇧↵');
  assert.equal(formatKeyGlyph(null, false), '—');
  assert.equal(formatAcceleratorChip('CommandOrControl+Shift+P', false), 'Ctrl+Shift+P');
  assert.equal(formatAcceleratorChip('CommandOrControl+Shift+P', true), '⇧⌘P');
});

test('former emoji icons become Lucide icons', () => {
  const { iconNameFor } = require('../src/shared/launcher-shared');
  const { hasIcon } = require('../src/shared/icons');
  assert.equal(iconNameFor('📐', hasIcon), 'ruler');
  assert.equal(iconNameFor('⚙️', hasIcon), 'settings');
  assert.equal(iconNameFor('⚙', hasIcon), 'settings');
  assert.equal(iconNameFor('factory', hasIcon), 'factory');
  assert.equal(iconNameFor('🦄', hasIcon), 'folder');
});

test('recents show their age, matches and configured subfolder', () => {
  const { formatRelativeTime, splitMatch, findRecentSubfolderIndex, formatRecentLabel } = require('../src/shared/launcher-shared');
  const now = Date.UTC(2026, 9, 8, 12);
  assert.equal(formatRelativeTime(now - 2 * 3600 * 1000, now), 'il y a 2 h');
  assert.equal(formatRelativeTime(now - 30 * 1000, now), 'à l’instant');
  assert.deepEqual(splitMatch('2026-4889', '48'), [
    { text: '2026-', match: false },
    { text: '48', match: true },
    { text: '89', match: false }
  ]);
  const recent = { projectNumber: '2026-4889', subfolderName: 'Plans', subfolderPath: 'Plans/Plan d’exécution' };
  assert.equal(findRecentSubfolderIndex(recent, [{ chemin: '' }, { chemin: 'plans\\Plan d’exécution' }]), 1);
  assert.equal(formatRecentLabel(recent), '2026-4889 · Plans');
});
