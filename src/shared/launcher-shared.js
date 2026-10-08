'use strict';

// Loaded as a classic script by the sandboxed renderers (window.LauncherShared)
// and as a CommonJS module by the Node test suite.
(function exportLauncherShared(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LauncherShared = api;
  }
}(globalThis, () => {
  const DIGITS_ONLY = /^\d{4}$/;
  const FULL_PROJECT_NUMBER = /^20\d{2}-\d{4}$/;
  const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'OS']);
  const NAMED_KEYS = Object.freeze({
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Escape'
  });

  function subfolderShortcutFromEvent(event) {
    if (event.ctrlKey || event.metaKey) {
      return 'Ctrl+Enter';
    }
    if (event.shiftKey) {
      return 'Shift+Enter';
    }
    if (event.altKey) {
      return 'Alt+Enter';
    }
    return 'Enter';
  }

  function findSubfolderByShortcut(subfolders, shortcut) {
    return Array.isArray(subfolders)
      ? subfolders.findIndex(subfolder => subfolder && subfolder.raccourci === shortcut)
      : -1;
  }

  // The subfolder bound to plain Enter is preselected when a project is found.
  function defaultSubfolderIndex(subfolders) {
    return Math.max(findSubfolderByShortcut(subfolders, 'Enter'), 0);
  }

  // Plain Enter opens the current selection; modified Enter opens the
  // subfolder bound to that combination, or the selection when none is.
  function resolveSubfolderIndex(event, subfolders, selectedIndex) {
    const shortcut = subfolderShortcutFromEvent(event);
    if (shortcut === 'Enter') {
      return selectedIndex;
    }

    const index = findSubfolderByShortcut(subfolders, shortcut);
    return index >= 0 ? index : selectedIndex;
  }

  function formatSubfolderShortcut(shortcut, isMac) {
    if (!shortcut) {
      return '';
    }
    return isMac ? shortcut.replace('Ctrl+', 'Cmd+') : shortcut;
  }

  function formatAccelerator(accelerator, isMac) {
    return String(accelerator || 'CommandOrControl+Shift+P')
      .split('+')
      .map(part => {
        if (part === 'CommandOrControl' || part === 'CmdOrCtrl') {
          return isMac ? 'Cmd' : 'Ctrl';
        }
        if (part === 'Command' || part === 'Cmd') {
          return 'Cmd';
        }
        if (part === 'Control') {
          return 'Ctrl';
        }
        if (part === 'Super' || part === 'Meta') {
          return isMac ? 'Cmd' : 'Win';
        }
        return part;
      })
      .join('+');
  }

  function acceleratorKeyFromEvent(event) {
    const key = String(event.key || '');
    const code = String(event.code || '');

    // Letters follow the active layout (QWERTZ, AZERTY), unlike event.code.
    if (/^[a-z]$/i.test(key)) {
      return key.toUpperCase();
    }

    // Option or AltGr changed the character: fall back to the physical key.
    let match = /^Key([A-Z])$/.exec(code);
    if (match) {
      return match[1];
    }

    // The digit row keeps its virtual key whatever Shift produces on the layout.
    match = /^Digit(\d)$/.exec(code);
    if (match) {
      return match[1];
    }

    match = /^Numpad(\d)$/.exec(code);
    if (match) {
      return `num${match[1]}`;
    }

    if (/^F([1-9]|1\d|2[0-4])$/.test(key)) {
      return key;
    }

    return NAMED_KEYS[key] || null;
  }

  function acceleratorFromKeyboardEvent(event, isMac) {
    if (MODIFIER_KEYS.has(event.key)) {
      return { pending: true };
    }

    const key = acceleratorKeyFromEvent(event);
    if (!key) {
      return { error: 'Cette touche ne peut pas servir de raccourci global.' };
    }

    const modifiers = [];
    if (isMac) {
      if (event.metaKey) {
        modifiers.push('CommandOrControl');
      }
      if (event.ctrlKey) {
        modifiers.push('Control');
      }
    } else {
      if (event.ctrlKey) {
        modifiers.push('CommandOrControl');
      }
      if (event.metaKey) {
        modifiers.push('Super');
      }
    }
    if (event.shiftKey) {
      modifiers.push('Shift');
    }
    if (event.altKey) {
      modifiers.push('Alt');
    }

    const hasCommandModifier = modifiers.some(modifier => modifier !== 'Shift');
    if (!hasCommandModifier && !/^F\d+$/.test(key)) {
      return {
        error: isMac
          ? 'Ajoutez Cmd, Ctrl ou Option : une touche seule bloquerait la saisie.'
          : 'Ajoutez Ctrl ou Alt : une touche seule bloquerait la saisie.'
      };
    }

    return { accelerator: [...modifiers, key].join('+') };
  }

  // Popup key column: "↵", "Ctrl+↵"; macOS uses the ⌘ ⇧ ⌥ glyphs.
  function formatKeyGlyph(shortcut, isMac) {
    if (!shortcut) {
      return '—';
    }
    if (isMac) {
      return shortcut
        .replace('Ctrl+', '⌘')
        .replace('Shift+', '⇧')
        .replace('Alt+', '⌥')
        .replace('Enter', '↵');
    }
    return shortcut.replace('Enter', '↵');
  }

  const MAC_MODIFIER_GLYPHS = [
    ['Control', '⌃'],
    ['Alt', '⌥'],
    ['Shift', '⇧'],
    ['CommandOrControl', '⌘'],
    ['Command', '⌘'],
    ['Super', '⌘']
  ];

  // Compact accelerator for chips: "Ctrl+Shift+P", or "⇧⌘P" on macOS.
  function formatAcceleratorChip(accelerator, isMac) {
    if (!isMac) {
      return formatAccelerator(accelerator, false);
    }
    const parts = String(accelerator || 'CommandOrControl+Shift+P').split('+');
    const key = parts.pop();
    const glyphs = MAC_MODIFIER_GLYPHS
      .filter(([name]) => parts.includes(name))
      .map(([, glyph]) => glyph);
    return `${[...new Set(glyphs)].join('')}${key}`;
  }

  const OPEN_BEHAVIOR_OPTIONS = Object.freeze([
    Object.freeze({ value: 'newWindow', label: 'Fenêtre' }),
    Object.freeze({ value: 'newTab', label: 'Onglet' }),
    Object.freeze({ value: 'reuseWindow', label: 'Remplacer' })
  ]);

  function nextOpenBehavior(current) {
    const index = OPEN_BEHAVIOR_OPTIONS.findIndex(option => option.value === current);
    return OPEN_BEHAVIOR_OPTIONS[(index + 1) % OPEN_BEHAVIOR_OPTIONS.length].value;
  }

  function formatRelativeTime(timestamp, now = Date.now()) {
    const elapsed = Math.max(0, now - Number(timestamp || 0));
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) {
      return 'à l’instant';
    }
    if (minutes < 60) {
      return `il y a ${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours} h`;
    }
    const days = Math.floor(hours / 24);
    if (days === 1) {
      return 'hier';
    }
    if (days < 7) {
      return `il y a ${days} j`;
    }
    const date = new Date(Number(timestamp));
    return `le ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // Splits text around the first occurrence of query, for match highlighting.
  function splitMatch(text, query) {
    const value = String(text || '');
    const needle = String(query || '');
    const index = needle ? value.toLowerCase().indexOf(needle.toLowerCase()) : -1;
    if (index < 0) {
      return [{ text: value, match: false }];
    }
    return [
      { text: value.slice(0, index), match: false },
      { text: value.slice(index, index + needle.length), match: true },
      { text: value.slice(index + needle.length), match: false }
    ].filter(part => part.text);
  }

  function isProjectRootRecent(recent) {
    return !String(recent.subfolderPath || '').trim();
  }

  // "2026-4889 · Plans d'exécution"; the project number alone for its root.
  function formatRecentLabel(recent) {
    const projectNumber = String(recent.projectNumber || '').trim();
    const subfolderName = String(recent.subfolderName || '').trim();
    if (projectNumber && !isProjectRootRecent(recent) && subfolderName) {
      return `${projectNumber} · ${subfolderName}`;
    }
    if (projectNumber) {
      return projectNumber;
    }
    const folderPath = String(recent.folderPath || '').trim();
    return folderPath.split(/[\\/]+/).filter(Boolean).pop() || 'Dossier récent';
  }

  function normalizeRelativePath(value) {
    return String(value || '').trim().replace(/[\\/]+/g, '/').replace(/^\.\//, '').replace(/\/$/, '').toLowerCase();
  }

  // Index of the configured subfolder a recent folder was opened in.
  function findRecentSubfolderIndex(recent, subfolders) {
    if (!Array.isArray(subfolders)) {
      return -1;
    }
    const target = normalizeRelativePath(recent.subfolderPath);
    return subfolders.findIndex(subfolder => normalizeRelativePath(subfolder && subfolder.chemin) === target);
  }

  // Former emoji icons and the Lucide icon that replaces them.
  const EMOJI_ICONS = Object.freeze({
    '📁': 'folder', '📂': 'folder-open', '🗂️': 'folder-open', '📋': 'clipboard-list', '📎': 'paperclip',
    '🗃️': 'archive', '🗄️': 'archive', '💼': 'briefcase', '📄': 'file', '📑': 'file-text', '📝': 'file-text',
    '📃': 'file-text', '📰': 'newspaper', '📜': 'scroll-text', '🧾': 'receipt', '📊': 'file-spreadsheet',
    '📐': 'ruler', '📏': 'ruler', '🔧': 'wrench', '🔩': 'wrench', '⚙️': 'settings', '🛠️': 'hammer',
    '🏗️': 'hard-hat', '🔬': 'microscope', '💰': 'file-text', '💵': 'banknote', '🏷️': 'tag',
    '🧮': 'calculator', '📦': 'package', '🚚': 'truck', '🤝': 'handshake', '🏭': 'factory', '📧': 'mail',
    '📞': 'phone', '💬': 'message-square', '📮': 'mail', '✉️': 'mail', '📨': 'mail', '🔔': 'bell',
    '📣': 'megaphone', '✅': 'circle-check', '❌': 'circle-x', '⚠️': 'triangle-alert', '🔒': 'lock',
    '⭐': 'star', '🔥': 'flame', '💡': 'lightbulb', '🎯': 'target', '🏠': 'house', '👤': 'user',
    '👥': 'users', '🌐': 'globe', '📸': 'camera', '🎨': 'palette', '📅': 'calendar', '🕐': 'clock'
  });

  // Maps a stored icon (Lucide name or former emoji) to a Lucide icon name.
  function iconNameFor(value, isKnownIcon) {
    const icon = String(value || '').trim();
    if (icon && isKnownIcon(icon)) {
      return icon;
    }
    const withoutVariation = icon.replace(/️/g, '');
    return EMOJI_ICONS[icon] || EMOJI_ICONS[`${withoutVariation}️`] || EMOJI_ICONS[withoutVariation] || 'folder';
  }

  return Object.freeze({
    DIGITS_ONLY,
    FULL_PROJECT_NUMBER,
    EMOJI_ICONS,
    OPEN_BEHAVIOR_OPTIONS,
    acceleratorFromKeyboardEvent,
    defaultSubfolderIndex,
    findRecentSubfolderIndex,
    findSubfolderByShortcut,
    formatAccelerator,
    formatAcceleratorChip,
    formatKeyGlyph,
    formatRecentLabel,
    formatRelativeTime,
    formatSubfolderShortcut,
    iconNameFor,
    nextOpenBehavior,
    resolveSubfolderIndex,
    splitMatch,
    subfolderShortcutFromEvent
  });
}));
