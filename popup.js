// --- DOM Elements ---
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const copyText = document.getElementById("copyText");
const scriptDisplay = document.getElementById("scriptDisplay");
const statusText = document.getElementById("statusText");
const btnRobot = document.getElementById("btnRobot");
const btnPlaywright = document.getElementById("btnPlaywright");

let currentExtension = ".robot";
let currentFileName = "automate_test";

// --- UI Helpers ---
const updateUI = (isRecording) => {
  if (isRecording) {
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    statusText.innerHTML = "🟢 Recording... (Click on the page)";
    statusText.style.color = "#28a745";
  } else {
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    statusText.innerHTML = "🔴 Stopped";
    statusText.style.color = "#dc3545";
  }
};

const updateToggleUI = (framework) => {
  const isPlaywright = framework === "playwright";
  btnPlaywright.classList.toggle("active", isPlaywright);
  btnRobot.classList.toggle("active", !isPlaywright);
};

// --- Script Renderers ---
const renderPlaywright = (steps, startUrl) => {
  const header = `import { test, expect } from '@playwright/test';\n\ntest('My Recorded Test', async ({ page }) => {\n  await page.goto('${startUrl}');\n\n`;
  const footer = `\n});`;

  const lines = steps.map((step) => {
    if (typeof step === "string")
      return `  // Please click Clear 🗑 and record again for Playwright`;
    if (step.action === "click") return `  await page.${step.pw}.click();`;
    if (step.action === "input")
      return `  await page.${step.pw}.fill('${step.value}');`;
    if (step.action === "upload")
      return `  await page.${step.pw}.setInputFiles('${step.value}');`;
    if (step.action === "screenshot")
      return `  await page.screenshot({ path: 'screenshot.png' });`;
    if (step.action === "wait")
      return `  await expect(page.getByText('${step.text}')).toBeVisible({ timeout: 10000 });`;
    return "";
  });

  return header + lines.join("\n") + footer;
};

const renderRobot = (steps, startUrl) => {
  const header = `*** Settings ***\nLibrary    SeleniumLibrary\n\n*** Variables ***\n\${URL}    ${startUrl}\n\${BROWSER}    chrome\n\n*** Test Cases ***\nMy Recorded Test\n    Open Browser    \${URL}    \${BROWSER}\n    Maximize Browser Window\n`;
  const footer = "\n    Close Browser";

  const lines = steps.map((step) => {
    if (typeof step === "string") return step;
    if (step.action === "click") return `    Click Element    ${step.robot}`;
    if (step.action === "input")
      return `    Input Text    ${step.robot}    ${step.value}`;
    if (step.action === "upload")
      return `    Choose File    ${step.robot}    \${EXECDIR}/${step.value}`;
    if (step.action === "screenshot") return `    Capture Page Screenshot`;
    if (step.action === "wait")
      return `    Wait Until Page Contains    ${step.text}    timeout=10s`;
    return "";
  });

  return header + lines.join("\n") + footer;
};

const renderScript = () => {
  chrome.storage.local.get(
    { steps: [], startUrl: "https://example.com", framework: "robot" },
    (data) => {
      const hasSteps = data.steps.length > 0;

      if (data.framework === "playwright") {
        currentExtension = ".spec.ts";
        scriptDisplay.textContent = hasSteps
          ? renderPlaywright(data.steps, data.startUrl)
          : "No records yet...";
      } else {
        currentExtension = ".robot";
        scriptDisplay.textContent = hasSteps
          ? renderRobot(data.steps, data.startUrl)
          : "No records yet...";
      }

      downloadBtn.textContent = `⬇️ Download ${currentExtension}`;
    },
  );
};

// --- Framework Toggle ---
btnRobot.onclick = () => {
  chrome.storage.local.set({ framework: "robot" }, () => {
    updateToggleUI("robot");
    renderScript();
  });
};

btnPlaywright.onclick = () => {
  chrome.storage.local.set({ framework: "playwright" }, () => {
    updateToggleUI("playwright");
    renderScript();
  });
};

// --- Init & Listeners ---
chrome.storage.local.get(["isRecording", "framework"], (result) => {
  updateUI(result.isRecording || false);
  updateToggleUI(result.framework || "robot");
  renderScript();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.steps || changes.startUrl) renderScript();
});

// --- Button Actions ---
startBtn.onclick = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0)
      chrome.storage.local.set(
        { isRecording: true, startUrl: tabs[0].url },
        () => {
          updateUI(true);
          window.close();
        },
      );
  });
};

stopBtn.onclick = () =>
  chrome.storage.local.set({ isRecording: false }, () => updateUI(false));

clearBtn.onclick = () => chrome.storage.local.set({ steps: [] }, renderScript);

// --- Copy & Download ---
copyText.onclick = () => {
  const textToCopy = scriptDisplay.textContent;
  if (textToCopy === "No records yet...") return alert("No script to copy!");

  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      const originalText = copyText.innerHTML;
      const originalColor = copyText.style.color;

      copyText.innerHTML = "✅ Copied!";
      copyText.style.color = "#28a745";
      copyText.style.textDecoration = "none";

      setTimeout(() => {
        copyText.innerHTML = originalText;
        copyText.style.color = originalColor;
        copyText.style.textDecoration = "underline";
      }, 1500);
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      alert("Failed to copy text.");
    });
};

downloadBtn.onclick = () => {
  if (scriptDisplay.textContent === "No records yet...")
    return alert("No data to download!");
  const blob = new Blob([scriptDisplay.textContent], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url,
    filename: currentFileName + currentExtension,
    saveAs: true,
  });
};
