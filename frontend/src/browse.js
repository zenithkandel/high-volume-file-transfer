const tbody = document.getElementById('tbody');
const checkAll = document.getElementById('checkAll');
const btnDownloadZip = document.getElementById('btnDownloadZip');
const btnDeleteSelected = document.getElementById('btnDeleteSelected');

let files = [];

async function loadFiles() {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888;">Scanning drive...</td></tr>';
    try {
        const res = await fetch('/api/v1/upload/list');
        files = await res.json();
        renderFiles();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Failed to fetch storage API.</td></tr>';
    }
}

function renderFiles() {
    if (files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888;">No files in storage yet.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    files.forEach(f => {
        const tr = document.createElement('tr');
        tr.className = 'row-hover';

        // Size formatting
        const sizeMb = (f.size / (1024 * 1024)).toFixed(2);

        // Date formatting
        const d = new Date(f.createdAt);
        const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        tr.innerHTML = `
      <td><input type="checkbox" class="file-cb" value="${f.id}"></td>
      <td style="font-weight: 500;">${f.filename}</td>
      <td style="color: #666;">${sizeMb} MB</td>
      <td style="color: #666; font-size: 0.85rem;">${dateStr}</td>
      <td class="action-cell">
        <a href="/api/v1/upload/download/${f.id}" class="dl-link" download>DOWNLOAD</a>
        <button style="margin-left: 10px; color: ${f.deleting ? '#aaa' : '#c62828'}; background: none; border: none; cursor: ${f.deleting ? 'default' : 'pointer'}; font-weight: 600; font-size: 0.85rem;" class="delete-btn" data-id="${f.id}" ${f.deleting ? 'disabled' : ''}>${f.deleting ? 'DELETING...' : 'DELETE'}</button>
      </td>
    `;
        tbody.appendChild(tr);
    });

    attachCheckboxListeners();
    attachDeleteListeners();
}

function attachDeleteListeners() {
    const delBtns = document.querySelectorAll('.delete-btn');
    delBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            if (confirm('Are you sure you want to delete this file?')) {
                // Optimistically update UI
                const fileIndex = files.findIndex(f => f.id === id);
                if (fileIndex !== -1) {
                    files[fileIndex].deleting = true;
                    renderFiles(); // Re-render to show "DELETING..." state
                }

                try {
                    const res = await fetch(`/api/v1/upload/file/${id}`, {
                        method: 'DELETE'
                    });
                    if (res.ok) {
                        files = files.filter(f => f.id !== id);
                        renderFiles();
                    } else {
                        alert('Could not delete file.');
                        if (fileIndex !== -1) files[fileIndex].deleting = false;
                        renderFiles();
                    }
                } catch (error) {
                    console.error('Delete error', error);
                    alert('Error deleting file.');
                    if (fileIndex !== -1) files[fileIndex].deleting = false;
                    renderFiles();
                }
            }
        });
    });
}

function attachCheckboxListeners() {
    const cbs = document.querySelectorAll('.file-cb');

    checkAll.addEventListener('change', (e) => {
        cbs.forEach(cb => cb.checked = e.target.checked);
        updateActionButtons();
    });

    cbs.forEach(cb => cb.addEventListener('change', () => {
        updateActionButtons();
    }));
}

function updateActionButtons() {
    const cbs = document.querySelectorAll('.file-cb');
    const anyChecked = Array.from(cbs).some(cb => cb.checked);
    btnDownloadZip.disabled = !anyChecked;
    btnDeleteSelected.disabled = !anyChecked;
}

btnDownloadZip.addEventListener('click', async () => {
    const selectedIds = Array.from(document.querySelectorAll('.file-cb'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    if (selectedIds.length === 0) return;

    btnDownloadZip.innerText = 'ZIPPING...';
    btnDownloadZip.disabled = true;

    try {
        const res = await fetch('/api/v1/upload/zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: selectedIds })
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `archive-${Date.now()}.zip`;
            document.body.appendChild(a); // append for Firefox
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            alert('Zip failed');
        }
    } catch (e) {
        console.error(e);
        alert('Zip failed locally');
    } finally {
        btnDownloadZip.innerText = 'DOWNLOAD SELECTED AS ZIP';
        checkAll.checked = false;
        document.querySelectorAll('.file-cb').forEach(cb => cb.checked = false);
        updateActionButtons();
    }
});

btnDeleteSelected.addEventListener('click', async () => {
    const selectedIds = Array.from(document.querySelectorAll('.file-cb'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    if (selectedIds.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected files?`)) {
        return;
    }

    btnDeleteSelected.innerText = 'DELETING...';
    btnDeleteSelected.disabled = true;
    btnDownloadZip.disabled = true;

    try {
        await Promise.all(selectedIds.map(id =>
            fetch(`/api/v1/upload/file/${id}`, { method: 'DELETE' })
        ));

        files = files.filter(f => !selectedIds.includes(f.id));
    } catch (e) {
        console.error(e);
        alert('Error deleting some files.');
    } finally {
        btnDeleteSelected.innerText = 'DELETE SELECTED';
        checkAll.checked = false;
        renderFiles();
        updateActionButtons();
    }
});

// Init
loadFiles();
