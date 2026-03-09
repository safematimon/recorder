const btnRecord = document.getElementById('btnRecord');
const btnCopy = document.getElementById('btnCopy');
const btnDownload = document.getElementById('btnDownload');
const btnClear = document.getElementById('btnClear');
const stepsList = document.getElementById('stepsList');
const statusBadge = document.getElementById('statusBadge');

// Helper: สร้างเนื้อหาไฟล์ Robot Framework
const generateRobotScript = (data) => {
    const header = `*** Settings ***\nLibrary    SeleniumLibrary\n\n*** Variables ***\n\${URL}    ${data.startUrl || 'https://example.com'}\n\${BROWSER}    chrome\n\n*** Test Cases ***\nMy Recorded Test\n    Open Browser    \${URL}    \${BROWSER}\n    Maximize Browser Window\n`;
    const footer = "\n    Close Browser";
    const steps = data.steps ? data.steps.map(s => `    ${s}`).join('\n') : '';
    return header + steps + footer;
};

// Update UI State
const updateUI = (isRecording) => {
    if (isRecording) {
        btnRecord.innerHTML = '<span class="icon">■</span> Stop Recording';
        btnRecord.className = 'btn btn-danger';
        statusBadge.textContent = 'Recording...';
        statusBadge.classList.add('recording');
    } else {
        btnRecord.innerHTML = '<span class="icon">●</span> Start Recording';
        btnRecord.className = 'btn btn-primary';
        statusBadge.textContent = 'Ready';
        statusBadge.classList.remove('recording');
    }
};

// Render List
const renderSteps = () => {
    chrome.storage.local.get({ steps: [] }, (data) => {
        stepsList.innerHTML = '';
        if (!data.steps || data.steps.length === 0) {
            stepsList.innerHTML = '<li class="empty-state">No actions recorded yet...</li>';
            btnDownload.disabled = true;
            btnCopy.disabled = true;
        } else {
            data.steps.forEach(step => {
                const li = document.createElement('li');
                li.textContent = step;
                stepsList.appendChild(li);
            });
            btnDownload.disabled = false;
            btnCopy.disabled = false;
        }
    });
};

// Initialize
chrome.storage.local.get(['isRecording'], (result) => {
    updateUI(result.isRecording || false);
    renderSteps();
});

// Listen for changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isRecording) updateUI(changes.isRecording.newValue);
    if (changes.steps) renderSteps();
});

// Toggle Recording Button
btnRecord.onclick = () => {
    chrome.storage.local.get(['isRecording'], (result) => {
        const isRecording = result.isRecording || false;
        if (isRecording) {
            // Stop
            chrome.storage.local.set({ isRecording: false });
        } else {
            // Start
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.storage.local.set({ isRecording: true, startUrl: tabs[0].url }, () => window.close());
                }
            });
        }
    });
};

btnClear.onclick = () => chrome.storage.local.set({ steps: [] });

btnCopy.onclick = () => {
    chrome.storage.local.get({ steps: [], startUrl: "" }, (data) => {
        const script = generateRobotScript(data);
        navigator.clipboard.writeText(script);
        const originalText = btnCopy.textContent;
        btnCopy.textContent = "Copied!";
        setTimeout(() => btnCopy.textContent = originalText, 1500);
    });
};

btnDownload.onclick = () => {
    chrome.storage.local.get({ steps: [], startUrl: "" }, (data) => {
        const script = generateRobotScript(data);
        const blob = new Blob([script], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url: url, filename: 'robot-test.robot', saveAs: true });
    });
};