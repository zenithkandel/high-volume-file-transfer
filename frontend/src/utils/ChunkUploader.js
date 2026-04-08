/**
 * Production-ready File Chunk Uploader.
 * Features: Concurrent uploading, retry, pause/resume, resuming after disconnect, iOS strict background handling
 */
class ChunkUploader {
    constructor(file, options = {}) {
        this.file = file;
        // Standard block size: 5MB minimum for S3 multipart upload
        this.chunkSize = options.chunkSize || 5 * 1024 * 1024;
        this.concurrency = options.concurrency || 3;

        this.fileId = null;
        this.uploadId = null;
        this.objectKey = null;
        this.totalChunks = Math.ceil(this.file.size / this.chunkSize);

        this.queue = [];
        this.activeWorkers = 0;
        this.status = 'idle'; // idle, uploading, paused, error, complete
        this.uploadedChunks = new Set();
        this.retries = new Map();
        this.maxRetries = 3;

        this.onProgress = options.onProgress || (() => { });
        this.onError = options.onError || (() => { });
        this.onComplete = options.onComplete || (() => { });

        // iPhone/iOS Background limitations workaround
        document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));
        window.addEventListener('online', this.resume.bind(this));
        window.addEventListener('offline', this.pause.bind(this));

        this.loadStateFromIndexedDB(); // simplified: load from localStorage in this snippet
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            // Safari strictly kills background processes. Safely serialize and pause.
            console.warn('App went to background, halting remaining chunk queues');
            this.pause(false); // false means suspend queue, don't abort inflight network requests
            this.saveState();
        } else {
            console.log('App in foreground, resuming');
            this.resume();
        }
    }

    saveState() {
        // Checkpointing: save completed chunks array to recover if user reloads
        const state = {
            fileId: this.fileId,
            uploadId: this.uploadId,
            objectKey: this.objectKey,
            uploadedChunks: Array.from(this.uploadedChunks),
            filename: this.file.name,
            size: this.file.size
        };
        localStorage.setItem(`upload_state_${this.file.name}`, JSON.stringify(state));
    }

    loadStateFromIndexedDB() {
        const saved = localStorage.getItem(`upload_state_${this.file.name}`);
        if (saved) {
            const state = JSON.parse(saved);
            if (state.size === this.file.size) { // Basic fingerprint matching
                this.fileId = state.fileId;
                this.uploadId = state.uploadId;
                this.objectKey = state.objectKey;
                this.uploadedChunks = new Set(state.uploadedChunks || []);
                console.log(`Resumed session found. Skipped chunks: ${this.uploadedChunks.size}`);
            }
        }
    }

    async start() {
        if (this.status === 'uploading') return;
        this.status = 'uploading';

        if (!this.fileId) {
            await this.initBackend();
        }

        // Only populate queue if empty
        if (this.queue.length === 0) {
            for (let i = 0; i < this.totalChunks; i++) {
                if (!this.uploadedChunks.has(i + 1)) {
                    this.queue.push(i + 1);
                }
            }
        }

        this.processQueue();
    }

    pause(clearQueue = true) {
        this.status = 'paused';
        if (clearQueue) this.queue = [];
        this.saveState();
    }

    resume() {
        if (this.status === 'paused' || this.status === 'error') {
            this.start();
        }
    }

    async initBackend() {
        const res = await fetch('http://localhost:3000/api/v1/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: this.file.name,
                mimeType: this.file.type || 'application/octet-stream',
                size: this.file.size,
                chunksCount: this.totalChunks
            })
        });

        if (!res.ok) throw new Error('Init Failed');
        const data = await res.json();
        this.fileId = data.fileId;
        this.saveState();
    }

    async processQueue() {
        while (this.activeWorkers < this.concurrency && this.queue.length > 0 && this.status === 'uploading') {
            const partNumber = this.queue.shift();
            this.activeWorkers++;
            this.uploadChunkWorker(partNumber);
        }

        // Finishing condition
        if (this.activeWorkers === 0 && this.queue.length === 0 && this.status === 'uploading') {
            if (this.uploadedChunks.size === this.totalChunks) {
                this.completeUpload();
            } else {
                // Wait for ongoing chunks
            }
        }
    }

    async uploadChunkWorker(partNumber) {
        const start = (partNumber - 1) * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const chunkData = this.file.slice(start, end);

        try {
            // Use FormData mapping for fastify-multipart
            const formData = new FormData();
            formData.append('fileId', this.fileId);
            formData.append('partNumber', partNumber);
            formData.append('chunk', chunkData, this.file.name);

            const res = await fetch('http://localhost:3000/api/v1/upload/chunk', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error(`Upload POST failed: ${res.status}`);

            this.uploadedChunks.add(partNumber);
            this.saveState();

            // Update progress
            const percent = Math.floor((this.uploadedChunks.size / this.totalChunks) * 100);
            this.onProgress(percent);

            this.activeWorkers--;
            this.processQueue(); // pull next

        } catch (err) {
            console.error(`Chunk ${partNumber} failed`, err);
            this.activeWorkers--;

            const attempts = this.retries.get(partNumber) || 0;
            if (attempts < this.maxRetries) {
                // Exponential backoff
                const timeout = Math.pow(2, attempts) * 1000;
                this.retries.set(partNumber, attempts + 1);
                console.log(`Retrying chunk ${partNumber} in ${timeout}ms`);

                setTimeout(() => {
                    if (this.status === 'uploading') {
                        this.queue.unshift(partNumber); // priority queue jump
                        this.processQueue();
                    }
                }, timeout);
            } else {
                this.status = 'error';
                this.onError(new Error(`Max retries reached for chunk ${partNumber}`));
            }
        }
    }

    async completeUpload() {
        this.status = 'complete';
        try {
            const res = await fetch('http://localhost:3000/api/v1/upload/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: this.fileId })
            });
            if (!res.ok) throw new Error('Completion Failed');

            localStorage.removeItem(`upload_state_${this.file.name}`);
            this.onComplete((await res.json()).key);
        } catch (err) {
            this.onError(err);
        }
    }
}

export default ChunkUploader;
