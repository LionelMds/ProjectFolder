let config = null;
let selectedIndex = 0;
let isValidProject = false;
let currentProjectInput = '';

const projectInput = document.getElementById('projectInput');
const validationMessage = document.getElementById('validationMessage');
const subfoldersMenu = document.getElementById('subfoldersMenu');
const menuItems = document.getElementById('menuItems');

const digitsOnlyRegex = /^\d{4}$/;
const fullProjectRegex = /^20\d{2}-\d{4}$/;

async function init() {
    config = await window.electronAPI.getConfig();

    if (navigator.platform.startsWith('Mac')) {
        document.body.classList.add('liquid-glass');
    }

    setupEventListeners();
    renderMenuItems();
    updateShortcutHint();
}

function updateShortcutHint() {
    const shortcutHint = document.querySelector('.shortcut-hint');
    const isMac = navigator.platform.startsWith('Mac');

    if (shortcutHint && config.raccourciGlobal) {
        shortcutHint.textContent = config.raccourciGlobal.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');
    }
}

function formatShortcut(shortcut) {
    if (!shortcut) {
        return '';
    }

    return navigator.platform.startsWith('Mac')
        ? shortcut.replace('Ctrl+', 'Cmd+')
        : shortcut;
}

function renderMenuItems() {
    menuItems.innerHTML = '';

    config.sousDossiers.forEach((subfolder, index) => {
        const item = document.createElement('button');
        item.className = 'menu-item';
        item.type = 'button';
        item.dataset.index = String(index);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
        item.setAttribute('aria-label', `Ouvrir ${subfolder.nom}`);

        const icon = document.createElement('span');
        icon.className = 'item-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = subfolder.icone || '📁';

        const content = document.createElement('span');
        content.className = 'item-content';

        const name = document.createElement('span');
        name.className = 'item-name';
        name.textContent = subfolder.nom || 'Sous-dossier';

        const pathLabel = document.createElement('span');
        pathLabel.className = 'item-path';
        pathLabel.textContent = subfolder.chemin || 'Racine du projet';

        content.appendChild(name);
        content.appendChild(pathLabel);

        item.appendChild(icon);
        item.appendChild(content);

        const shortcutLabel = formatShortcut(subfolder.raccourci);
        if (shortcutLabel) {
            const shortcut = document.createElement('span');
            shortcut.className = 'item-shortcut';
            shortcut.textContent = shortcutLabel;
            item.appendChild(shortcut);
        }

        item.addEventListener('click', () => openSubfolder(index));
        item.addEventListener('mouseenter', () => setSelectedIndex(index));

        menuItems.appendChild(item);
    });

    updateSelection();
}

function setupEventListeners() {
    projectInput.addEventListener('input', handleInput);
    projectInput.addEventListener('keydown', handleKeydown);

    window.electronAPI.onWindowShown(() => {
        projectInput.value = '';
        projectInput.focus();
        resetState();
    });

    window.electronAPI.onWindowHidden(() => {
        resetState();
    });

    window.electronAPI.onConfigUpdated(async () => {
        config = await window.electronAPI.getConfig();
        renderMenuItems();
        updateShortcutHint();
    });
}

function resetState() {
    isValidProject = false;
    currentProjectInput = '';
    selectedIndex = 0;
    subfoldersMenu.classList.remove('visible');
    validationMessage.textContent = '';
    validationMessage.className = 'validation-message';
    updateSelection();
}

function handleInput(event) {
    let value = event.target.value.trim();

    if (!value.includes('-')) {
        value = value.replace(/\D/g, '').substring(0, 4);
        projectInput.value = value;
    }

    validateProject(value);
}

function validateProject(value) {
    if (value === '') {
        validationMessage.textContent = '';
        validationMessage.className = 'validation-message';
        subfoldersMenu.classList.remove('visible');
        isValidProject = false;
        return;
    }

    if (digitsOnlyRegex.test(value) || fullProjectRegex.test(value)) {
        currentProjectInput = value;
        isValidProject = true;
        validationMessage.textContent = `✓ Projet ${value}`;
        validationMessage.className = 'validation-message valid';
        subfoldersMenu.classList.add('visible');
        selectedIndex = 0;
        updateSelection();
        return;
    }

    if (/^\d{1,3}$/.test(value)) {
        isValidProject = false;
        validationMessage.textContent = 'Tapez 4 chiffres';
        validationMessage.className = 'validation-message info';
        subfoldersMenu.classList.remove('visible');
        return;
    }

    isValidProject = false;
    validationMessage.textContent = '✕ Format invalide';
    validationMessage.className = 'validation-message invalid';
    subfoldersMenu.classList.remove('visible');
}

function handleKeydown(event) {
    switch (event.key) {
        case 'Escape':
            event.preventDefault();
            window.electronAPI.hideWindow();
            break;

        case 'ArrowDown':
            event.preventDefault();
            if (isValidProject) {
                setSelectedIndex((selectedIndex + 1) % config.sousDossiers.length);
            }
            break;

        case 'ArrowUp':
            event.preventDefault();
            if (isValidProject) {
                setSelectedIndex((selectedIndex - 1 + config.sousDossiers.length) % config.sousDossiers.length);
            }
            break;

        case 'Enter':
            event.preventDefault();
            if (isValidProject) {
                openByKeyboard(event);
            }
            break;

        case 'Tab':
            event.preventDefault();
            if (isValidProject) {
                const delta = event.shiftKey ? -1 : 1;
                setSelectedIndex((selectedIndex + delta + config.sousDossiers.length) % config.sousDossiers.length);
            }
            break;
    }
}

function openByKeyboard(event) {
    if (event.ctrlKey || event.metaKey) {
        const ctrlIndex = config.sousDossiers.findIndex(subfolder => subfolder.raccourci === 'Ctrl+Enter');
        openSubfolder(ctrlIndex >= 0 ? ctrlIndex : selectedIndex);
        return;
    }

    if (event.shiftKey) {
        const shiftIndex = config.sousDossiers.findIndex(subfolder => subfolder.raccourci === 'Shift+Enter');
        openSubfolder(shiftIndex >= 0 ? shiftIndex : selectedIndex);
        return;
    }

    openSubfolder(selectedIndex);
}

function setSelectedIndex(index) {
    selectedIndex = index;
    updateSelection();
}

function updateSelection() {
    const items = menuItems.querySelectorAll('.menu-item');

    items.forEach((item, index) => {
        const selected = index === selectedIndex;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.tabIndex = selected ? 0 : -1;
    });
}

async function openSubfolder(index) {
    if (!isValidProject || !currentProjectInput) {
        return;
    }

    const result = await window.electronAPI.openProjectFolder(currentProjectInput, index);

    if (!result.success) {
        console.error('Failed to open folder:', result.error);
    }
}

document.addEventListener('DOMContentLoaded', init);
