let config = null;
let buttonsVisible = false;

const digitsOnlyRegex = /^\d{4}$/;
const miniInput = document.getElementById('miniInput');
const miniStatus = document.getElementById('miniStatus');
const miniButtons = document.getElementById('miniButtons');
const pinBtn = document.getElementById('pinBtn');

const BASE_WIDTH = 260;
const BUTTON_WIDTH = 32;

async function init() {
    config = await window.electronAPI.getConfig();
    applyModeClasses();
    renderButtons();
    setupEventListeners();
}

function applyModeClasses() {
    const isPinned = config.integrationMode === 'docked';
    document.body.classList.toggle('liquid-glass', navigator.platform.startsWith('Mac'));
    document.body.classList.toggle('docked', isPinned);
    document.body.classList.toggle('docked-move-mode', Boolean(config.dockedMoveMode));
    document.body.classList.toggle('popover', navigator.platform.startsWith('Mac') && isPinned);

    if (pinBtn) {
        pinBtn.classList.toggle('pinned', isPinned);
        pinBtn.title = isPinned ? 'Désépingler' : 'Épingler à la barre des tâches';
        pinBtn.setAttribute('aria-label', pinBtn.title);
    }
}

function renderButtons() {
    miniButtons.innerHTML = '';

    config.sousDossiers.forEach((subfolder, index) => {
        const button = document.createElement('button');
        button.className = 'mini-btn';
        button.type = 'button';
        button.textContent = subfolder.icone || '📁';
        button.title = subfolder.nom || 'Sous-dossier';
        button.setAttribute('aria-label', `Ouvrir ${subfolder.nom || 'ce sous-dossier'}`);
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            openSubfolderFromMini(index);
        });

        miniButtons.appendChild(button);
    });
}

function setupEventListeners() {
    miniInput.addEventListener('input', handleInput);
    miniInput.addEventListener('keydown', handleKeydown);
    pinBtn.addEventListener('click', handlePinToggle);
    miniInput.addEventListener('focus', () => {
        window.electronAPI.miniBarFocused();
    });

    window.electronAPI.onConfigUpdated(async () => {
        config = await window.electronAPI.getConfig();
        applyModeClasses();
        renderButtons();
        validateAndUpdateStatus(miniInput.value.trim());
    });

    window.electronAPI.onMiniPopoverShown(() => {
        clearInput(true);
        miniInput.focus();
    });
}

async function handlePinToggle(event) {
    event.preventDefault();
    event.stopPropagation();

    const result = await window.electronAPI.toggleMiniPin();

    if (!result.success) {
        console.error('Failed to toggle mini pin:', result.error);
    }
}

function handleInput(event) {
    const value = event.target.value.trim().replace(/\D/g, '').substring(0, 4);
    miniInput.value = value;
    validateAndUpdateStatus(value);
}

function validateAndUpdateStatus(value) {
    if (value === '') {
        miniStatus.textContent = '';
        miniStatus.className = 'mini-status';
        showButtons(false);
        return;
    }

    if (digitsOnlyRegex.test(value)) {
        miniStatus.textContent = '✓';
        miniStatus.className = 'mini-status valid';
        showButtons(true);
        return;
    }

    if (/^\d{1,3}$/.test(value)) {
        miniStatus.textContent = '...';
        miniStatus.className = 'mini-status';
        showButtons(false);
        return;
    }

    miniStatus.textContent = '✕';
    miniStatus.className = 'mini-status invalid';
    showButtons(false);
}

async function showButtons(show) {
    if (show === buttonsVisible) {
        return;
    }

    buttonsVisible = show;

    if (show) {
        const buttonCount = config.sousDossiers.length;
        const newWidth = BASE_WIDTH + (buttonCount * BUTTON_WIDTH);
        await window.electronAPI.resizeMiniBar(newWidth);
        miniButtons.classList.add('visible');
        miniButtons.style.display = 'flex';
        return;
    }

    miniButtons.classList.remove('visible');
    miniButtons.style.display = 'none';
    await window.electronAPI.resizeMiniBar(BASE_WIDTH);
}

function clearInput(immediate = false) {
    const run = () => {
        miniInput.value = '';
        miniStatus.textContent = '';
        miniStatus.className = 'mini-status';
        showButtons(false);
    };

    if (immediate) {
        run();
    } else {
        setTimeout(run, 100);
    }
}

function getShortcutSubfolderIndex(event) {
    if (event.ctrlKey || event.metaKey) {
        const ctrlIndex = config.sousDossiers.findIndex(subfolder => subfolder.raccourci === 'Ctrl+Enter');
        return ctrlIndex >= 0 ? ctrlIndex : 0;
    }

    if (event.shiftKey) {
        const shiftIndex = config.sousDossiers.findIndex(subfolder => subfolder.raccourci === 'Shift+Enter');
        return shiftIndex >= 0 ? shiftIndex : 0;
    }

    return 0;
}

function handleKeydown(event) {
    const value = miniInput.value.trim();

    if (event.key === 'Enter' && digitsOnlyRegex.test(value)) {
        event.preventDefault();
        openSubfolderFromMini(getShortcutSubfolderIndex(event));
        return;
    }

    if (event.key === 'Escape') {
        miniInput.value = '';
        miniStatus.textContent = '';
        miniStatus.className = 'mini-status';
        showButtons(false);
        miniInput.blur();
    }
}

async function openSubfolderFromMini(index) {
    const value = miniInput.value.trim();

    if (!digitsOnlyRegex.test(value)) {
        return;
    }

    const result = await window.electronAPI.openProjectFolder(value, index);

    if (!result.success) {
        console.error('Failed to open folder:', result.error);
    }

    clearInput();
}

document.addEventListener('DOMContentLoaded', init);
