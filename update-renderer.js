// Update window — 2f: versions on the left, release notes on the right;
// 2g: the right pane becomes a ruled progress bar, or the "up to date" note.
const Shared = window.LauncherShared;

const versionPane = document.getElementById('versionPane');
const detailPane = document.getElementById('detailPane');
const primaryBtn = document.getElementById('primaryBtn');
const primaryLabel = document.getElementById('primaryLabel');
const laterBtn = document.getElementById('laterBtn');
const closeBtn = document.getElementById('closeBtn');

let currentState = null;

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

function tag(text, variant, iconName = null, spinning = false) {
    return el('span', { className: `tag tag-${variant}` }, [iconName ? icon(iconName, 11, spinning ? 'spin' : '') : null, text]);
}

const STATUS_VIEWS = {
    idle: { tag: () => tag('vérification', 'neutral'), primary: 'Vérifier' },
    checking: { tag: () => tag('recherche', 'neutral', 'loader-circle', true), primary: 'Recherche…', busy: true },
    available: { tag: () => tag('disponible', 'accent'), primary: 'Télécharger et installer', primaryIcon: 'download' },
    downloading: { tag: () => tag('téléchargement', 'neutral', 'loader-circle', true), primary: 'Installation…', busy: true, locked: true },
    ready: { tag: () => tag('téléchargée', 'accent', 'check'), primary: 'Installer maintenant', locked: true },
    installing: { tag: () => tag('installation', 'neutral', 'loader-circle', true), primary: 'Installation…', busy: true, locked: true },
    'not-available': { tag: () => tag('à jour', 'accent', 'check'), primary: null },
    error: { tag: () => tag('erreur', 'outline'), primary: 'Réessayer' }
};

function renderState(state) {
    currentState = state;
    const view = STATUS_VIEWS[state.status] || STATUS_VIEWS.idle;
    const upToDate = state.status === 'not-available';
    const shownVersion = state.availableVersion && !upToDate ? state.availableVersion : (state.currentVersion || '—');

    // Left pane: big version number with its status, then the versions table.
    const rows = [
        el('tr', {}, [el('td', { className: 'text-muted', text: 'Installée' }), el('td', { className: 'num', text: state.currentVersion || '—' })])
    ];
    if (state.availableVersion && !upToDate) {
        rows.push(el('tr', { className: 'highlight' }, [el('td', { text: 'Disponible' }), el('td', { className: 'num', text: state.availableVersion })]));
    }
    if (state.downloadSizeLabel && !upToDate) {
        rows.push(el('tr', {}, [el('td', { className: 'text-muted', text: 'Taille' }), el('td', { className: 'num', text: state.downloadSizeLabel })]));
    }
    versionPane.replaceChildren(...[
        el('div', { className: 'headline' }, [el('span', { className: 'headline-number', text: shownVersion }), view.tag()]),
        upToDate ? null : el('table', { className: 'table version-table' }, el('tbody', {}, rows))
    ].filter(Boolean));

    detailPane.replaceChildren(...renderDetail(state));

    // Footer: "Plus tard" and the primary action; "Fermer" alone when up to date.
    laterBtn.textContent = upToDate ? 'Fermer' : 'Plus tard';
    laterBtn.disabled = Boolean(view.locked);
    closeBtn.disabled = Boolean(view.locked);
    primaryBtn.hidden = !view.primary;
    primaryBtn.disabled = Boolean(view.busy);
    primaryLabel.replaceChildren(...[view.primaryIcon ? icon(view.primaryIcon, 14) : null, view.primary || ''].filter(Boolean));
}

function renderDetail(state) {
    if (['downloading', 'ready', 'installing'].includes(state.status)) {
        const percent = Math.max(0, Math.min(Number(state.percent) || 0, 100));
        return [
            el('div', { className: 'progress-figure' }, [
                el('span', { className: 'progress-percent', text: `${percent.toFixed(0)} %` }),
                el('span', { className: 'text-muted', attrs: { style: 'font-size:12px' }, text: state.speedLabel || '' })
            ]),
            el('div', {
                className: 'ruler',
                attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': percent.toFixed(0) }
            }, el('div', { className: 'ruler-fill', attrs: { style: `width:${percent}%` } })),
            el('div', { className: 'progress-meta text-muted', text: state.progressLabel || state.message || '' })
        ];
    }

    if (state.status === 'not-available') {
        // Without a check (development build, unsupported platform) the
        // service explains why in its message.
        const text = state.checkedAt
            ? `Dernière version · vérifiée ${Shared.formatRelativeTime(state.checkedAt)} sur GitHub Releases.`
            : (state.message || 'Le logiciel est à jour.');
        return [el('div', { className: 'message text-muted', text })];
    }

    if (state.status === 'error') {
        return [el('div', { className: 'alert' }, [
            icon('triangle-alert', 18),
            el('div', {}, [
                el('div', { className: 'message', text: state.message || 'La mise à jour a échoué.' }),
                state.error ? el('div', { className: 'error-message text-muted', text: state.error }) : null
            ])
        ])];
    }

    if (state.status === 'checking' || state.status === 'idle') {
        return [el('div', { className: 'message text-muted', text: state.message || 'Recherche de mise à jour…' })];
    }

    const items = Array.isArray(state.releaseNoteItems) && state.releaseNoteItems.length > 0
        ? state.releaseNoteItems
        : [state.message || `Version ${state.availableVersion} disponible`];
    return [
        el('div', { className: 'kicker' }, el('span', { text: 'Nouveautés' })),
        el('div', { className: 'notes' }, items.map((item, index) => el('div', { className: 'note-item' }, [
            el('span', { className: 'note-number', text: String(index + 1).padStart(2, '0') }),
            el('span', { text: item })
        ])))
    ];
}

async function handlePrimaryAction() {
    if (!currentState) {
        await window.electronAPI.checkForUpdates();
        return;
    }
    if (currentState.status === 'available') {
        await window.electronAPI.startUpdateDownload();
    } else if (currentState.status === 'ready') {
        await window.electronAPI.installDownloadedUpdate();
    } else {
        await window.electronAPI.checkForUpdates();
    }
}

function init() {
    primaryBtn.addEventListener('click', handlePrimaryAction);
    laterBtn.addEventListener('click', () => window.electronAPI.closeUpdateWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeUpdateWindow());
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !closeBtn.disabled) {
            window.electronAPI.closeUpdateWindow();
        }
    });
    window.electronAPI.onUpdateState(state => renderState(state));
    renderState({ status: 'checking', currentVersion: '', message: 'Recherche de mise à jour…' });
}

document.addEventListener('DOMContentLoaded', init);
