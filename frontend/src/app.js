import ChunkUploader from './utils/ChunkUploader.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const btnStartAll = document.getElementById('btnStartAll');
const actionContainer = document.getElementById('actionContainer');
const fileList = document.getElementById('fileList');
const globalSuccess = document.getElementById('globalSuccess');

let uploadQueue = [];

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => dropzone.addEventListener(e, preventDefaults));
function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

['dragenter', 'dragover'].forEach(e => dropzone.addEventListener(e, () => dropzone.classList.add('dragover')));
['dragleave', 'drop'].forEach(e => dropzone.addEventListener(e, () => dropzone.classList.remove('dragover')));

dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFiles(e.target.files));

function handleFiles(files) {
    for (let file of files) {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const uploader = new ChunkUploader(file, {
            chunkSize: 5 * 1024 * 1024,
            concurrency: 3,
            onProgress: (percent) => updateProgress(id, percent),
            onError: (err) => updateError(id, err),
            onComplete: (key) => markComplete(id, key)
        });
        uploadQueue.push({ id, file, uploader, status: 'staged', percent: 0 });
    }

    if (uploadQueue.length > 0) {
        actionContainer.style.display = 'flex';
        btnStartAll.disabled = false;
        btnStartAll.innerText = 'START UPLOAD';
        globalSuccess.style.display = 'none'; // hide success msg if present
    }

    renderFileQueue();
}

function renderFileQueue() {
    fileList.innerHTML = '';
    uploadQueue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-item';
        const safeId = item.id;
        div.id = 'container-' + safeId;

        let badgeClass = 'staged';
        let badgeText = 'Ready';
        if (item.status === 'uploading') { badgeClass = 'uploading'; badgeText = 'Uploading...'; }
        else if (item.status === 'complete') { badgeClass = 'complete'; badgeText = 'Complete'; }
        else if (item.status === 'error') { badgeClass = 'error'; badgeText = 'Error'; }

        div.innerHTML = `
      <div class="file-header">
        <div class="file-info">
          <span class="file-name" title="${item.file.name}">${item.file.name}</span>
          <span class="file-meta">${(item.file.size / 1048576).toFixed(2)} MB</span>
        </div>
        <span class="status-badge ${badgeClass}" id="badge-${safeId}">${badgeText}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar"><div class="progress-fill" id="prog-${safeId}" style="width: ${item.percent || 0}%"></div></div>
        <span class="progress-text" id="pct-${safeId}">${item.percent || 0}%</span>
      </div>
    `;
        fileList.appendChild(div);
    });
}

function updateProgress(id, pct) {
    const safeId = id;
    const idx = uploadQueue.findIndex(u => u.id === id);
    if (idx !== -1) uploadQueue[idx].percent = pct;

    const fill = document.getElementById('prog-' + safeId);
    const text = document.getElementById('pct-' + safeId);
    const badge = document.getElementById('badge-' + safeId);

    if (fill) fill.style.width = pct + '%';
    if (text) text.innerText = pct + '%';
    if (badge && badge.innerText !== 'Error') {
        badge.innerText = 'Uploading...';
        badge.className = 'status-badge uploading';
    }
}

function updateError(id, err) {
    const safeId = id;
    const badge = document.getElementById('badge-' + safeId);
    if (badge) {
        badge.innerText = 'Error';
        badge.className = 'status-badge error';
    }
    const idx = uploadQueue.findIndex(u => u.id === id);
    if (idx !== -1) uploadQueue[idx].status = 'error';
}

function markComplete(id, key) {
    const safeId = id;
    const badge = document.getElementById('badge-' + safeId);
    const fill = document.getElementById('prog-' + safeId);
    const text = document.getElementById('pct-' + safeId);

    if (badge) {
        badge.innerText = 'Complete';
        badge.className = 'status-badge complete';
    }
    if (fill) fill.style.width = '100%';
    if (text) text.innerText = '100%';

    const idx = uploadQueue.findIndex(u => u.id === id);
    if (idx !== -1) uploadQueue[idx].status = 'complete';
    checkAllComplete();
}

function checkAllComplete() {
    if (uploadQueue.length > 0 && uploadQueue.every(u => u.status === 'complete' || u.status === 'error')) {
        btnStartAll.style.display = 'none'; // hide the button

        // If everything is completely successful
        if (uploadQueue.every(u => u.status === 'complete')) {
            globalSuccess.style.display = 'block';
            actionContainer.style.display = 'none';
            // dropzone.style.display = 'none'; // Keep dropzone if they want to upload more
        }
    }
}

btnStartAll.addEventListener('click', () => {
    btnStartAll.disabled = true;
    btnStartAll.innerText = 'UPLOADING...';

    uploadQueue.filter(u => u.status === 'staged').forEach(u => {
        u.status = 'uploading';
        updateProgress(u.id, 0); // Trigger frontend state shift
        u.uploader.start();
    });
});