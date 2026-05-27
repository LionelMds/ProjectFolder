let config = null;
let sousDossiers = [];
let capturingShortcut = false;
let activeEmojiPicker = null;

const racineInput = document.getElementById('racineInput');
const browseRacine = document.getElementById('browseRacine');
const subfolderList = document.getElementById('subfolderList');
const addSubfolder = document.getElementById('addSubfolder');
const shortcutInput = document.getElementById('shortcutInput');
const shortcutCurrent = document.getElementById('shortcutCurrent');
const autoStartCheck = document.getElementById('autoStartCheck');
const miniBarCheck = document.getElementById('miniBarCheck');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');

const isMac = navigator.platform.startsWith('Mac');
const SHORTCUT_OPTIONS = ['Enter', 'Ctrl+Enter', 'Shift+Enter', 'Alt+Enter'];
const OPEN_BEHAVIORS = ['newWindow', 'newTab', 'reuseWindow'];

const EMOJI_CATEGORIES = [
    { label: 'Dossiers', emojis: ['📁', '📂', '🗂️', '📋', '📎', '🗃️', '🗄️', '💼'] },
    { label: 'Documents', emojis: ['📄', '📑', '📝', '📃', '📰', '📜', '🧾', '📊'] },
    { label: 'Technique', emojis: ['📐', '📏', '🔧', '🔩', '⚙️', '🛠️', '🏗️', '🔬'] },
    { label: 'Commerce', emojis: ['💰', '💵', '🏷️', '🧮', '📦', '🚚', '🤝', '🏭'] },
    { label: 'Communication', emojis: ['📧', '📞', '💬', '📮', '✉️', '📨', '🔔', '📣'] },
    { label: 'Statut', emojis: ['✅', '❌', '⚠️', '🔒', '⭐', '🔥', '💡', '🎯'] },
    { label: 'Divers', emojis: ['🏠', '👤', '👥', '🌐', '📸', '🎨', '📅', '🕐'] }
];

async function init() {
    config = await window.electronAPI.getConfig();

    if (isMac) {
        document.body.classList.add('liquid-glass');
    }

    populateForm();
    setupEventListeners();
}

function getCheckedRadioValue(name, fallback) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : fallback;
}

function setCheckedRadioValue(name, value, fallback) {
    const safeValue = value || fallback;
    const input = document.querySelector(`input[name="${name}"][value="${safeValue}"]`);

    if (input) {
        input.checked = true;
    }
}

function displayShortcut(shortcut) {
    return (shortcut || 'CommandOrControl+Shift+P').replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');
}

function electronShortcutFromDisplay(shortcut) {
    return (shortcut || 'Ctrl+Shift+P')
        .replace(/^Cmd\+/, 'CommandOrControl+')
        .replace(/^Ctrl\+/, 'CommandOrControl+');
}

function populateForm() {
    racineInput.value = config.racine || '';
    sousDossiers = JSON.parse(JSON.stringify(config.sousDossiers || []));
    renderSubfolders();

    const shortcutLabel = displayShortcut(config.raccourciGlobal);
    shortcutInput.value = shortcutLabel;
    shortcutCurrent.textContent = `Actuel: ${shortcutLabel}`;

    autoStartCheck.checked = Boolean(config.autoStart);
    miniBarCheck.checked = config.integrationMode !== 'hidden';
    setCheckedRadioValue('openBehavior', config.openBehavior, config.reuseExplorerWindow ? 'reuseWindow' : 'newWindow');

    applyPlatformLabels();
}

function applyPlatformLabels() {
    if (!isMac) {
        return;
    }

    document.getElementById('autoStartLabel').textContent = 'Lancer au démarrage';
    document.getElementById('newWindowTitle').textContent = 'Nouvelle fenêtre Finder';
    document.getElementById('newTabHelp').textContent = 'Ouvre un nouvel onglet Finder si possible.';
    document.getElementById('reuseWindowHelp').textContent = 'Remplace le dossier courant dans la fenêtre Finder existante.';
}

function setupEventListeners() {
    browseRacine.addEventListener('click', handleBrowse);
    addSubfolder.addEventListener('click', handleAddSubfolder);
    shortcutInput.addEventListener('click', startShortcutCapture);
    shortcutInput.addEventListener('keydown', handleShortcutCapture);
    shortcutInput.addEventListener('blur', stopShortcutCapture);
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleCancel);
    closeBtn.addEventListener('click', handleCancel);
    document.addEventListener('keydown', handleGlobalKeydown);
}

function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && !capturingShortcut) {
        handleCancel();
    }
}

async function handleBrowse() {
    const folderPath = await window.electronAPI.selectFolder();

    if (folderPath) {
        racineInput.value = folderPath;
    }
}

function closeEmojiPicker() {
    if (!activeEmojiPicker) {
        return;
    }

    activeEmojiPicker.remove();
    activeEmojiPicker = null;
    document.removeEventListener('click', handleOutsideEmojiClick);
}

function handleOutsideEmojiClick(event) {
    if (activeEmojiPicker && !activeEmojiPicker.contains(event.target)) {
        closeEmojiPicker();
    }
}

function createEmojiPicker(iconInput, index) {
    closeEmojiPicker();

    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Choisir une icône');

    EMOJI_CATEGORIES.forEach(category => {
        const label = document.createElement('div');
        label.className = 'emoji-category-label';
        label.textContent = category.label;
        picker.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'emoji-grid';

        category.emojis.forEach(emoji => {
            const button = document.createElement('button');
            button.className = 'emoji-btn';
            button.type = 'button';
            button.textContent = emoji;
            button.setAttribute('aria-label', `Choisir ${emoji}`);
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                iconInput.value = emoji;
                sousDossiers[index].icone = emoji;
                closeEmojiPicker();
            });
            grid.appendChild(button);
        });

        picker.appendChild(grid);
    });

    const rect = iconInput.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`;

    document.body.appendChild(picker);
    activeEmojiPicker = picker;

    setTimeout(() => {
        document.addEventListener('click', handleOutsideEmojiClick);
    }, 10);
}

function renderSubfolders() {
    subfolderList.innerHTML = '';

    sousDossiers.forEach((subfolder, index) => {
        const row = document.createElement('div');
        row.className = 'subfolder-row';

        const iconInput = document.createElement('input');
        iconInput.type = 'text';
        iconInput.className = 'subfolder-icon-input';
        iconInput.value = subfolder.icone || '📁';
        iconInput.maxLength = 4;
        iconInput.readOnly = true;
        iconInput.title = 'Cliquez pour choisir un emoji';
        iconInput.setAttribute('aria-label', `Icône de ${subfolder.nom || 'sous-dossier'}`);
        iconInput.addEventListener('click', (event) => {
            event.stopPropagation();
            createEmojiPicker(iconInput, index);
        });

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'input-field subfolder-name';
        nameInput.value = subfolder.nom || '';
        nameInput.placeholder = 'Nom';
        nameInput.setAttribute('aria-label', 'Nom du sous-dossier');
        nameInput.addEventListener('input', (event) => {
            sousDossiers[index].nom = event.target.value;
        });

        const pathInput = document.createElement('input');
        pathInput.type = 'text';
        pathInput.className = 'input-field subfolder-path';
        pathInput.value = subfolder.chemin || '';
        pathInput.placeholder = isMac
            ? 'Chemin relatif (ex: Plans/Exécution)'
            : 'Chemin relatif (ex: Plans\\Exécution)';
        pathInput.setAttribute('aria-label', 'Chemin relatif du sous-dossier');
        pathInput.addEventListener('input', (event) => {
            sousDossiers[index].chemin = event.target.value;
        });

        const shortcutSelect = document.createElement('select');
        shortcutSelect.className = 'input-field subfolder-shortcut';
        shortcutSelect.setAttribute('aria-label', 'Raccourci du sous-dossier');

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'Aucun';
        shortcutSelect.appendChild(noneOption);

        SHORTCUT_OPTIONS.forEach(optionValue => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = isMac ? optionValue.replace('Ctrl+', 'Cmd+') : optionValue;
            option.selected = subfolder.raccourci === optionValue;
            shortcutSelect.appendChild(option);
        });

        shortcutSelect.addEventListener('change', (event) => {
            sousDossiers[index].raccourci = event.target.value || null;
        });

        const actions = document.createElement('div');
        actions.className = 'subfolder-actions';

        const upButton = createActionButton('▲', 'Monter', () => moveSubfolder(index, -1));
        upButton.disabled = index === 0;

        const downButton = createActionButton('▼', 'Descendre', () => moveSubfolder(index, 1));
        downButton.disabled = index === sousDossiers.length - 1;

        const deleteButton = createActionButton('✕', 'Supprimer', () => removeSubfolder(index), true);
        deleteButton.disabled = sousDossiers.length === 1;

        actions.appendChild(upButton);
        actions.appendChild(downButton);
        actions.appendChild(deleteButton);

        row.appendChild(iconInput);
        row.appendChild(nameInput);
        row.appendChild(pathInput);
        row.appendChild(shortcutSelect);
        row.appendChild(actions);

        subfolderList.appendChild(row);
    });
}

function createActionButton(label, title, onClick, danger = false) {
    const button = document.createElement('button');
    button.className = danger ? 'btn btn-danger' : 'btn btn-icon';
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', onClick);
    return button;
}

function handleAddSubfolder() {
    sousDossiers.push({
        nom: 'Nouveau dossier',
        chemin: '',
        raccourci: null,
        icone: '📁'
    });

    renderSubfolders();

    const content = document.querySelector('.settings-content');
    content.scrollTop = content.scrollHeight;
}

function moveSubfolder(index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= sousDossiers.length) {
        return;
    }

    const item = sousDossiers.splice(index, 1)[0];
    sousDossiers.splice(newIndex, 0, item);
    renderSubfolders();
}

function removeSubfolder(index) {
    if (sousDossiers.length <= 1) {
        return;
    }

    sousDossiers.splice(index, 1);
    renderSubfolders();
}

function startShortcutCapture() {
    capturingShortcut = true;
    shortcutInput.classList.add('capturing');
    shortcutInput.value = 'Appuyez sur les touches...';
}

function stopShortcutCapture() {
    if (capturingShortcut && shortcutInput.value === 'Appuyez sur les touches...') {
        shortcutInput.value = displayShortcut(config.raccourciGlobal);
    }

    capturingShortcut = false;
    shortcutInput.classList.remove('capturing');
}

function handleShortcutCapture(event) {
    if (!capturingShortcut) {
        return;
    }

    event.preventDefault();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return;
    }

    const parts = [];

    if (event.ctrlKey || event.metaKey) {
        parts.push(isMac ? 'Cmd' : 'Ctrl');
    }

    if (event.shiftKey) {
        parts.push('Shift');
    }

    if (event.altKey) {
        parts.push('Alt');
    }

    let key = event.key;

    if (key === ' ') {
        key = 'Space';
    } else if (key.length === 1) {
        key = key.toUpperCase();
    }

    parts.push(key);
    shortcutInput.value = parts.join('+');
    capturingShortcut = false;
    shortcutInput.classList.remove('capturing');
    shortcutInput.blur();
}

async function handleSave() {
    const openBehavior = getCheckedRadioValue('openBehavior', 'newWindow');
    const shortcutToSave = shortcutInput.value === 'Appuyez sur les touches...'
        ? config.raccourciGlobal
        : electronShortcutFromDisplay(shortcutInput.value);
    const visibleIntegrationMode = config.integrationMode === 'hidden'
        ? (config.miniBar?.lastVisibleIntegrationMode || 'floating')
        : config.integrationMode;

    const newConfig = {
        racine: racineInput.value,
        sousDossiers,
        raccourciGlobal: shortcutToSave,
        autoStart: autoStartCheck.checked,
        integrationMode: miniBarCheck.checked ? visibleIntegrationMode : 'hidden',
        openBehavior: OPEN_BEHAVIORS.includes(openBehavior) ? openBehavior : 'newWindow'
    };

    const result = await window.electronAPI.saveSettings(newConfig);

    if (result.success) {
        window.electronAPI.closeSettings();
    } else {
        console.error('Failed to save settings:', result.error);
    }
}

function handleCancel() {
    closeEmojiPicker();
    window.electronAPI.closeSettings();
}

document.addEventListener('DOMContentLoaded', init);
