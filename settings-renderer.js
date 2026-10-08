// Settings — design 2e: sections on the left, content on the right, unsaved
// changes in the footer.
const Shared = window.LauncherShared;
const Icons = window.LauncherIcons;
const isMac = window.electronAPI.platform === 'darwin';

const sectionList = document.getElementById('sectionList');
const sectionContent = document.getElementById('sectionContent');
const appVersion = document.getElementById('appVersion');
const settingsStatus = document.getElementById('settingsStatus');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');

const SHORTCUT_OPTIONS = ['Enter', 'Ctrl+Enter', 'Shift+Enter', 'Alt+Enter'];
const QUICK_ICONS = ['folder', 'ruler', 'factory', 'file-text'];
const SECTIONS = [
    { id: 'root', label: 'Dossier racine', icon: 'folder', render: renderRootSection },
    { id: 'subfolders', label: 'Sous-dossiers', icon: 'folder-open', render: renderSubfoldersSection },
    { id: 'shortcut', label: 'Raccourci global', icon: 'keyboard', render: renderShortcutSection },
    { id: 'mini', label: 'Mini-barre', icon: 'panel-bottom', render: renderMiniSection },
    { id: 'startup', label: 'Démarrage', icon: 'power', render: renderStartupSection },
    { id: 'update', label: 'Mise à jour', icon: 'download', render: renderUpdateSection }
];

let config = null;
let form = null;
let initialForm = '';
const view = {
    section: 'subfolders',
    selectedSubfolder: 0,
    capturingGlobal: false,
    capturingSubfolderKey: false,
    iconPickerOpen: false,
    rootInfo: null,
    dragIndex: null,
    status: '',
    statusIsError: false
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
    for (const [name, handler] of Object.entries(options.on || {})) {
        node.addEventListener(name, handler);
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

function corners() {
    return ['tl', 'tr', 'bl', 'br'].map(corner => el('i', { className: `corner ${corner}` }));
}

function sectionTitle(text, extra = []) {
    return el('div', { className: 'headline' }, [el('span', { className: 'headline-number', text }), ...extra]);
}

function field(label, control, attrs = {}) {
    return el('div', { className: 'field', attrs }, [el('label', { text: label }), control]);
}

function segmented(options, value, onChange, label) {
    return el('div', { className: 'seg', attrs: { role: 'radiogroup', 'aria-label': label } }, options.map(option => el('button', {
        className: 'seg-opt',
        text: option.label,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(option.value === value) },
        on: { click: () => onChange(option.value) }
    })));
}

function switchControl(checked, label, onChange) {
    return el('button', {
        className: 'switch',
        attrs: { type: 'button', role: 'switch', 'aria-checked': String(checked), 'aria-label': label },
        on: { click: () => onChange(!checked) }
    });
}

// — form state —

function formFromConfig(source) {
    return {
        racine: source.racine || '',
        sousDossiers: JSON.parse(JSON.stringify(source.sousDossiers || [])),
        raccourciGlobal: source.raccourciGlobal,
        autoStart: Boolean(source.autoStart),
        miniBarVisible: source.integrationMode !== 'hidden',
        openBehavior: source.openBehavior || 'newTab'
    };
}

function isDirty() {
    return JSON.stringify(form) !== initialForm;
}

function setStatus(message, isError = false) {
    view.status = message;
    view.statusIsError = isError;
    renderFooter();
}

function renderFooter() {
    const message = view.status || (isDirty() ? 'Modifications non enregistrées' : '');
    settingsStatus.textContent = message;
    settingsStatus.className = view.statusIsError ? 'settings-status error' : 'settings-status';
}

function changed() {
    view.status = '';
    view.statusIsError = false;
    renderFooter();
}

// — navigation —

function renderNav() {
    sectionList.replaceChildren(...SECTIONS.map(section => {
        const selected = section.id === view.section;
        return el('button', {
            className: `list-row${selected ? ' selected' : ''}`,
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(selected) },
            on: { click: () => showSection(section.id) }
        }, [icon(section.icon, 15, 'row-icon'), el('span', { className: 'row-label', text: section.label })]);
    }));
}

function showSection(id) {
    view.section = id;
    view.iconPickerOpen = false;
    view.capturingGlobal = false;
    view.capturingSubfolderKey = false;
    renderNav();
    renderSection();
}

function renderSection() {
    const section = SECTIONS.find(item => item.id === view.section);
    sectionContent.replaceChildren(...section.render());
}

// — 01 root folder —

function renderRootSection() {
    const input = el('input', {
        className: 'input',
        attrs: { type: 'text', readonly: '', value: form.racine, placeholder: 'Cliquez sur Parcourir pour choisir…', 'aria-label': 'Dossier racine' }
    });
    const nodes = [
        sectionTitle('Dossier racine'),
        el('div', { className: 'path-row' }, [
            input,
            el('button', { className: 'btn btn-secondary', text: 'Parcourir…', attrs: { type: 'button' }, on: { click: browseRoot } })
        ]),
        el('p', { className: 'help', text: 'Les projets y sont rangés par année : 2026\\2026-4889.' })
    ];

    const info = view.rootInfo;
    if (form.racine && info) {
        const years = info.years || [];
        nodes.push(el('div', { className: 'structure' }, [
            el('div', { className: 'kicker' }, el('span', { text: 'Structure détectée' })),
            years.length > 0
                ? el('div', { className: 'structure-years' }, years.flatMap(year => [
                    icon('folder', 15),
                    el('span', { text: year.year }),
                    el('span', { className: 'text-muted', text: `${year.projects} projet${year.projects > 1 ? 's' : ''}` })
                ]))
                : null,
            el('div', { className: `structure-status${years.length > 0 ? '' : ' warning'}` }, years.length > 0
                ? [icon('check', 14), `Format YYYY-NNNN reconnu · ${years.length} année${years.length > 1 ? 's' : ''}`]
                : [icon('triangle-alert', 14), info.exists ? 'Aucun dossier d’année (20XX) dans ce dossier.' : 'Ce dossier est introuvable.'])
        ]));
    }
    return nodes;
}

async function inspectRoot() {
    view.rootInfo = null;
    if (!form.racine) {
        return;
    }
    const root = form.racine;
    const result = await window.electronAPI.inspectRoot(root);
    if (form.racine === root && result && result.success) {
        view.rootInfo = result;
        if (view.section === 'root') {
            renderSection();
        }
    }
}

async function browseRoot() {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
        form.racine = folderPath;
        changed();
        renderSection();
        inspectRoot();
    }
}

// — 02 subfolders —

function renderSubfoldersSection() {
    view.selectedSubfolder = Math.min(view.selectedSubfolder, form.sousDossiers.length - 1);
    return [
        sectionTitle('Sous-dossiers', [
            el('span', { className: 'tag tag-neutral', text: String(form.sousDossiers.length) }),
            el('button', {
                className: 'btn btn-secondary',
                attrs: { type: 'button' },
                on: { click: addSubfolder }
            }, [icon('plus', 14), 'Ajouter'])
        ]),
        el('div', { className: 'table-scroll', attrs: { id: 'subfolderTable' } }, subfolderTable()),
        subfolderEditor(),
        el('div', { className: 'inline-setting' }, [
            el('span', { text: 'Ouvrir par défaut dans' }),
            segmented(Shared.OPEN_BEHAVIOR_OPTIONS, form.openBehavior, value => {
                form.openBehavior = value;
                changed();
                renderSection();
            }, 'Ouvrir par défaut dans')
        ])
    ];
}

function subfolderTable() {
    const rows = form.sousDossiers.map((subfolder, index) => {
        const selected = index === view.selectedSubfolder;
        const row = el('tr', {
            className: selected ? 'selected' : '',
            attrs: { draggable: 'true', tabindex: selected ? '0' : '-1', 'aria-selected': String(selected) },
            on: {
                click: () => selectSubfolder(index),
                keydown: event => handleRowKeydown(event, index),
                dragstart: event => {
                    view.dragIndex = index;
                    event.dataTransfer.effectAllowed = 'move';
                    row.classList.add('dragging');
                },
                dragend: () => {
                    view.dragIndex = null;
                    renderSubfolderTable();
                },
                dragover: event => {
                    if (view.dragIndex === null) {
                        return;
                    }
                    event.preventDefault();
                    const after = event.offsetY > row.offsetHeight / 2;
                    row.classList.toggle('drop-after', after);
                    row.classList.toggle('drop-before', !after);
                },
                dragleave: () => row.classList.remove('drop-before', 'drop-after'),
                drop: event => {
                    event.preventDefault();
                    const after = row.classList.contains('drop-after');
                    moveSubfolder(view.dragIndex, after ? index + 1 : index);
                }
            }
        }, [
            el('td', { className: 'grip', attrs: { title: 'Glisser pour réordonner' } }, icon('grip-vertical', 14)),
            el('td', {}, el('span', { className: 'cell-name' }, [icon(subfolder.icone, 16, 'row-icon'), el('span', { text: subfolder.nom || 'Sans nom' })])),
            el('td', { className: 'cell-path text-muted', text: subfolder.chemin || '—' }),
            el('td', { className: 'num', text: Shared.formatKeyGlyph(subfolder.raccourci, isMac) }),
            el('td', { className: 'actions' }, el('button', {
                className: 'icon-btn trash-btn',
                attrs: {
                    type: 'button',
                    title: 'Supprimer',
                    'aria-label': `Supprimer ${subfolder.nom}`,
                    ...(form.sousDossiers.length === 1 ? { disabled: '' } : {})
                },
                on: {
                    click: event => {
                        event.stopPropagation();
                        removeSubfolder(index);
                    }
                }
            }, icon('trash-2', 14)))
        ]);
        return row;
    });

    return el('table', { className: 'table subfolder-table' }, [
        el('thead', {}, el('tr', {}, [
            el('th', { className: 'grip' }),
            el('th', { text: 'Sous-dossier' }),
            el('th', { text: 'Chemin' }),
            el('th', { className: 'num', text: 'Touche' }),
            el('th', { className: 'actions' })
        ])),
        el('tbody', {}, rows)
    ]);
}

function renderSubfolderTable(focusSelected = false) {
    const container = document.getElementById('subfolderTable');
    if (!container) {
        return;
    }
    container.replaceChildren(subfolderTable());
    if (focusSelected) {
        container.querySelector('tbody tr.selected')?.focus();
    }
}

function selectSubfolder(index) {
    if (view.selectedSubfolder === index) {
        return;
    }
    view.selectedSubfolder = index;
    view.iconPickerOpen = false;
    view.capturingSubfolderKey = false;
    renderSection();
    sectionContent.querySelector('tbody tr.selected')?.focus();
}

function handleRowKeydown(event, index) {
    const last = form.sousDossiers.length - 1;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const target = event.key === 'ArrowUp' ? index - 1 : index + 2;
        if (target >= 0 && target <= last + 1) {
            moveSubfolder(index, target);
        }
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        selectSubfolder(Math.max(0, Math.min(last, index + (event.key === 'ArrowUp' ? -1 : 1))));
    } else if (event.key === 'Delete') {
        event.preventDefault();
        removeSubfolder(index);
    }
}

// Moves a row so that it lands before position `target` (0..length).
function moveSubfolder(from, target) {
    if (from === null || from === undefined) {
        return;
    }
    const to = target > from ? target - 1 : target;
    if (to === from) {
        renderSubfolderTable(true);
        return;
    }
    const [item] = form.sousDossiers.splice(from, 1);
    form.sousDossiers.splice(to, 0, item);
    view.selectedSubfolder = to;
    changed();
    renderSection();
    sectionContent.querySelector('tbody tr.selected')?.focus();
}

function addSubfolder() {
    form.sousDossiers.push({ nom: 'Nouveau dossier', chemin: '', raccourci: null, icone: 'folder' });
    view.selectedSubfolder = form.sousDossiers.length - 1;
    changed();
    renderSection();
    sectionContent.querySelector('.editor input')?.select();
}

function removeSubfolder(index) {
    if (form.sousDossiers.length <= 1) {
        return;
    }
    form.sousDossiers.splice(index, 1);
    view.selectedSubfolder = Math.max(0, Math.min(view.selectedSubfolder, form.sousDossiers.length - 1));
    changed();
    renderSection();
}

function subfolderEditor() {
    const subfolder = form.sousDossiers[view.selectedSubfolder];
    const update = (key, value) => {
        subfolder[key] = value;
        changed();
        renderSubfolderTable();
    };

    const nameInput = el('input', {
        className: 'input',
        attrs: { type: 'text', value: subfolder.nom, maxlength: '120', 'aria-label': 'Nom du sous-dossier' },
        on: { input: event => update('nom', event.target.value) }
    });
    const pathInput = el('input', {
        className: 'input',
        attrs: {
            type: 'text',
            value: subfolder.chemin,
            maxlength: '500',
            placeholder: isMac ? 'Racine du projet (ex : Plans/Exécution)' : 'Racine du projet (ex : Plans\\Exécution)',
            'aria-label': 'Chemin relatif au projet'
        },
        on: { input: event => update('chemin', event.target.value) }
    });

    return el('div', { className: 'editor blueprint' }, [
        ...corners(),
        field('Nom', nameInput),
        field('Icône', iconSelector(subfolder)),
        field('Chemin relatif', pathInput),
        field('Touche dans la popup', subfolderKeyCapture(subfolder))
    ]);
}

function iconSelector(subfolder) {
    const quick = QUICK_ICONS.includes(subfolder.icone)
        ? QUICK_ICONS
        : [subfolder.icone, ...QUICK_ICONS.slice(0, 3)];
    const choose = name => {
        subfolder.icone = name;
        view.iconPickerOpen = false;
        changed();
        renderSection();
    };

    const control = el('div', { className: 'icon-seg' }, [
        ...quick.map(name => el('button', {
            className: 'seg-opt',
            attrs: { type: 'button', title: name, 'aria-label': `Icône ${name}`, 'aria-pressed': String(name === subfolder.icone) },
            on: { click: () => choose(name) }
        }, icon(name, 16))),
        el('button', {
            className: 'seg-opt',
            attrs: { type: 'button', title: 'Autres icônes', 'aria-label': 'Autres icônes', 'aria-expanded': String(view.iconPickerOpen) },
            on: {
                click: event => {
                    event.stopPropagation();
                    view.iconPickerOpen = !view.iconPickerOpen;
                    renderSection();
                }
            }
        }, icon('plus', 14))
    ]);

    if (view.iconPickerOpen) {
        // A floating menu: hairline frame without registration marks, which
        // would overflow its scrolling area.
        const picker = el('div', {
            className: 'icon-picker',
            attrs: { role: 'dialog', 'aria-label': 'Choisir une icône' },
            on: { click: event => event.stopPropagation() }
        }, [
            ...Icons.PICKER_GROUPS.flatMap(group => [
                el('div', { className: 'kicker' }, el('span', { text: group.label })),
                el('div', { className: 'icon-grid' }, group.icons.map(name => el('button', {
                    attrs: { type: 'button', title: name, 'aria-label': `Icône ${name}`, 'aria-pressed': String(name === subfolder.icone) },
                    on: { click: () => choose(name) }
                }, icon(name, 16))))
            ])
        ]);
        // Hangs under the selector, kept inside the window.
        requestAnimationFrame(() => {
            const anchor = control.getBoundingClientRect();
            const top = anchor.bottom + 6;
            picker.style.top = `${top}px`;
            picker.style.left = `${Math.max(12, Math.min(anchor.right - 300, window.innerWidth - 312))}px`;
            picker.style.maxHeight = `${Math.max(160, window.innerHeight - top - 36)}px`;
            picker.style.overflow = 'hidden auto';
        });
        control.append(picker);
    }
    return control;
}

// Captures Enter with its modifier; Backspace removes the key.
function subfolderKeyCapture(subfolder) {
    const capturing = view.capturingSubfolderKey;
    const button = el('button', {
        className: `input capture${capturing ? ' capturing' : ''}`,
        attrs: { type: 'button', 'aria-label': 'Touche dans la popup' },
        on: {
            click: () => {
                view.capturingSubfolderKey = true;
                renderSection();
                sectionContent.querySelector('.capture')?.focus();
            },
            blur: () => {
                if (view.capturingSubfolderKey) {
                    view.capturingSubfolderKey = false;
                    renderSection();
                }
            },
            keydown: event => {
                if (!view.capturingSubfolderKey) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Escape') {
                    view.capturingSubfolderKey = false;
                } else if (event.key === 'Backspace' || event.key === 'Delete') {
                    subfolder.raccourci = null;
                    view.capturingSubfolderKey = false;
                    changed();
                } else if (event.key === 'Enter') {
                    setSubfolderShortcut(view.selectedSubfolder, Shared.subfolderShortcutFromEvent(event));
                    view.capturingSubfolderKey = false;
                } else if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
                    setStatus('Appuyez sur Entrée, avec Ctrl, Maj ou Alt si besoin ; Retour arrière pour retirer la touche.', true);
                    return;
                } else {
                    return;
                }
                renderSection();
                sectionContent.querySelector('.capture')?.focus();
            }
        }
    }, capturing
        ? [el('span', { className: 'capture-dot' }), 'Appuyez sur les touches…',
            el('span', { className: 'capture-current', text: `actuel : ${Shared.formatKeyGlyph(subfolder.raccourci, isMac)}` })]
        : [el('span', { text: subfolder.raccourci ? Shared.formatSubfolderShortcut(subfolder.raccourci, isMac) : 'Aucune' }),
            el('span', { className: 'capture-current', text: 'cliquez pour changer' })]);
    return button;
}

// A key combination opens a single subfolder: picking it moves it here.
function setSubfolderShortcut(index, shortcut) {
    if (!SHORTCUT_OPTIONS.includes(shortcut)) {
        return;
    }
    const previousOwner = form.sousDossiers.findIndex((subfolder, otherIndex) => (
        otherIndex !== index && subfolder.raccourci === shortcut
    ));
    form.sousDossiers[index].raccourci = shortcut;
    changed();
    if (previousOwner >= 0) {
        form.sousDossiers[previousOwner].raccourci = null;
        setStatus(`${Shared.formatSubfolderShortcut(shortcut, isMac)} retiré de « ${form.sousDossiers[previousOwner].nom || 'Sous-dossier'} ».`);
    }
}

// — 03 global shortcut —

function renderShortcutSection() {
    const capturing = view.capturingGlobal;
    const capture = el('button', {
        className: `input capture${capturing ? ' capturing' : ''}`,
        attrs: { type: 'button', id: 'globalShortcut', 'aria-label': 'Raccourci global' },
        on: {
            click: () => {
                view.capturingGlobal = true;
                renderSection();
                document.getElementById('globalShortcut')?.focus();
            },
            blur: () => {
                if (view.capturingGlobal) {
                    view.capturingGlobal = false;
                    renderSection();
                }
            },
            keydown: handleGlobalShortcutCapture
        }
    }, capturing
        ? [el('span', { className: 'capture-dot' }), 'Appuyez sur les touches…',
            el('span', { className: 'capture-current', text: `actuel : ${Shared.formatAccelerator(form.raccourciGlobal, isMac)}` })]
        : [icon('keyboard', 15), el('span', { text: Shared.formatAccelerator(form.raccourciGlobal, isMac) }),
            el('span', { className: 'capture-current', text: 'cliquez pour changer' })]);

    return [
        sectionTitle('Raccourci global'),
        field('Ouvre la recherche depuis n’importe quelle application', capture),
        el('p', { className: 'help', text: 'Combinez Ctrl, Alt ou Maj avec une lettre, un chiffre ou une touche de fonction.' })
    ];
}

function handleGlobalShortcutCapture(event) {
    if (!view.capturingGlobal) {
        return;
    }
    event.preventDefault();
    // Escape must not also reach the document handler that closes the window.
    event.stopPropagation();

    const hasModifier = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
    if (event.key === 'Escape' && !hasModifier) {
        view.capturingGlobal = false;
        renderSection();
        return;
    }

    const capture = Shared.acceleratorFromKeyboardEvent(event, isMac);
    if (capture.pending) {
        return;
    }
    if (capture.error) {
        setStatus(capture.error, true);
        return;
    }

    form.raccourciGlobal = capture.accelerator;
    view.capturingGlobal = false;
    changed();
    renderSection();
}

// — 04 mini bar, 05 startup, 06 update —

function switchRow(label, help, checked, onChange) {
    return el('div', { className: 'switch-row' }, [
        el('div', {}, [el('div', { text: label }), help ? el('p', { className: 'help', text: help }) : null]),
        switchControl(checked, label, onChange)
    ]);
}

function renderMiniSection() {
    return [
        sectionTitle('Mini-barre'),
        el('div', { className: 'switch-rows' }, [
            switchRow(
                'Afficher la mini-barre',
                isMac
                    ? 'Épinglée, elle devient un menu sous l’icône de la barre des menus.'
                    : 'Posez-la où vous voulez, même sur la barre des tâches, puis épinglez-la avec l’icône punaise.',
                form.miniBarVisible,
                value => {
                    form.miniBarVisible = value;
                    changed();
                    renderSection();
                }
            )
        ])
    ];
}

function renderStartupSection() {
    return [
        sectionTitle('Démarrage'),
        el('div', { className: 'switch-rows' }, [
            switchRow(
                isMac ? 'Lancer au démarrage' : 'Démarrer avec Windows',
                'L’application attend dans la zone de notification.',
                form.autoStart,
                value => {
                    form.autoStart = value;
                    changed();
                    renderSection();
                }
            )
        ])
    ];
}

function renderUpdateSection() {
    return [
        sectionTitle('Mise à jour'),
        el('table', { className: 'table' }, el('tbody', {}, [
            el('tr', {}, [el('td', { className: 'text-muted', text: 'Version installée' }), el('td', { className: 'num', text: config.appVersion || '—' })]),
            el('tr', {}, [el('td', { className: 'text-muted', text: 'Source' }), el('td', { className: 'num', text: 'GitHub Releases' })])
        ])),
        el('p', { className: 'help', text: 'La recherche de mise à jour ne se fait que sur demande.' }),
        el('div', {}, el('button', {
            className: 'btn btn-secondary',
            attrs: { type: 'button' },
            on: { click: () => window.electronAPI.openUpdateCenter() }
        }, [icon('refresh-cw', 14), 'Rechercher une mise à jour']))
    ];
}

// — save / cancel —

async function handleSave() {
    const visibleIntegrationMode = config.integrationMode === 'hidden'
        ? (config.miniBar?.lastVisibleIntegrationMode || 'floating')
        : config.integrationMode;
    const newConfig = {
        racine: form.racine,
        sousDossiers: form.sousDossiers,
        raccourciGlobal: form.raccourciGlobal,
        autoStart: form.autoStart,
        integrationMode: form.miniBarVisible ? visibleIntegrationMode : 'hidden',
        openBehavior: form.openBehavior
    };

    saveBtn.disabled = true;
    setStatus('Enregistrement…');
    const result = await window.electronAPI.saveSettings(newConfig);
    if (result.success) {
        initialForm = JSON.stringify(form);
        window.electronAPI.closeSettings();
        return;
    }

    saveBtn.disabled = false;
    setStatus(result.error || 'Impossible d’enregistrer les paramètres.', true);
}

function handleCancel() {
    window.electronAPI.closeSettings();
}

function handleDocumentKeydown(event) {
    if (event.key === 'Escape' && !view.capturingGlobal && !view.capturingSubfolderKey) {
        if (view.iconPickerOpen) {
            view.iconPickerOpen = false;
            renderSection();
            return;
        }
        handleCancel();
    }
}

async function init() {
    config = await window.electronAPI.getConfig();
    form = formFromConfig(config);
    initialForm = JSON.stringify(form);
    view.section = config.racine ? 'subfolders' : 'root';
    view.selectedSubfolder = Math.max(0, Shared.defaultSubfolderIndex(form.sousDossiers));
    appVersion.textContent = config.appVersion ? `Version ${config.appVersion}` : '';

    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleCancel);
    closeBtn.addEventListener('click', handleCancel);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('click', () => {
        if (view.iconPickerOpen) {
            view.iconPickerOpen = false;
            renderSection();
        }
    });

    renderNav();
    renderSection();
    renderFooter();
    inspectRoot();
}

document.addEventListener('DOMContentLoaded', init);
