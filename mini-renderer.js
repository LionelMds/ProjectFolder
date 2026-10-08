// Mini bar — design 2d. The bar shows the number, its year and the subfolders
// as a segmented control; while the field has focus a two-pane panel lists
// the recents and previews what Enter opens. On macOS the pinned bar is the
// menu bar popover of design 2i.
const Shared = window.LauncherShared;
const isMac = window.electronAPI.platform === 'darwin';

const miniBar = document.getElementById('miniBar');
const miniSearch = document.getElementById('miniSearch');
const miniInput = document.getElementById('miniInput');
const miniStatus = document.getElementById('miniStatus');
const miniChip = document.getElementById('miniChip');
const miniSegCell = document.getElementById('miniSegCell');
const miniButtons = document.getElementById('miniButtons');
const pinBtn = document.getElementById('pinBtn');
const miniPanel = document.getElementById('miniPanel');
const miniPanelList = document.getElementById('miniPanelList');
const miniRecentCount = document.getElementById('miniRecentCount');
const miniRecentList = document.getElementById('miniRecentList');
const miniDetail = document.getElementById('miniDetail');
const popoverActions = document.getElementById('popoverActions');

let config = null;
const state = {
    phase: 'empty',
    query: '',
    project: null,
    subfolderIndex: 0,
    filteredRecents: [],
    recentIndex: 0,
    focused: false,
    popover: false,
    requestId: 0,
    validationTimer: null,
    collapsedWidth: null,
    layoutRequest: 0
};

// — DOM helpers —

function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) {
        node.className = options.className;
    }
    if (options.text !== undefined) {
        node.textContent = options.text;
    }
    for (const [name, value] of Object.entries(options.attrs || {})) {
        node.setAttribute(name, value);
    }
    for (const child of [].concat(children)) {
        if (child) {
            node.append(child);
        }
    }
    return node;
}

function icon(name, size = 16, className = '') {
    return el('ui-icon', { className, attrs: { name, size: String(size) } });
}

// Clicks inside the bar and its panel must not take the focus from the field.
function keepFocus(node) {
    node.addEventListener('mousedown', event => event.preventDefault());
    return node;
}

// — data —

function allRecents() {
    return Array.isArray(config.recentFolders) ? config.recentFolders : [];
}

function filterRecents(query) {
    if (!query) {
        return allRecents();
    }
    return allRecents().filter(recent => String(recent.projectNumber || '').includes(query));
}

function panelOpen() {
    return state.popover || state.focused;
}

// — input —

function handleInput() {
    const value = miniInput.value.replace(/\D/g, '').substring(0, 4);
    if (miniInput.value !== value) {
        miniInput.value = value;
    }
    updateQuery(value);
}

function updateQuery(value) {
    clearTimeout(state.validationTimer);
    const requestId = ++state.requestId;
    state.query = value;
    state.project = null;
    state.filteredRecents = filterRecents(value);
    state.recentIndex = 0;

    if (value === '') {
        state.phase = 'empty';
    } else if (Shared.DIGITS_ONLY.test(value)) {
        state.phase = 'searching';
        state.validationTimer = setTimeout(() => resolveProject(value, requestId), 100);
    } else {
        state.phase = 'partial';
    }
    renderAndLayout();
}

async function resolveProject(value, requestId) {
    const result = await window.electronAPI.resolveProject(value);
    if (requestId !== state.requestId) {
        return;
    }
    if (result.success && result.found) {
        state.phase = 'found';
        state.project = result;
        state.subfolderIndex = Shared.defaultSubfolderIndex(config.sousDossiers);
    } else {
        state.phase = 'notFound';
    }
    renderAndLayout();
}

function clearInput() {
    clearTimeout(state.validationTimer);
    state.requestId += 1;
    miniInput.value = '';
    state.query = '';
    state.phase = 'empty';
    state.project = null;
    state.filteredRecents = allRecents();
    state.recentIndex = 0;
    renderAndLayout();
}

// — rendering —

function renderAndLayout() {
    render();
    layout();
}

function render() {
    miniBar.classList.toggle('focused', state.focused && !state.popover);
    renderStatus();
    renderSegment();
    miniPanel.hidden = !panelOpen();
    if (panelOpen()) {
        renderRecents();
        renderDetail();
    }
}

function renderStatus() {
    let content = null;
    miniStatus.className = 'mini-status';
    miniStatus.title = '';
    if (state.phase === 'found') {
        content = el('span', { className: 'tag tag-accent', text: state.project.year });
    } else if (state.phase === 'searching') {
        content = icon('loader-circle', 14, 'spin');
    } else if (state.phase === 'notFound') {
        miniStatus.classList.add('missing');
        miniStatus.title = 'Projet introuvable';
        content = icon('x', 14);
    }
    miniStatus.replaceChildren(...(content ? [content] : []));
    miniChip.hidden = !state.popover;
    miniChip.textContent = Shared.formatAcceleratorChip(config.raccourciGlobal, isMac);
}

// Subfolders as a segmented control once the project is found; the
// subfolder bound to Enter carries the accent.
function renderSegment() {
    const show = state.phase === 'found' && !state.popover;
    miniSegCell.hidden = !show;
    if (!show) {
        miniButtons.replaceChildren();
        return;
    }
    miniButtons.replaceChildren(...config.sousDossiers.map((subfolder, index) => {
        const key = subfolder.raccourci ? ` (${Shared.formatKeyGlyph(subfolder.raccourci, isMac)})` : '';
        const button = keepFocus(el('button', {
            className: 'seg-opt',
            attrs: {
                type: 'button',
                tabindex: '-1',
                title: `${subfolder.nom}${key}`,
                'aria-label': `Ouvrir ${subfolder.nom}`,
                'aria-pressed': String(index === state.subfolderIndex)
            }
        }, icon(subfolder.icone, 15)));
        button.addEventListener('click', () => openSubfolder(index));
        return button;
    }));
}

function renderRecents() {
    const total = allRecents().length;
    const recents = state.filteredRecents;
    const selectable = state.phase !== 'found';
    miniRecentCount.textContent = state.query ? `${recents.length} / ${total}` : String(total);

    if (recents.length === 0) {
        miniRecentList.replaceChildren(el('div', {
            className: 'note',
            text: total === 0 ? 'Aucun dossier récent' : 'Aucun récent correspondant'
        }));
        return;
    }

    miniRecentList.replaceChildren(...recents.map((recent, index) => {
        const selected = selectable && index === state.recentIndex;
        const label = Shared.formatRecentLabel(recent);
        const row = keepFocus(el('button', {
            className: `list-row${selected ? ' selected' : ''}`,
            attrs: { type: 'button', role: 'option', tabindex: '-1', 'aria-selected': String(selected), title: recent.folderPath || '' }
        }, [
            icon('clock', 14, 'row-icon'),
            el('span', { className: 'row-label' }, Shared.splitMatch(label, state.query).map(part => (
                part.match ? el('b', { className: 'match', text: part.text }) : document.createTextNode(part.text)
            )))
        ]));
        row.addEventListener('mouseenter', () => {
            if (selectable && state.recentIndex !== index) {
                state.recentIndex = index;
                render();
            }
        });
        row.addEventListener('click', () => openRecent(recent));
        return row;
    }));
}

function headline(number, tag, pending = false) {
    return el('div', { className: 'headline' }, [
        el('span', { className: `headline-number${pending ? ' pending' : ''}`, text: number }),
        tag
    ]);
}

function compactTable(rows) {
    return el('div', { className: 'table-scroll' }, el('table', { className: 'table' }, el('tbody', {}, rows)));
}

function subfolderRow(subfolder, selected, key, onClick) {
    const row = keepFocus(el('tr', { className: selected ? 'selected' : '' }, [
        el('td', {}, el('span', { className: 'cell-name' }, [icon(subfolder.icone, 15, 'row-icon'), el('span', { text: subfolder.nom })])),
        el('td', { className: `num${key === '—' ? ' text-muted' : ''}`, text: key })
    ]));
    row.addEventListener('click', onClick);
    return row;
}

function renderDetail() {
    const nodes = [];
    if (state.phase === 'found') {
        nodes.push(headline(state.project.projectNumber, el('span', { className: 'tag tag-accent', text: 'trouvé' })));
        nodes.push(compactTable(config.sousDossiers.map((subfolder, index) => subfolderRow(
            subfolder,
            index === state.subfolderIndex,
            Shared.formatKeyGlyph(subfolder.raccourci, isMac),
            () => openSubfolder(index)
        ))));
    } else if (state.phase === 'searching') {
        nodes.push(headline(`YYYY-${state.query}`, el('span', { className: 'tag tag-neutral' }, [icon('loader-circle', 11, 'spin'), 'recherche']), true));
    } else if (state.phase === 'notFound') {
        nodes.push(headline(state.query, el('span', { className: 'tag tag-outline', text: 'introuvable' })));
        nodes.push(el('div', { className: 'note' }, [icon('triangle-alert', 15), `Aucun dossier YYYY-${state.query}`]));
    } else {
        const recent = state.filteredRecents[state.recentIndex];
        if (!recent) {
            nodes.push(el('div', { className: 'note' }, [icon('keyboard', 15), 'Tapez les 4 chiffres d’un projet']));
        } else {
            nodes.push(headline(recent.projectNumber || Shared.formatRecentLabel(recent), el('span', { className: 'tag tag-neutral', text: 'récent' })));
            nodes.push(compactTable(recentPreviewRows(recent)));
        }
    }
    miniDetail.replaceChildren(...nodes);
}

// The recent's own subfolder (Enter reopens it), then the project root.
function recentPreviewRows(recent) {
    const recentIndex = Shared.findRecentSubfolderIndex(recent, config.sousDossiers);
    const recentSubfolder = recentIndex >= 0
        ? config.sousDossiers[recentIndex]
        : { nom: recent.subfolderName || 'Dossier', icone: 'folder' };
    const rows = [subfolderRow(recentSubfolder, true, '↵', () => openRecent(recent))];
    const rootIndex = config.sousDossiers.findIndex(subfolder => !subfolder.chemin);
    if (recent.projectNumber && rootIndex >= 0 && rootIndex !== recentIndex) {
        rows.push(subfolderRow(config.sousDossiers[rootIndex], false, '—', () => openProject(recent.projectNumber, rootIndex)));
    }
    return rows;
}

// — window layout —

// Sends the measured content size; the main process sizes the window and
// says whether the panel opens below or above the bar (on the taskbar).
async function layout() {
    const request = ++state.layoutRequest;
    document.body.classList.add('measuring');
    const barWidth = Math.ceil(miniBar.getBoundingClientRect().width);
    if (state.collapsedWidth === null && state.phase === 'empty' && !state.focused) {
        state.collapsedWidth = barWidth;
    }

    const panelRect = miniPanel.hidden ? null : miniPanel.getBoundingClientRect();
    const layoutRequest = state.popover
        ? {
            barWidth: Math.ceil(panelRect.width),
            collapsedWidth: Math.ceil(panelRect.width),
            barHeight: Math.ceil(panelRect.height) + 7,
            panelWidth: 0,
            panelHeight: 0
        }
        : {
            barWidth,
            collapsedWidth: state.collapsedWidth ?? barWidth,
            panelWidth: panelRect ? Math.ceil(panelRect.width) : 0,
            panelHeight: panelRect ? Math.ceil(panelRect.height) : 0
        };

    const result = await window.electronAPI.setMiniLayout(layoutRequest);
    if (request !== state.layoutRequest) {
        return;
    }
    if (result && result.success) {
        document.body.classList.toggle('opens-up', result.direction === 'up');
        document.body.classList.toggle('align-right', result.align === 'right');
    }
    document.body.classList.remove('measuring');
}

// — actions —

async function openSubfolder(index) {
    if (state.phase !== 'found') {
        return;
    }
    await openProject(state.project.projectNumber, index);
}

async function openProject(projectNumber, index) {
    const result = await window.electronAPI.openProjectFolder(projectNumber, index);
    if (!result.success) {
        console.error('Failed to open folder:', result.error);
        return;
    }
    afterOpen();
}

async function openRecent(recent) {
    const result = await window.electronAPI.openRecentFolder(recent.id);
    if (!result.success) {
        console.error('Failed to open recent folder:', result.error);
        return;
    }
    afterOpen();
}

function afterOpen() {
    miniInput.blur();
    setTimeout(clearInput, 100);
}

// — keyboard and focus —

function moveSelection(delta) {
    const wrap = (index, length) => (index + delta + length) % length;
    if (state.phase === 'found') {
        state.subfolderIndex = wrap(state.subfolderIndex, config.sousDossiers.length);
    } else if (state.filteredRecents.length > 0 && state.phase !== 'searching') {
        state.recentIndex = wrap(state.recentIndex, state.filteredRecents.length);
    } else {
        return;
    }
    render();
}

function handleKeydown(event) {
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            moveSelection(1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            moveSelection(-1);
            break;
        case 'Enter': {
            event.preventDefault();
            if (state.phase === 'found') {
                openSubfolder(Shared.resolveSubfolderIndex(event, config.sousDossiers, state.subfolderIndex));
            } else if (state.phase !== 'searching' && state.phase !== 'notFound') {
                const recent = state.filteredRecents[state.recentIndex];
                if (recent) {
                    openRecent(recent);
                }
            }
            break;
        }
        case 'Escape':
            event.preventDefault();
            clearInput();
            miniInput.blur();
            break;
    }
}

function setFocused(focused) {
    if (state.focused === focused) {
        return;
    }
    state.focused = focused;
    renderAndLayout();
}

async function handlePinToggle(event) {
    event.preventDefault();
    const result = await window.electronAPI.toggleMiniPin();
    if (!result.success) {
        console.error('Failed to toggle mini pin:', result.error);
    }
}

function handlePopoverAction(action) {
    const actions = {
        'mini-bar': () => window.electronAPI.toggleMiniPin(),
        settings: () => window.electronAPI.openSettings(),
        update: () => window.electronAPI.openUpdateCenter(),
        quit: () => window.electronAPI.quitApp()
    };
    actions[action]?.();
}

// — lifecycle —

function applyModeClasses() {
    const pinned = config.integrationMode === 'docked';
    state.popover = isMac && pinned;
    document.body.classList.toggle('docked', pinned);
    document.body.classList.toggle('docked-move-mode', Boolean(config.dockedMoveMode));
    document.body.classList.toggle('popover', state.popover);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.title = pinned ? 'Désépingler' : 'Épingler à la barre des tâches';
    pinBtn.setAttribute('aria-label', pinBtn.title);
    pinBtn.replaceChildren(icon(pinned ? 'pin-off' : 'pin', 15));

    // The popover carries the search field in its list pane.
    if (state.popover && miniSearch.parentElement !== miniPanelList) {
        miniPanelList.prepend(miniSearch);
    }
    popoverActions.hidden = !state.popover;
}

async function init() {
    config = await window.electronAPI.getConfig();
    applyModeClasses();
    state.filteredRecents = allRecents();

    miniInput.addEventListener('input', handleInput);
    miniInput.addEventListener('keydown', handleKeydown);
    miniInput.addEventListener('focus', () => {
        window.electronAPI.miniBarFocused();
        setFocused(true);
    });
    miniInput.addEventListener('blur', () => setFocused(false));
    window.addEventListener('blur', () => setFocused(false));
    keepFocus(pinBtn).addEventListener('click', handlePinToggle);
    for (const button of popoverActions.querySelectorAll('[data-action]')) {
        keepFocus(button).addEventListener('click', () => handlePopoverAction(button.dataset.action));
    }

    window.electronAPI.onConfigUpdated(async () => {
        config = await window.electronAPI.getConfig();
        applyModeClasses();
        state.filteredRecents = filterRecents(state.query);
        state.recentIndex = Math.min(state.recentIndex, Math.max(state.filteredRecents.length - 1, 0));
        renderAndLayout();
    });
    window.electronAPI.onMiniPopoverShown(() => {
        clearInput();
        miniInput.focus();
    });

    render();
    // Measure once the bundled fonts give the bar its final width.
    await document.fonts.ready;
    layout();
}

document.addEventListener('DOMContentLoaded', init);
