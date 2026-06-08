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
// Safely embed a value into a single-quoted JS string literal.
const jsStr = (s) =>
  `'${String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}'`;

// Escape a Robot Framework argument: literal backslashes, plus spaces Robot
// would otherwise treat as a cell separator (runs of 2+, and leading/trailing).
const robotArg = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/ {2,}/g, (m) => m.replace(/ /g, "\\ "))
    .replace(/^ /, "\\ ")
    .replace(/ $/, "\\ ");

const renderPlaywright = (steps, startUrl) => {
  const header = `import { test, expect } from '@playwright/test';\n\ntest('My Recorded Test', async ({ page }) => {\n  await page.goto(${jsStr(startUrl)});\n\n`;
  const footer = `\n});`;

  const lines = steps.map((step) => {
    if (typeof step === "string")
      return `  // Please click Clear 🗑 and record again for Playwright`;
    if (step.action === "click")
      return `  await page.locator(${jsStr(step.pw)}).click();`;
    if (step.action === "input")
      return `  await page.locator(${jsStr(step.pw)}).fill(${jsStr(step.value)});`;
    if (step.action === "upload")
      return `  await page.locator(${jsStr(step.pw)}).setInputFiles(${jsStr(step.value)});`;
    if (step.action === "screenshot")
      return `  await page.screenshot({ path: 'screenshot.png' });`;
    if (step.action === "wait")
      return `  await expect(page.getByText(${jsStr(step.text)})).toBeVisible({ timeout: 10000 });`;
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
      return `    Input Text    ${step.robot}    ${robotArg(step.value)}`;
    if (step.action === "upload")
      return `    Choose File    ${step.robot}    \${EXECDIR}/${robotArg(step.value)}`;
    if (step.action === "screenshot") return `    Capture Page Screenshot`;
    if (step.action === "wait")
      return `    Wait Until Page Contains    ${robotArg(step.text)}    timeout=10s`;
    return "";
  });

  return header + lines.join("\n") + footer;
};

const renderScript = () => {
  chrome.storage.local.get(
    { steps: [], startUrl: "https://example.com", framework: "robot" },
    (data) => {
      renderSteps(data.steps);
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

// --- Recorded Steps List ---
const stepsPanel = document.getElementById("stepsPanel");
const stepsList = document.getElementById("stepsList");
const stepsCount = document.getElementById("stepsCount");

const STEP_LABEL = {
  click: (s) => ({ icon: "🖱️", text: "Click", meta: s.pw || s.robot || "" }),
  input: (s) => ({ icon: "⌨️", text: `Input “${s.value ?? ""}”`, meta: s.pw || s.robot || "" }),
  upload: (s) => ({ icon: "📎", text: `Upload ${s.value ?? ""}`, meta: s.pw || s.robot || "" }),
  screenshot: () => ({ icon: "📸", text: "Screenshot", meta: "" }),
  wait: (s) => ({ icon: "⏳", text: `Wait for “${s.text ?? ""}”`, meta: "" }),
};

const deleteStep = (index) => {
  chrome.storage.local.get({ steps: [] }, (data) => {
    const steps = data.steps.slice();
    steps.splice(index, 1);
    chrome.storage.local.set({ steps }); // onChanged → re-renders steps + script
  });
};

const renderSteps = (steps) => {
  stepsList.innerHTML = "";
  if (!steps.length) {
    stepsPanel.style.display = "none";
    return;
  }
  stepsPanel.style.display = "block";
  stepsCount.textContent = steps.length;

  steps.forEach((step, i) => {
    let info;
    if (typeof step === "string") info = { icon: "•", text: step, meta: "" };
    else
      info = (STEP_LABEL[step.action] || (() => ({ icon: "•", text: step.action || "step", meta: "" })))(step);

    const li = document.createElement("li");
    li.className = "step-item";
    li.innerHTML = `
      <span class="step-num">${i + 1}</span>
      <span class="step-icon"></span>
      <span class="step-text"></span>
      <span class="step-meta"></span>
      <button class="step-del" title="ลบ step นี้">✕</button>
    `;
    // user-derived values go through textContent to avoid HTML injection
    li.querySelector(".step-icon").textContent = info.icon;
    li.querySelector(".step-text").textContent = info.text;
    li.querySelector(".step-meta").textContent = info.meta;
    li.querySelector(".step-del").addEventListener("click", () => deleteStep(i));
    stepsList.appendChild(li);
  });
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

// --- Selector Priority Settings ---
const settingsToggle = document.getElementById("settingsToggle");
const settingsBody = document.getElementById("settingsBody");
const settingsChevron = document.getElementById("settingsChevron");
const selectorList = document.getElementById("selectorList");
const resetOrderBtn = document.getElementById("resetOrderBtn");

// Built-in selectors (can be reordered/disabled but not removed). Any other
// key in the config is a user-added custom attribute. Keep `id`/`text` in sync
// with SPECIAL_STRATEGIES in content.js.
const BUILTIN_KEYS = ["id", "data-testid", "name", "text"];
const SELECTOR_META = {
  id: { label: "id", desc: "id ปกติ (ข้าม id เลขสุ่ม)" },
  "data-testid": { label: "data-testid", desc: "มาตรฐานสำหรับ test" },
  name: { label: "name", desc: "name ของ form field" },
  text: { label: "text", desc: "ข้อความใน button / a" },
};

// Preserve custom keys; ensure every built-in is present (appended if missing).
const normalizeConfig = (stored) => {
  const cfg = Array.isArray(stored)
    ? stored.filter((c) => c && typeof c.key === "string" && c.key)
    : [];
  const seen = new Set(cfg.map((c) => c.key));
  BUILTIN_KEYS.forEach((key) => {
    if (!seen.has(key)) cfg.push({ key, enabled: true });
  });
  return cfg;
};

const updateRanks = () => {
  selectorList.querySelectorAll(".selector-item").forEach((li, i) => {
    li.querySelector(".rank").textContent = i + 1;
    li.classList.toggle("disabled", !li.querySelector("input").checked);
  });
};

const readConfig = () =>
  [...selectorList.querySelectorAll(".selector-item")].map((li) => ({
    key: li.dataset.key,
    enabled: li.querySelector("input").checked,
  }));

const persistOrder = () => {
  chrome.storage.local.set({ selectorConfig: readConfig() });
  updateRanks();
};

let draggingEl = null;

const getDragAfterElement = (y) => {
  const items = [
    ...selectorList.querySelectorAll(".selector-item:not(.dragging)"),
  ];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of items) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
};

selectorList.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!draggingEl) return;
  const after = getDragAfterElement(e.clientY);
  if (after == null) selectorList.appendChild(draggingEl);
  else selectorList.insertBefore(draggingEl, after);
});

const renderSelectorList = (config) => {
  selectorList.innerHTML = "";
  config.forEach((item, i) => {
    const isBuiltin = BUILTIN_KEYS.includes(item.key);
    const meta =
      SELECTOR_META[item.key] || { label: item.key, desc: "custom attribute" };
    const li = document.createElement("li");
    li.className = "selector-item" + (item.enabled ? "" : " disabled");
    li.draggable = true;
    li.dataset.key = item.key;

    li.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="rank">${i + 1}</span>
      <label class="selector-info">
        <input type="checkbox" ${item.enabled ? "checked" : ""} />
        <span class="selector-name">${meta.label}</span>
        <span class="selector-desc">${meta.desc}</span>
      </label>
      ${isBuiltin ? "" : '<button class="remove-btn" title="ลบ">✕</button>'}
    `;

    li.addEventListener("dragstart", () => {
      draggingEl = li;
      requestAnimationFrame(() => li.classList.add("dragging"));
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      draggingEl = null;
      persistOrder();
    });
    li.querySelector("input").addEventListener("change", persistOrder);
    const removeBtn = li.querySelector(".remove-btn");
    if (removeBtn)
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        li.remove();
        persistOrder();
      });

    selectorList.appendChild(li);
  });
};

settingsToggle.onclick = () => {
  const open = settingsBody.classList.toggle("open");
  settingsChevron.textContent = open ? "▾" : "▸";
};

// --- Add custom attribute selector ---
const newSelectorInput = document.getElementById("newSelectorInput");
const addSelectorBtn = document.getElementById("addSelectorBtn");

const flashInput = (placeholder) => {
  newSelectorInput.value = "";
  const original = newSelectorInput.placeholder;
  newSelectorInput.placeholder = placeholder;
  newSelectorInput.classList.add("input-error");
  setTimeout(() => {
    newSelectorInput.placeholder = original;
    newSelectorInput.classList.remove("input-error");
  }, 1800);
};

const addCustomSelector = () => {
  const key = newSelectorInput.value.trim();
  if (!key) return;
  if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(key))
    return flashInput("⚠️ ชื่อ attribute ไม่ถูกต้อง");

  const exists = [...selectorList.querySelectorAll(".selector-item")].some(
    (li) => li.dataset.key === key,
  );
  if (exists) return flashInput("⚠️ มี selector นี้อยู่แล้ว");

  const config = [...readConfig(), { key, enabled: true }];
  chrome.storage.local.set({ selectorConfig: config }, () =>
    renderSelectorList(config),
  );
  newSelectorInput.value = "";
};

addSelectorBtn.onclick = addCustomSelector;
newSelectorInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addCustomSelector();
  }
});

resetOrderBtn.onclick = () => {
  const config = BUILTIN_KEYS.map((key) => ({ key, enabled: true }));
  chrome.storage.local.set({ selectorConfig: config }, () =>
    renderSelectorList(config),
  );
};

// --- Init & Listeners ---
chrome.storage.local.get(
  ["isRecording", "framework", "selectorConfig"],
  (result) => {
    updateUI(result.isRecording || false);
    updateToggleUI(result.framework || "robot");
    renderSelectorList(normalizeConfig(result.selectorConfig));
    renderScript();
  },
);

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
