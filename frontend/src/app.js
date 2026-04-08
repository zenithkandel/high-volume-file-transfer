import ChunkUploader from './utils/ChunkUploader.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const uploadStatus = document.getElementById('uploadStatus');

let uploader = null;
let selectedFile = null;

// Drag and drop handlers
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
});

dropzone.addEventListener('drop', handleDrop, false);
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length > 0) {
        selectedFile = files[0];
        dropzone.innerText = selectedFile.name + ` (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`;
        btnStart.disabled = false;

        // Check if there is incomplete progress
        const saved = localStorage.getItem(`upload_state_${selectedFile.name}`);
        if (saved) {
            uploadStatus.innerText = "Resuming paused upload...";
            btnResume.disabled = false;
        }
    }
}

btnStart.addEventListener('click', () => {
    if (!selectedFile) return;
    startUpload();
});

function startUpload() {
    btnStart.disabled = true;
    btnPause.disabled = false;
    progressBar.style.display = 'block';

    uploader = new ChunkUploader(selectedFile, {
        chunkSize: 5 * 1024 * 1024, // 5MB chunks (S3 minimum)
        concurrency: 3, // Upload 3 chunks in parallel to max out bandwidth
        onProgress: (percent) => {
            progressFill.style.width = percent + '%';
            uploadStatus.innerText = `Uploading... ${percent}%`;
        },
        onError: (err) => {
            uploadStatus.innerText = `Error: ${err.message}`;
            uploadStatus.style.color = 'red';
            btnResume.disabled = false;
        },
        onComplete: (key) => {
            uploadStatus.innerText = `Upload Complete! File accessible at ${key}`;
            uploadStatus.style.color = 'green';
            btnPause.disabled = true;
            btnResume.disabled = true;
        }
    });

    uploader.start();
}

btnPause.addEventListener('click', () => {
    if (uploader) {
        uploader.pause();
        uploadStatus.innerText = 'Upload Suspended.';
        btnPause.disabled = true;
        btnResume.disabled = false;
    }
});

btnResume.addEventListener('click', () => {
    if (uploader) {
        uploader.resume();
        uploadStatus.innerText = 'Resuming...';
        btnResume.disabled = true;
        btnPause.disabled = false;
    } else if (selectedFile) {
        startUpload(); // For reloading an already paused one when clicking resume
    }
});
