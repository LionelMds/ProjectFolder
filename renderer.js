let config = null;
let selectedSubfolderIndex = 0;
let selectedRecentIndex = 0;
let isValidProject = false;
let currentProjectInput = '';
let filteredRecentFolders = [];

const projectInput = document.getElementById('projectInput');
const validationMessage = document.getElementById('validationMessage');
const recentMenu = document.getElementById('recentMenu');
const recentItems = document.getElementById('recentItems');
const recentEmpty = document.getElementById('recentEmpty');
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
    renderRecentItems('');
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

function formatRecentName(recent) {
    const projectLabel = recent.projectNumber || recent.digits || 'Dossier';
    const subfolderLabel = recent.subfolderName || 'Dossier principal';
    return `${projectLabel} - ${subfolderLabel}`;
}

function getRecentSearchText(recent) {
    return [
        recent.projectNumber,
        recent.digits,
        recent.subfolderName,
        recent.subfolderPath,
        recent.folderPath
    ].filter(Boolean).join(' ').toLowerCase();
}

function getRecentFolders(query) {
    const recents = Array.isArray(config.recentFolders) ? config.recentFolders : [];
    const normalizedQuery = String(query || '').trim().toLowerCase();

    if (!normalizedQuery) {
        return recents;
    }

    return recents.filter(recent => getRecentSearchText(recent).includes(normalizedQuery));
}

function renderRecentItems(query) {
    recentItems.innerHTML = '';
    filteredRecentFolders = getRecentFolders(query);
    selectedRecentIndex = Math.min(selectedRecentIndex, Math.max(filteredRecentFolders.length - 1, 0));

    filteredRecentFolders.forEach((recent, index) => {
        const item = document.createElement('button');
        item.className = 'recent-item';
        item.type = 'button';
        item.dataset.index = String(index);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', index === selectedRecentIndex ? 'true' : 'false');
        item.setAttribute('aria-label', `Ouvrir ${formatRecentName(recent)}`);

        const icon = document.createElement('span');
        icon.className = 'item-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '📁';

        const content = document.createElement('span');
        content.className = 'recent-content';

        const name = document.createElement('span');
        name.className = 'recent-name';
        name.textContent = formatRecentName(recent);

        const pathLabel = document.createElement('span');
        pathLabel.className = 'recent-path';
        pathLabel.textContent = recent.folderPath || recent.subfolderPath || 'Dossier récent';

        content.appendChild(name);
        content.appendChild(pathLabel);

        item.appendChild(icon);
        item.appendChild(content);

        const projectBadge = document.createElement('span');
        projectBadge.className = 'recent-project';
        projectBadge.textContent = recent.digits || (recent.projectNumber || '').slice(-4) || '';
        item.appendChild(projectBadge);

        item.addEventListener('click', () => openRecentFolder(index));
        item.addEventListener('mouseenter', () => setSelectedRecentIndex(index));

        recentItems.appendChild(item);
    });

    recentEmpty.textContent = query ? 'Aucun récent correspondant' : 'Aucun dossier récent';
    recentEmpty.classList.toggle('visible', filteredRecentFolders.length === 0);
    updateRecentSelection();
}

function renderMenuItems() {
    menuItems.innerHTML = '';

    config.sousDossiers.forEach((subfolder, index) => {
        const item = document.createElement('button');
        item.className = 'menu-item';
        item.type = 'button';
        item.dataset.index = String(index);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', index === selectedSubfolderIndex ? 'true' : 'false');
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
        item.addEventListener('mouseenter', () => setSelectedSubfolderIndex(index));

        menuItems.appendChild(item);
    });

    updateSubfolderSelection();
}

function setupEventListeners() {
    projectInput.addEventListener('input', handleInput);
    projectInput.addEventListener('keydown', handleKeydown);

    window.electronAPI.onWindowShown(async () => {
        config = await window.electronAPI.getConfig();
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
        renderRecentItems(projectInput.value);
        updateShortcutHint();
    });
}

function resetState() {
    isValidProject = false;
    currentProjectInput = '';
    selectedSubfolderIndex = 0;
    selectedRecentIndex = 0;
    subfoldersMenu.classList.remove('visible');
    validationMessage.textContent = '';
    validationMessage.className = 'validation-message';
    renderRecentItems('');
    recentMenu.classList.add('visible');
    updateSubfolderSelection();
}

function handleInput(event) {
    let value = event.target.value.trim();

    if (!value.includes('-')) {
        value = value.replace(/\D/g, '').substring(0, 4);
        projectInput.value = value;
    } else {
        value = value.replace(/[^\d-]/g, '').substring(0, 9);
        projectInput.value = value;
    }

    validateProject(value);
}

function showRecentList(query) {
    renderRecentItems(query);
    recentMenu.classList.add('visible');
    subfoldersMenu.classList.remove('visible');
}

function showSubfolderList() {
    recentMenu.classList.remove('visible');
    subfoldersMenu.classList.add('visible');
}

function validateProject(value) {
    if (value === '') {
        validationMessage.textContent = '';
        validationMessage.className = 'validation-message';
        isValidProject = false;
        showRecentList('');
        return;
    }

    if (digitsOnlyRegex.test(value) || fullProjectRegex.test(value)) {
        currentProjectInput = value;
        isValidProject = true;
        validationMessage.textContent = `✓ Projet ${value}`;
        validationMessage.className = 'validation-message valid';
        selectedSubfolderIndex = 0;
        showSubfolderList();
        updateSubfolderSelection();
        return;
    }

    if (/^\d{1,3}$/.test(value)) {
        isValidProject = false;
        validationMessage.textContent = 'Tapez 4 chiffres ou ouvrez un récent';
        validationMessage.className = 'validation-message info';
        selectedRecentIndex = 0;
        showRecentList(value);
        return;
    }

    isValidProject = false;
    validationMessage.textContent = '✕ Format invalide';
    validationMessage.className = 'validation-message invalid';
    showRecentList(value);
}

function handleKeydown(event) {
    switch (event.key) {
        case 'Escape':
            event.preventDefault();
            window.electronAPI.hideWindow();
            break;

        case 'ArrowDown':
            event.preventDefault();
            moveSelection(1);
            break;

        case 'ArrowUp':
            event.preventDefault();
            moveSelection(-1);
            break;

        case 'Enter':
            event.preventDefault();
            if (isValidProject) {
                openByKeyboard(event);
            } else {
                openRecentFolder(selectedRecentIndex);
            }
            break;

        case 'Tab':
            event.preventDefault();
            moveSelection(event.shiftKey ? -1 : 1);
            break;
    }
}

function moveSelection(delta) {
    if (isValidProject) {
        setSelectedSubfolderIndex((selectedSubfolderIndex + delta + config.sousDossiers.length) % config.sousDossiers.length);
        return;
    }

    if (filteredRecentFolders.length > 0) {
        setSelectedRecentIndex((selectedRecentIndex + delta + filteredRecentFolders.length) % filteredRecentFolders.length);
    }
}

function openByKeyboard(event) {
    if (event.ctrlKey || event.metaKey) {
        const ctrlIndex = config.sousDossiers.findIndex(subfolder => subfolder.raccourci === 'Ctrl+Enter');
        openSubfolder(ctrlIndex >= 0 ? ctrlIndex : selectedSubfolderIndex);
        return;
    }

    if (event.shiftKey) {
        const shiftIndex = config.sousDossiers.findIndex(subfolder => subfolder.raccourci === 'Shift+Enter');
        openSubfolder(shiftIndex >= 0 ? shiftIndex : selectedSubfolderIndex);
        return;
    }

    openSubfolder(selectedSubfolderIndex);
}

function setSelectedSubfolderIndex(index) {
    selectedSubfolderIndex = index;
    updateSubfolderSelection();
}

function setSelectedRecentIndex(index) {
    selectedRecentIndex = index;
    updateRecentSelection();
}

function updateSubfolderSelection() {
    const items = menuItems.querySelectorAll('.menu-item');

    items.forEach((item, index) => {
        const selected = index === selectedSubfolderIndex;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.tabIndex = selected ? 0 : -1;
    });
}

function updateRecentSelection() {
    const items = recentItems.querySelectorAll('.recent-item');

    items.forEach((item, index) => {
        const selected = index === selectedRecentIndex;
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

async function openRecentFolder(index) {
    const recent = filteredRecentFolders[index];

    if (!recent) {
        return;
    }

    const result = await window.electronAPI.openRecentFolder(recent.id);

    if (!result.success) {
        console.error('Failed to open recent folder:', result.error);
    }
}

document.addEventListener('DOMContentLoaded', init);
