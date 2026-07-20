'use strict';

const { validateSettingsInput } = require('./config-store');
const { FOUR_DIGITS, FULL_PROJECT_NUMBER } = require('./project-service');
const {
  MAX_GLOBAL_SHORTCUT_LENGTH,
  MINI_BASE_WIDTH,
  MINI_MAX_WIDTH
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

function validateMiniWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) {
    throw new Error('Largeur de mini-barre invalide.');
  }

  return clamp(Math.round(width), MINI_BASE_WIDTH, MINI_MAX_WIDTH);
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
  validateMiniWidth,
  validateProjectInput,
  validateRecentId,
  validateSettingsInput,
  validateSubfolderIndex
};
