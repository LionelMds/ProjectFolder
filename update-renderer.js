let currentState = null;

const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusMessage = document.getElementById('statusMessage');
const currentVersion = document.getElementById('currentVersion');
const availableVersion = document.getElementById('availableVersion');
const progressArea = document.getElementById('progressArea');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const speedLabel = document.getElementById('speedLabel');
const releaseNotes = document.getElementById('releaseNotes');
const primaryBtn = document.getElementById('primaryBtn');
const laterBtn = document.getElementById('laterBtn');
const closeBtn = document.getElementById('closeBtn');

function init() {
    if (navigator.platform.startsWith('Mac')) {
        document.body.classList.add('liquid-glass');
    }

    primaryBtn.addEventListener('click', handlePrimaryAction);
    laterBtn.addEventListener('click', () => window.electronAPI.closeUpdateWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeUpdateWindow());
    window.electronAPI.onUpdateState((event, state) => renderState(state));
}

function renderState(state) {
    currentState = state;
    currentVersion.textContent = state.currentVersion || '-';
    availableVersion.textContent = state.availableVersion || '-';
    statusMessage.textContent = state.message || '';
    releaseNotes.textContent = state.releaseNotes || '';
    releaseNotes.classList.toggle('visible', Boolean(state.releaseNotes));

    const percent = Math.max(0, Math.min(Number(state.percent) || 0, 100));
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = state.progressLabel || `${percent.toFixed(0)} %`;
    speedLabel.textContent = state.speedLabel || '';
    progressArea.classList.toggle('visible', ['downloading', 'ready', 'installing'].includes(state.status));

    primaryBtn.disabled = false;
    laterBtn.disabled = false;
    closeBtn.disabled = false;

    if (state.status === 'checking') {
        statusIcon.textContent = '⌕';
        statusTitle.textContent = 'Recherche en cours';
        primaryBtn.textContent = 'Recherche...';
        primaryBtn.disabled = true;
    } else if (state.status === 'available') {
        statusIcon.textContent = '⬇';
        statusTitle.textContent = 'Mise à jour disponible';
        primaryBtn.textContent = 'Télécharger et installer';
    } else if (state.status === 'downloading') {
        statusIcon.textContent = '⬇';
        statusTitle.textContent = 'Téléchargement';
        primaryBtn.textContent = 'Téléchargement...';
        primaryBtn.disabled = true;
        laterBtn.disabled = true;
        closeBtn.disabled = true;
    } else if (state.status === 'ready') {
        statusIcon.textContent = '✓';
        statusTitle.textContent = 'Installation imminente';
        primaryBtn.textContent = 'Installer maintenant';
        laterBtn.disabled = true;
        closeBtn.disabled = true;
    } else if (state.status === 'installing') {
        statusIcon.textContent = '↻';
        statusTitle.textContent = 'Installation';
        primaryBtn.textContent = 'Installation...';
        primaryBtn.disabled = true;
        laterBtn.disabled = true;
        closeBtn.disabled = true;
    } else if (state.status === 'not-available') {
        statusIcon.textContent = '✓';
        statusTitle.textContent = 'À jour';
        primaryBtn.textContent = 'Revérifier';
    } else if (state.status === 'error') {
        statusIcon.textContent = '!';
        statusTitle.textContent = 'Erreur de mise à jour';
        statusMessage.textContent = state.error || state.message || 'Une erreur est survenue.';
        primaryBtn.textContent = 'Réessayer';
    } else {
        statusIcon.textContent = '⬇';
        statusTitle.textContent = 'Mise à jour';
        primaryBtn.textContent = 'Vérifier';
    }
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

document.addEventListener('DOMContentLoaded', init);
