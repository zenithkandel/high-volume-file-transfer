import ChunkUploader from './utils/ChunkUploader.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const btnStartAll = document.getElementById('btnStartAll');
const fileList = document.getElementById('fileList');

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
        const id = Date.now() + Math.random();
        const uploader = new ChunkUploader(file, {
            chunkSize: 5 * 1024 * 1024,
            concurrency: 3,
            onProgress: (percent) => updateProgress(id, percent),
            onError: (err) => updateError(id, err),
            onComplete: (key) => markComplete(id, key)
        });
        uploadQueue.push({ id, file, uploader, status: 'staged' });
    }
    renderFileQueue();
    btnStartAll.disabled = false;
}

function renderFileQueue() {
    fileList.innerHTML = '';
    uploadQueue.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.id = 'container-' + Math.floor(item.id);
        div.innerHTML = `
      <div class="file-header">
        <span>${item.file.name} <span class="file-size">(${(item.file.size / 1048576).toFixed(2)} MB)</span></span>
        <span class="status-text" id="status-${Math.floor(item.id)}">${item.status === 'staged' ? 'Ready' : item.status}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="prog-${Math.floor(item.id)}" style="width: 0%"></div></div>
    `;
        fileList.appendChild(div);
    });
}

function updateProgress(id, pct) {
    const safeId = Math.floor(id);
    const fill = document.getElementById('prog-' + safeId);
    const stat = document.getElementById('status-' + safeId);
    if (fill) fill.style.width = pct + '%';
    if (stat) stat.innerText = pct + '%';
}

function updateError(id, err) {
    const safeId = Math.floor(id);
    const stat = document.getElementById('status-' + safeId);
    if (stat) { stat.innerText = 'Error'; stat.style.color = 'red'; }
}

function markComplete(id, key) {
    const safeId = Math.floor(id);
    const stat = document.getElementById('status-' + safeId);
    const fill = document.getElementById('prog-' + safeId);
    if (stat) { stat.innerText = 'Done'; stat.style.color = '#B85B43'; }
    if (fill) fill.style.width = '100%';

    const idx = uploadQueue.findIndex(u => u.id === id);
    if (idx !== -1) uploadQueue[idx].status = 'complete';
    checkAllComplete();
}

function checkAllComplete() {
    if (uploadQueue.every(u => u.status === 'complete')) {
        btnStartAll.innerText = 'UPLOADS FINISHED';
        setTimeout(() => { if (confirm('All uploads completed. View storage?')) window.location.href = 'browse.html'; }, 300);
    }
}

btnStartAll.addEventListener('click', () => {
    btnStartAll.disabled = true;
    btnStartAll.innerText = 'UPLOADING...';
    uploadQueue.filter(u => u.status === 'staged').forEach(u => {
        u.status = 'uploading';
        u.uploader.start();
    });
});
