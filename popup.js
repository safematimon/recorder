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
    if (step.action === "click") return `  await page.${step.pw}.click();`;
    if (step.action === "input")
      return `  await page.${step.pw}.fill(${jsStr(step.value)});`;
    if (step.action === "upload")
      return `  await page.${step.pw}.setInputFiles(${jsStr(step.value)});`;
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

// --- Selector Priority Settings (reusable controller) ---
// Builds a drag-to-reorder + enable/disable list bound to a storage key.
// `allowCustom` (with addInput/addBtn) enables adding custom attribute keys.
const createPriorityList = (opts) => {
  const {
    listEl, storageKey, meta, builtinKeys, defaultOrder,
    toggleEl, bodyEl, chevronEl, resetBtn, addInput, addBtn,
  } = opts;

  // Preserve custom keys; ensure every built-in is present (appended if missing).
  const normalize = (stored) => {
    const cfg = Array.isArray(stored)
      ? stored.filter((c) => c && typeof c.key === "string" && c.key)
      : [];
    const seen = new Set(cfg.map((c) => c.key));
    defaultOrder.forEach((key) => {
      if (!seen.has(key)) cfg.push({ key, enabled: true });
    });
    return cfg;
  };

  const readConfig = () =>
    [...listEl.querySelectorAll(".selector-item")].map((li) => ({
      key: li.dataset.key,
      enabled: li.querySelector("input").checked,
    }));

  const updateRanks = () => {
    listEl.querySelectorAll(".selector-item").forEach((li, i) => {
      li.querySelector(".rank").textContent = i + 1;
      li.classList.toggle("disabled", !li.querySelector("input").checked);
    });
  };

  const persist = () => {
    chrome.storage.local.set({ [storageKey]: readConfig() });
    updateRanks();
  };

  let draggingEl = null;
  const getDragAfterElement = (y) => {
    const items = [...listEl.querySelectorAll(".selector-item:not(.dragging)")];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (const child of items) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
    }
    return closest.element;
  };

  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!draggingEl) return;
    const after = getDragAfterElement(e.clientY);
    if (after == null) listEl.appendChild(draggingEl);
    else listEl.insertBefore(draggingEl, after);
  });

  const render = (config) => {
    listEl.innerHTML = "";
    config.forEach((item, i) => {
      const m =
        meta[item.key] || { label: item.key, desc: "custom attribute" };
      const li = document.createElement("li");
      li.className = "selector-item" + (item.enabled ? "" : " disabled");
      li.draggable = true;
      li.dataset.key = item.key;

      li.innerHTML = `
        <span class="drag-handle">⠿</span>
        <span class="rank">${i + 1}</span>
        <label class="selector-info">
          <input type="checkbox" ${item.enabled ? "checked" : ""} />
          <span class="selector-name">${m.label}</span>
          <span class="selector-desc">${m.desc}</span>
        </label>
        ${builtinKeys.includes(item.key) ? "" : '<button class="remove-btn" title="ลบ">✕</button>'}
      `;

      li.addEventListener("dragstart", () => {
        draggingEl = li;
        requestAnimationFrame(() => li.classList.add("dragging"));
      });
      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        draggingEl = null;
        persist();
      });
      li.querySelector("input").addEventListener("change", persist);
      const removeBtn = li.querySelector(".remove-btn");
      if (removeBtn)
        removeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          li.remove();
          persist();
        });

      listEl.appendChild(li);
    });
  };

  toggleEl.onclick = () => {
    const open = bodyEl.classList.toggle("open");
    chevronEl.textContent = open ? "▾" : "▸";
  };

  resetBtn.onclick = () => {
    const config = defaultOrder.map((key) => ({ key, enabled: true }));
    chrome.storage.local.set({ [storageKey]: config }, () => render(config));
  };

  if (addInput && addBtn) {
    const flashInput = (placeholder) => {
      addInput.value = "";
      const original = addInput.placeholder;
      addInput.placeholder = placeholder;
      addInput.classList.add("input-error");
      setTimeout(() => {
        addInput.placeholder = original;
        addInput.classList.remove("input-error");
      }, 1800);
    };
    const addCustom = () => {
      const key = addInput.value.trim();
      if (!key) return;
      if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(key))
        return flashInput("⚠️ ชื่อ attribute ไม่ถูกต้อง");
      const exists = [...listEl.querySelectorAll(".selector-item")].some(
        (li) => li.dataset.key === key,
      );
      if (exists) return flashInput("⚠️ มี selector นี้อยู่แล้ว");
      const config = [...readConfig(), { key, enabled: true }];
      chrome.storage.local.set({ [storageKey]: config }, () => render(config));
      addInput.value = "";
    };
    addBtn.onclick = addCustom;
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addCustom();
      }
    });
  }

  return { init: (stored) => render(normalize(stored)) };
};

// Robot/Selenium engine — built-ins + custom attributes (sync with content.js).
const ROBOT_KEYS = ["id", "data-testid", "name", "text"];
const ROBOT_META = {
  id: { label: "id", desc: "id ปกติ (ข้าม id เลขสุ่ม)" },
  "data-testid": { label: "data-testid", desc: "มาตรฐานสำหรับ test" },
  name: { label: "name", desc: "name ของ form field" },
  text: { label: "text", desc: "ข้อความใน button / a" },
};

// Playwright engine — fixed set of getBy* locators (sync with PW_STRATEGIES).
const PW_KEYS = ["testid", "role", "label", "placeholder", "alt", "text", "id"];
const PW_META = {
  testid: { label: "getByTestId", desc: "data-testid" },
  role: { label: "getByRole", desc: "role + ชื่อ" },
  label: { label: "getByLabel", desc: "label ของ input" },
  placeholder: { label: "getByPlaceholder", desc: "placeholder" },
  alt: { label: "getByAltText", desc: "alt ของรูป" },
  text: { label: "getByText", desc: "ข้อความสั้น ๆ" },
  id: { label: "locator('#id')", desc: "id" },
};

const robotList = createPriorityList({
  listEl: document.getElementById("selectorList"),
  storageKey: "selectorConfig",
  meta: ROBOT_META,
  builtinKeys: ROBOT_KEYS,
  defaultOrder: ROBOT_KEYS,
  toggleEl: document.getElementById("settingsToggle"),
  bodyEl: document.getElementById("settingsBody"),
  chevronEl: document.getElementById("settingsChevron"),
  resetBtn: document.getElementById("resetOrderBtn"),
  addInput: document.getElementById("newSelectorInput"),
  addBtn: document.getElementById("addSelectorBtn"),
});

const pwList = createPriorityList({
  listEl: document.getElementById("pwSelectorList"),
  storageKey: "pwSelectorConfig",
  meta: PW_META,
  builtinKeys: PW_KEYS,
  defaultOrder: PW_KEYS,
  toggleEl: document.getElementById("pwSettingsToggle"),
  bodyEl: document.getElementById("pwSettingsBody"),
  chevronEl: document.getElementById("pwSettingsChevron"),
  resetBtn: document.getElementById("pwResetOrderBtn"),
});

// --- Init & Listeners ---
chrome.storage.local.get(
  ["isRecording", "framework", "selectorConfig", "pwSelectorConfig"],
  (result) => {
    updateUI(result.isRecording || false);
    updateToggleUI(result.framework || "robot");
    robotList.init(result.selectorConfig);
    pwList.init(result.pwSelectorConfig);
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
