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

  return Object.freeze({
    DIGITS_ONLY,
    FULL_PROJECT_NUMBER,
    acceleratorFromKeyboardEvent,
    defaultSubfolderIndex,
    findSubfolderByShortcut,
    formatAccelerator,
    formatSubfolderShortcut,
    resolveSubfolderIndex,
    subfolderShortcutFromEvent
  });
}));
