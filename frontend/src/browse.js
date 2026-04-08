const tbody = document.getElementById('tbody');
const checkAll = document.getElementById('checkAll');
const btnDownloadZip = document.getElementById('btnDownloadZip');

let files = [];

async function loadFiles() {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888;">Scanning drive...</td></tr>';
    try {
        const res = await fetch('http://localhost:3000/api/v1/upload/list');
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
        <a href="http://localhost:3000/api/v1/upload/download/${f.id}" class="dl-link" download>DOWNLOAD ↓</a>
      </td>
    `;
        tbody.appendChild(tr);
    });

    attachCheckboxListeners();
}

function attachCheckboxListeners() {
    const cbs = document.querySelectorAll('.file-cb');

    checkAll.addEventListener('change', (e) => {
        cbs.forEach(cb => cb.checked = e.target.checked);
        updateZipButton();
    });

    cbs.forEach(cb => cb.addEventListener('change', () => {
        updateZipButton();
    }));
}

function updateZipButton() {
    const cbs = document.querySelectorAll('.file-cb');
    const anyChecked = Array.from(cbs).some(cb => cb.checked);
    btnDownloadZip.disabled = !anyChecked;
}

btnDownloadZip.addEventListener('click', async () => {
    const selectedIds = Array.from(document.querySelectorAll('.file-cb'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    if (selectedIds.length === 0) return;

    btnDownloadZip.innerText = 'ZIPPING...';
    btnDownloadZip.disabled = true;

    try {
        const res = await fetch('http://localhost:3000/api/v1/upload/zip', {
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
        btnDownloadZip.disabled = false;
        checkAll.checked = false;
        document.querySelectorAll('.file-cb').forEach(cb => cb.checked = false);
    }
});

// Init
loadFiles();
