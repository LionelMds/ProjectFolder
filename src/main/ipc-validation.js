'use strict';

const { validateSettingsInput } = require('./config-store');
const { FOUR_DIGITS, FULL_PROJECT_NUMBER } = require('./project-service');
const {
  MAX_GLOBAL_SHORTCUT_LENGTH,
  MINI_BAR_HEIGHT,
  MINI_BASE_WIDTH,
  MINI_FRAME_MARGIN,
  MINI_MAX_PANEL_HEIGHT,
  MINI_MAX_WIDTH,
  VALID_OPEN_BEHAVIORS
} = require('./constants');
const { clamp } = require('./window-bounds');

function validateProjectInput(value) {
  const projectInput = String(value || '').trim();
  if (!FOUR_DIGITS.test(projectInput) && !FULL_PROJECT_NUMBER.test(projectInput)) {
    throw new Error('Le numéro de projet doit contenir 4 chiffres ou respecter le format 20XX-XXXX.');
  }

  return projectInput;
}

function validateSubfolderIndex(value, subfolderCount) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= subfolderCount) {
    throw new Error('Sous-dossier invalide.');
  }

  return index;
}

function validateRecentId(value) {
  const recentId = String(value || '');
  if (!/^[a-f0-9]{16}$/i.test(recentId)) {
    throw new Error('Identifiant de dossier récent invalide.');
  }

  return recentId;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} invalide.`);
  }
  return Math.round(number);
}

// Size of the mini bar content, measured by its renderer (window margins
// excluded). A panel of 0 × 0 means the drop-down pane is closed.
function validateMiniLayout(value) {
  const source = value && typeof value === 'object' ? value : {};
  const maxContentWidth = MINI_MAX_WIDTH - (MINI_FRAME_MARGIN * 2);
  const minContentWidth = MINI_BASE_WIDTH - (MINI_FRAME_MARGIN * 2);
  const panelWidth = clamp(finiteNumber(source.panelWidth ?? 0, 'Largeur du volet'), 0, maxContentWidth);
  const panelHeight = clamp(finiteNumber(source.panelHeight ?? 0, 'Hauteur du volet'), 0, MINI_MAX_PANEL_HEIGHT);

  return {
    barWidth: clamp(finiteNumber(source.barWidth, 'Largeur de mini-barre'), minContentWidth, maxContentWidth),
    // Taller than the bar only for the macOS menu bar popover.
    barHeight: clamp(
      finiteNumber(source.barHeight ?? MINI_BAR_HEIGHT, 'Hauteur de mini-barre'),
      MINI_BAR_HEIGHT,
      MINI_BAR_HEIGHT + MINI_MAX_PANEL_HEIGHT
    ),
    collapsedWidth: clamp(finiteNumber(source.collapsedWidth ?? source.barWidth, 'Largeur de mini-barre'), minContentWidth, maxContentWidth),
    panelWidth: panelWidth > 0 && panelHeight > 0 ? panelWidth : 0,
    panelHeight: panelWidth > 0 && panelHeight > 0 ? panelHeight : 0
  };
}

// The open mode chosen in the popup for one opening; null keeps the default.
function validateOpenBehavior(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (!VALID_OPEN_BEHAVIORS.includes(value)) {
    throw new Error("Mode d'ouverture invalide.");
  }
  return value;
}

function validateRootCandidate(value) {
  const root = String(value || '').trim();
  if (!root || root.length > 1000 || /[\r\n\0]/.test(root)) {
    throw new Error('Dossier racine invalide.');
  }
  return root;
}

function validateGlobalShortcut(value) {
  const shortcut = String(value || '').trim();
  if (!shortcut || shortcut.length > MAX_GLOBAL_SHORTCUT_LENGTH) {
    throw new Error('Raccourci global invalide.');
  }

  if (/[\r\n]/.test(shortcut)) {
    throw new Error('Raccourci global invalide.');
  }

  return shortcut;
}

module.exports = {
  validateGlobalShortcut,
  validateMiniLayout,
  validateOpenBehavior,
  validateProjectInput,
  validateRootCandidate,
  validateRecentId,
  validateSettingsInput,
  validateSubfolderIndex
};
