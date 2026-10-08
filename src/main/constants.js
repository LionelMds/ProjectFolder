'use strict';

const APP_NAME = 'Project Folder Launcher';
const CONFIG_SCHEMA_VERSION = 4;
// Transparent space around each opaque panel for the blueprint registration
// marks (drawn 6 px outside the frame) and the drop shadow.
const WINDOW_FRAME_MARGIN = 24;
const MAIN_WINDOW_SIZE = Object.freeze({ width: 720 + (WINDOW_FRAME_MARGIN * 2), height: 330 + (WINDOW_FRAME_MARGIN * 2) });
const SETTINGS_WINDOW_SIZE = Object.freeze({ width: 760 + (WINDOW_FRAME_MARGIN * 2), height: 600 + (WINDOW_FRAME_MARGIN * 2) });
const UPDATE_WINDOW_SIZE = Object.freeze({ width: 600 + (WINDOW_FRAME_MARGIN * 2), height: 300 + (WINDOW_FRAME_MARGIN * 2) });
const FOLDER_WINDOW_SCALE = 0.7;
// The mini bar is 40 px high inside an 8 px transparent margin.
const MINI_FRAME_MARGIN = 8;
const MINI_BAR_HEIGHT = 40;
const MINI_PANEL_GAP = 6;
const MINI_BASE_WIDTH = 160 + (MINI_FRAME_MARGIN * 2);
const MINI_MAX_WIDTH = 640 + (MINI_FRAME_MARGIN * 2);
const MINI_MAX_PANEL_HEIGHT = 420;
const MINI_DEFAULT_HEIGHT = MINI_BAR_HEIGHT + (MINI_FRAME_MARGIN * 2);
const MINI_EDGE_PADDING = 8;
const VALID_INTEGRATION_MODES = Object.freeze(['floating', 'docked', 'hidden']);
const VALID_OPEN_BEHAVIORS = Object.freeze(['newWindow', 'newTab', 'reuseWindow']);
const VALID_SUBFOLDER_SHORTCUTS = Object.freeze([
  'Enter',
  'Ctrl+Enter',
  'Shift+Enter',
  'Alt+Enter'
]);
const RECENT_FOLDERS_LIMIT = 10;
const MAX_SUBFOLDERS = 40;
const MAX_LABEL_LENGTH = 120;
const MAX_RELATIVE_PATH_LENGTH = 500;
const MAX_GLOBAL_SHORTCUT_LENGTH = 120;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const EXPLORER_NAVIGATION_TIMEOUT_MS = 10 * 1000;
// The warm PowerShell worker exits after this much inactivity.
const EXPLORER_WORKER_IDLE_MS = 10 * 60 * 1000;

module.exports = {
  APP_NAME,
  CONFIG_SCHEMA_VERSION,
  WINDOW_FRAME_MARGIN,
  MAIN_WINDOW_SIZE,
  SETTINGS_WINDOW_SIZE,
  UPDATE_WINDOW_SIZE,
  FOLDER_WINDOW_SCALE,
  MINI_FRAME_MARGIN,
  MINI_BAR_HEIGHT,
  MINI_PANEL_GAP,
  MINI_BASE_WIDTH,
  MINI_MAX_WIDTH,
  MINI_MAX_PANEL_HEIGHT,
  MINI_DEFAULT_HEIGHT,
  MINI_EDGE_PADDING,
  VALID_INTEGRATION_MODES,
  VALID_OPEN_BEHAVIORS,
  VALID_SUBFOLDER_SHORTCUTS,
  RECENT_FOLDERS_LIMIT,
  MAX_SUBFOLDERS,
  MAX_LABEL_LENGTH,
  MAX_RELATIVE_PATH_LENGTH,
  MAX_GLOBAL_SHORTCUT_LENGTH,
  MAX_LOG_BYTES,
  EXPLORER_NAVIGATION_TIMEOUT_MS,
  EXPLORER_WORKER_IDLE_MS
};
