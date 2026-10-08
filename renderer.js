// Search popup — design 2a/2c: recents on the left, a preview of what Enter
// will open on the right. States: empty (preview of the selected recent),
// partial (1–3 digits, filtered recents), searching, found, not found.
const Shared = window.LauncherShared;
const isMac = window.electronAPI.platform === 'darwin';
const YEARS_TTL_MS = 60 * 1000;

const projectInput = document.getElementById('projectInput');
const searchField = document.getElementById('searchField');
const searchMirror = document.getElementById('searchMirror');
const searchGhost = document.getElementById('searchGhost');
const shortcutChip = document.getElementById('shortcutChip');
const recentCount = document.getElementById('recentCount');
const recentList = document.getElementById('recentList');
const detail = document.getElementById('detail');

let config = null;
const state = {
    phase: 'empty',
    query: '',
    filteredRecents: [],
    recentIndex: 0,
    project: null,
    subfolderIndex: 0,
    nearest: [],
    nearestIndex: 0,
    error: null,
    openBehavior: 'newTab',
    requestId: 0,
    validationTimer: null,
    years: [],
    yearsLoadedAt: 0,
    altPressedAlone: false
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

function highlighted(text, query) {
    return Shared.splitMatch(text, query).map(part => (
        part.match ? el('b', { className: 'match', text: part.text }) : document.createTextNode(part.text)
    ));
}

// — data —

function allRecents() {
    return Array.isArray(config.recentFolders) ? config.recentFolders : [];
}

function filterRecents(query) {
    const recents = allRecents();
    if (!query) {
        return recents;
    }
    const needle = query.toLowerCase();
    return recents.filter(recent => [
        recent.projectNumber,
        recent.subfolderName,
        recent.subfolderPath
    ].filter(Boolean).join(' ').toLowerCase().includes(needle));
}

function selectedRecent() {
    return state.filteredRecents[state.recentIndex] || null;
}

async function loadYears(force = false) {
    if (!force && Date.now() - state.yearsLoadedAt < YEARS_TTL_MS) {
        return;
    }
    const result = await window.electronAPI.getProjectYears();
    if (result && result.success) {
        state.years = result.years;
        state.yearsLoadedAt = Date.now();
    }
}

// — input —

function handleInput() {
    let value = projectInput.value.trim();
    value = value.includes('-')
        ? value.replace(/[^\d-]/g, '').substring(0, 9)
        : value.replace(/\D/g, '').substring(0, 4);
    if (projectInput.value !== value) {
        projectInput.value = value;
    }
    updateQuery(value);
}

function updateQuery(value) {
    clearTimeout(state.validationTimer);
    const requestId = ++state.requestId;
    state.query = value;
    state.project = null;
    state.nearest = [];
    state.error = null;

    if (value === '') {
        state.phase = 'empty';
    } else if (Shared.DIGITS_ONLY.test(value) || Shared.FULL_PROJECT_NUMBER.test(value)) {
        state.phase = 'searching';
        state.validationTimer = setTimeout(() => resolveProject(value, requestId), 100);
    } else if (/^\d{1,3}$/.test(value)) {
        state.phase = 'partial';
    } else {
        state.phase = 'invalid';
    }

    state.filteredRecents = filterRecents(value);
    state.recentIndex = 0;
    render();
}

async function resolveProject(value, requestId) {
    loadYears().then(() => {
        if (requestId === state.requestId && state.phase === 'searching') {
            render();
        }
    });
    const result = await window.electronAPI.resolveProject(value);
    if (requestId !== state.requestId) {
        return;
    }

    if (result.success && result.found) {
        state.phase = 'found';
        state.project = result;
        state.subfolderIndex = Shared.defaultSubfolderIndex(config.sousDossiers);
        render();
        return;
    }

    state.phase = 'notFound';
    state.error = result.success ? null : result.error;
    render();
    await loadYears();
    const nearest = await window.electronAPI.findNearestProjects(value);
    if (requestId === state.requestId && nearest && nearest.success) {
        state.nearest = nearest.projects;
        state.nearestIndex = 0;
        render();
    }
}

// — rendering —

function render() {
    renderSearchField();
    renderRecents();
    renderDetail();
}

function renderSearchField() {
    searchField.classList.toggle('not-found', state.phase === 'notFound');
    const remaining = /^\d{1,3}$/.test(state.query) ? 4 - state.query.length : 0;
    searchMirror.textContent = state.query;
    searchGhost.textContent = '_'.repeat(remaining);
    searchGhost.style.left = `${searchMirror.offsetWidth}px`;
    shortcutChip.textContent = Shared.formatAcceleratorChip(config.raccourciGlobal, isMac);
    // Design 2a/2c: the global shortcut chip appears once the project is found.
    shortcutChip.hidden = state.phase !== 'found';
}

function recentsAreFiltered() {
    return state.phase !== 'empty' && state.phase !== 'found';
}

function renderRecents() {
    const total = allRecents().length;
    const recents = recentsAreFiltered() ? state.filteredRecents : allRecents();
    const selectable = state.phase === 'empty' || state.phase === 'partial' || state.phase === 'invalid';
    recentCount.textContent = recentsAreFiltered() ? `${recents.length} / ${total}` : String(total);

    if (recents.length === 0) {
        recentList.replaceChildren(el('div', {
            className: 'note',
            text: total === 0 ? 'Aucun dossier récent' : 'Aucun récent correspondant'
        }));
        return;
    }

    const query = state.phase === 'found' ? '' : state.query;
    recentList.replaceChildren(...recents.map((recent, index) => {
        const selected = selectable && index === state.recentIndex;
        const row = el('button', {
            className: `list-row${selected ? ' selected' : ''}`,
            attrs: {
                type: 'button',
                role: 'option',
                tabindex: '-1',
                'aria-selected': String(selected),
                title: recent.folderPath || ''
            }
        }, [
            icon('clock', 15, 'row-icon'),
            el('span', { className: 'row-label' }, highlighted(Shared.formatRecentLabel(recent), query))
        ]);
        row.addEventListener('mousedown', event => event.preventDefault());
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

function renderDetail() {
    const builders = {
        empty: renderRecentPreview,
        partial: renderRecentPreview,
        invalid: renderInvalid,
        searching: renderSearching,
        found: renderFound,
        notFound: renderNotFound
    };
    detail.replaceChildren(...builders[state.phase]());
}

function headline(number, tag, meta, pending = false) {
    return el('div', { className: 'headline' }, [
        el('span', { className: `headline-number${pending ? ' pending' : ''}`, text: number }),
        tag,
        meta ? el('span', { className: 'headline-meta', text: meta, attrs: { title: meta } }) : null
    ]);
}

function tag(text, variant, iconName = null, spinning = false) {
    return el('span', { className: `tag tag-${variant}` }, [
        iconName ? icon(iconName, 11, spinning ? 'spin' : '') : null,
        text
    ]);
}

function table(headers, rows) {
    return el('div', { className: 'table-scroll' }, el('table', { className: 'table' }, [
        el('thead', {}, el('tr', {}, headers.map((header, index) => el('th', {
            className: index === headers.length - 1 ? 'num' : '',
            text: header
        })))),
        el('tbody', {}, rows)
    ]));
}

function subfolderRow(subfolder, options) {
    const row = el('tr', { className: options.selected ? 'selected' : '' }, [
        el('td', {}, el('span', { className: 'cell-name' }, [
            icon(subfolder.icone, 16, 'row-icon'),
            el('span', { text: subfolder.nom })
        ])),
        options.showPath === false ? null : el('td', {
            className: 'cell-path text-muted',
            text: subfolder.chemin || '—',
            attrs: { title: subfolder.chemin || 'Racine du projet' }
        }),
        el('td', { className: 'num', text: options.key })
    ]);
    if (options.onHover) {
        row.addEventListener('mouseenter', options.onHover);
    }
    if (options.onClick) {
        row.addEventListener('click', options.onClick);
    }
    return row;
}

function hintNote(text) {
    return el('div', { className: 'note' }, [icon('keyboard', 15), text]);
}

// 01 / 02 — the right pane previews the recent that Enter reopens.
function renderRecentPreview() {
    const recent = selectedRecent();
    const nodes = [];
    if (state.phase === 'partial') {
        nodes.push(hintNote('Tapez 4 chiffres ou ouvrez un récent'));
    }
    if (!recent) {
        if (state.phase === 'empty') {
            nodes.push(hintNote('Tapez les 4 chiffres d’un numéro de projet'));
        }
        return nodes;
    }

    nodes.push(headline(
        recent.projectNumber || Shared.formatRecentLabel(recent),
        tag('récent', 'neutral'),
        state.phase === 'empty' ? `ouvert ${Shared.formatRelativeTime(recent.openedAt)}` : ''
    ));

    const recentIndex = Shared.findRecentSubfolderIndex(recent, config.sousDossiers);
    const recentSubfolder = recentIndex >= 0
        ? config.sousDossiers[recentIndex]
        : { nom: recent.subfolderName || 'Dossier', chemin: recent.subfolderPath, icone: 'folder' };
    const subfolders = state.phase === 'partial' || recentIndex < 0
        ? [{ subfolder: recentSubfolder, index: recentIndex }]
        : config.sousDossiers.map((subfolder, index) => ({ subfolder, index }));

    nodes.push(table(['Sous-dossier', 'Chemin', 'Touche'], subfolders.map(({ subfolder, index }) => {
        const isRecent = index === recentIndex;
        return subfolderRow(subfolder, {
            selected: isRecent,
            key: isRecent ? '↵' : '—',
            onClick: isRecent || !recent.projectNumber
                ? () => openRecent(recent)
                : () => openProject(recent.projectNumber, index)
        });
    })));

    if (state.phase === 'empty') {
        nodes.push(el('div', { className: 'detail-footer', text: '↵ rouvre ce récent · tapez un numéro pour chercher' }));
    }
    return nodes;
}

function renderInvalid() {
    return [el('div', { className: 'alert' }, [
        icon('triangle-alert', 18),
        el('div', {}, [
            'Format invalide.',
            el('div', { className: 'alert-detail', text: 'Tapez 4 chiffres ou un numéro complet au format 20XX-XXXX.' })
        ])
    ])];
}

function searchedYearsLabel() {
    if (Shared.FULL_PROJECT_NUMBER.test(state.query)) {
        return state.query.slice(0, 4);
    }
    return state.years.join(' → ');
}

// 03 — searching: greyed number, spinner tag, skeleton rows.
function renderSearching() {
    const number = Shared.DIGITS_ONLY.test(state.query) ? `YYYY-${state.query}` : state.query;
    const widths = [[120, 90], [100, 130], [110, 80]];
    return [
        headline(number, tag('recherche', 'neutral', 'loader-circle', true), searchedYearsLabel(), true),
        table(['Sous-dossier', 'Chemin', 'Touche'], widths.map(([name, path]) => el('tr', {}, [
            el('td', {}, el('span', { className: 'skeleton', attrs: { style: `width:${name}px` } })),
            el('td', {}, el('span', { className: 'skeleton skeleton-path', attrs: { style: `width:${path}px` } })),
            el('td')
        ])))
    ];
}

// 2a — found: subfolder table, open mode and key reminders.
function renderFound() {
    const project = state.project;
    const rows = config.sousDossiers.map((subfolder, index) => subfolderRow(subfolder, {
        selected: index === state.subfolderIndex,
        key: Shared.formatKeyGlyph(subfolder.raccourci, isMac),
        onHover: () => {
            if (state.subfolderIndex !== index) {
                state.subfolderIndex = index;
                renderDetail();
            }
        },
        onClick: () => openProject(project.projectNumber, index)
    }));

    return [
        headline(project.projectNumber, tag('trouvé', 'accent'), project.projectPath || ''),
        table(['Sous-dossier', 'Chemin', 'Touche'], rows),
        el('div', { className: 'detail-footer' }, [
            el('span', { text: 'Ouvrir dans' }),
            openModeControl(),
            el('span', { className: 'hints', text: `↑↓ · ${isMac ? '⌥' : 'Alt'} changer · Échap` })
        ])
    ];
}

function openModeControl() {
    return el('div', { className: 'seg', attrs: { role: 'group', 'aria-label': 'Ouvrir dans' } },
        Shared.OPEN_BEHAVIOR_OPTIONS.map(option => {
            const button = el('button', {
                className: 'seg-opt',
                text: option.label,
                attrs: {
                    type: 'button',
                    tabindex: '-1',
                    'aria-pressed': String(option.value === state.openBehavior)
                }
            });
            // Keep the keyboard focus in the search field.
            button.addEventListener('mousedown', event => event.preventDefault());
            button.addEventListener('click', () => {
                state.openBehavior = option.value;
                renderDetail();
            });
            return button;
        }));
}

// 04 — not found: what was searched and the closest existing numbers.
function renderNotFound() {
    const searched = Shared.FULL_PROJECT_NUMBER.test(state.query)
        ? state.query.slice(0, 4)
        : (state.years.length > 0 ? `${state.years[state.years.length - 1]} – ${state.years[0]}` : '');
    const pattern = Shared.DIGITS_ONLY.test(state.query) ? `YYYY-${state.query}` : state.query;
    const root = config.racine || '';
    const message = state.error
        ? [state.error]
        : (root
            ? ['Aucun dossier ', el('b', { text: pattern }), ` sous ${root}.`]
            : ['Aucun dossier racine n’est configuré.']);

    const nodes = [
        headline(state.query, tag('introuvable', 'outline'), searched ? `cherché dans ${searched}` : ''),
        el('div', { className: 'alert' }, [
            icon('triangle-alert', 18),
            el('div', {}, [
                ...message,
                el('div', { className: 'alert-detail', text: 'Vérifiez le numéro ou le dossier racine dans les Paramètres.' })
            ])
        ])
    ];

    if (state.nearest.length > 0) {
        nodes.push(table(['Le plus proche', 'Année', 'Touche'], state.nearest.map((project, index) => {
            const selected = index === state.nearestIndex;
            const row = el('tr', { className: selected ? 'selected' : '' }, [
                el('td', {}, el('span', { className: 'cell-name' }, [
                    icon('folder', 16, 'row-icon'),
                    el('span', { text: project.projectNumber })
                ])),
                el('td', { className: 'text-muted', text: project.year }),
                el('td', { className: 'num', text: selected ? '↵' : '—' })
            ]);
            row.addEventListener('mouseenter', () => {
                if (state.nearestIndex !== index) {
                    state.nearestIndex = index;
                    renderDetail();
                }
            });
            row.addEventListener('click', () => useNearest(project));
            return row;
        })));
    }
    return nodes;
}

// — actions —

async function openProject(projectNumber, subfolderIndex) {
    const result = await window.electronAPI.openProjectFolder(projectNumber, subfolderIndex, state.openBehavior);
    if (!result.success) {
        console.error('Failed to open folder:', result.error);
    }
}

async function openRecent(recent) {
    const result = await window.electronAPI.openRecentFolder(recent.id);
    if (!result.success) {
        console.error('Failed to open recent folder:', result.error);
    }
}

function useNearest(project) {
    projectInput.value = project.projectNumber;
    projectInput.focus();
    updateQuery(project.projectNumber);
}

// — keyboard —

function moveSelection(delta) {
    const wrap = (index, length) => (index + delta + length) % length;
    if (state.phase === 'found') {
        state.subfolderIndex = wrap(state.subfolderIndex, config.sousDossiers.length);
    } else if (state.phase === 'notFound') {
        if (state.nearest.length === 0) {
            return;
        }
        state.nearestIndex = wrap(state.nearestIndex, state.nearest.length);
    } else if (state.filteredRecents.length > 0 && state.phase !== 'searching') {
        state.recentIndex = wrap(state.recentIndex, state.filteredRecents.length);
    } else {
        return;
    }
    render();
}

function handleEnter(event) {
    if (state.phase === 'found') {
        const index = Shared.resolveSubfolderIndex(event, config.sousDossiers, state.subfolderIndex);
        openProject(state.project.projectNumber, index);
    } else if (state.phase === 'notFound') {
        const project = state.nearest[state.nearestIndex];
        if (project) {
            useNearest(project);
        }
    } else if (state.phase !== 'searching') {
        const recent = selectedRecent();
        if (recent) {
            openRecent(recent);
        }
    }
}

function handleKeydown(event) {
    if (event.key !== 'Alt') {
        state.altPressedAlone = false;
    }

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
        case 'Tab':
            event.preventDefault();
            moveSelection(event.shiftKey ? -1 : 1);
            break;
        case 'Enter':
            event.preventDefault();
            handleEnter(event);
            break;
        case 'Alt':
            // Alt pressed and released alone switches the open mode.
            event.preventDefault();
            state.altPressedAlone = !event.repeat;
            break;
    }
}

function handleKeyup(event) {
    if (event.key === 'Alt' && state.altPressedAlone) {
        event.preventDefault();
        state.altPressedAlone = false;
        if (state.phase === 'found') {
            state.openBehavior = Shared.nextOpenBehavior(state.openBehavior);
            renderDetail();
        }
    }
}

// — lifecycle —

function resetState() {
    clearTimeout(state.validationTimer);
    state.requestId += 1;
    state.query = '';
    state.phase = 'empty';
    state.project = null;
    state.nearest = [];
    state.error = null;
    state.filteredRecents = allRecents();
    state.recentIndex = 0;
    state.openBehavior = config.openBehavior;
    projectInput.value = '';
    render();
}

async function init() {
    config = await window.electronAPI.getConfig();
    if (isMac) {
        document.body.classList.add('mac');
    }

    projectInput.addEventListener('input', handleInput);
    projectInput.addEventListener('keydown', handleKeydown);
    projectInput.addEventListener('keyup', handleKeyup);

    window.electronAPI.onWindowShown(async () => {
        config = await window.electronAPI.getConfig();
        resetState();
        projectInput.focus();
        loadYears(true);
    });
    window.electronAPI.onWindowHidden(() => resetState());
    window.electronAPI.onConfigUpdated(async () => {
        config = await window.electronAPI.getConfig();
        state.filteredRecents = filterRecents(state.query);
        state.recentIndex = Math.min(state.recentIndex, Math.max(state.filteredRecents.length - 1, 0));
        render();
    });

    resetState();
    // The bundled fonts change the width of the typed digits.
    document.fonts.ready.then(() => renderSearchField());
}

document.addEventListener('DOMContentLoaded', init);
