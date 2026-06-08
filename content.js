let isRecording = false;

// --- Selector Strategies ---
// Each strategy returns { robot, pw } when it can build a selector for the
// element, or null to fall through to the next one. The order they are tried
// in is configurable from the popup (persisted as `selectorConfig`).
const attrSelector = (el, attr) => {
  if (el.hasAttribute?.(attr)) {
    const val = el.getAttribute(attr);
    return { robot: `css=[${attr}="${val}"]`, pw: `[${attr}="${val}"]` };
  }
  return null;
};

// `id` and `text` need custom logic; every other key is treated as a plain
// attribute selector via attrSelector, so users can add their own attributes
// (e.g. aria-label, placeholder) from the popup.
const SPECIAL_STRATEGIES = {
  id: (el) =>
    el.id && !/\d{4,}/.test(el.id)
      ? { robot: `id=${el.id}`, pw: `#${el.id}` }
      : null,
  text: (el) => {
    const tag = el.tagName.toLowerCase();
    if ((tag === "button" || tag === "a") && el.innerText?.trim()) {
      const text = el.innerText.trim().substring(0, 30).replace(/'/g, "\\'");
      return {
        robot: `xpath=//${tag}[contains(text(), '${text}')]`,
        pw: `//${tag}[contains(text(), '${text}')]`,
      };
    }
    return null;
  },
};

const buildSelector = (el, key) =>
  SPECIAL_STRATEGIES[key] ? SPECIAL_STRATEGIES[key](el) : attrSelector(el, key);

// Default priority (highest first). The popup can reorder/disable these and
// add custom attributes. `tag` is always the final fallback.
const DEFAULT_SELECTOR_ORDER = ["id", "data-testid", "name", "text"];

// Enabled strategy keys, in priority order — kept in sync with storage.
let selectorOrder = [...DEFAULT_SELECTOR_ORDER];

const applySelectorConfig = (config) => {
  if (Array.isArray(config) && config.length) {
    selectorOrder = config
      .filter((c) => c && c.enabled && typeof c.key === "string" && c.key)
      .map((c) => c.key);
  }
};

chrome.storage.local.get(["isRecording", "selectorConfig"], (result) => {
  isRecording = result.isRecording || false;
  applySelectorConfig(result.selectorConfig);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) isRecording = changes.isRecording.newValue;
  if (changes.selectorConfig)
    applySelectorConfig(changes.selectorConfig.newValue);
});

// --- Uniqueness helpers ---
// Count how many elements a selector matches (CSS, or XPath when it starts //).
const countMatches = (sel) => {
  try {
    if (sel.startsWith("//")) {
      const r = document.evaluate(
        sel,
        document,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      return r.snapshotLength;
    }
    return document.querySelectorAll(sel).length;
  } catch {
    return 0; // invalid selector → treat as no match
  }
};

const isStableId = (el) => el.id && !/\d{4,}/.test(el.id);

// Build a positional XPath that uniquely identifies `el`, anchored at the
// nearest ancestor with a stable id (or at <body>). Used as a last resort
// when no attribute/text selector matches a single element.
const positionalXPath = (el) => {
  const segs = [];
  let node = el;
  while (node && node.nodeType === 1) {
    if (node === document.body) {
      segs.unshift("body");
      break;
    }
    if (node !== el && isStableId(node)) {
      return `//*[@id="${node.id}"]/${segs.join("/")}`;
    }
    const tag = node.tagName.toLowerCase();
    let i = 1;
    for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
      if (s.tagName === node.tagName) i++;
    }
    segs.unshift(`${tag}[${i}]`);
    node = node.parentElement;
  }
  return `//${segs.join("/")}`;
};

// --- Helpers ---
const getSelectors = (el) => {
  if (!el || !el.tagName) return { robot: "", pw: "" };

  // Use the first enabled strategy whose selector matches exactly one element.
  for (const key of selectorOrder) {
    const result = buildSelector(el, key);
    if (result && countMatches(result.pw) === 1) return result;
  }

  // Nothing uniquely identifies the element → positional XPath fallback.
  const xp = positionalXPath(el);
  return { robot: `xpath=${xp}`, pw: xp };
};

const saveStep = (stepObject) => {
  chrome.storage.local.get({ steps: [] }, (data) => {
    chrome.storage.local.set({ steps: [...data.steps, stepObject] });
  });
};

const showToast = (message, bgColor = "#28a745") => {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background-color: ${bgColor}; color: white;
    padding: 10px 20px; border-radius: 5px;
    font-family: sans-serif; font-size: 14px; font-weight: bold;
    z-index: 999999; box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
};

// --- Event Listeners ---

// 1. Click
document.addEventListener(
  "click",
  (e) => {
    if (!isRecording) return;
    const sels = getSelectors(e.target);
    if (sels.robot)
      saveStep({ action: "click", robot: sels.robot, pw: sels.pw });
  },
  true,
);

// 2. Input & File Upload
document.addEventListener(
  "change",
  (e) => {
    if (!isRecording || !e.target?.tagName) return;

    const tag = e.target.tagName.toLowerCase();
    const type = (e.target.type || "").toLowerCase();
    const sels = getSelectors(e.target);
    if (!sels.robot) return;

    if (tag === "input" && type === "file") {
      const fileName = e.target.value.split("\\").pop().split("/").pop();
      saveStep({
        action: "upload",
        robot: sels.robot,
        pw: sels.pw,
        value: fileName,
      });
    } else if (
      (tag === "input" || tag === "textarea") &&
      type !== "checkbox" &&
      type !== "radio"
    ) {
      saveStep({
        action: "input",
        robot: sels.robot,
        pw: sels.pw,
        value: e.target.value,
      });
    }
  },
  true,
);

// 3. Keyboard Shortcuts
document.addEventListener("keydown", (e) => {
  if (!isRecording) return;

  // Screenshot (Option/Alt + S)
  if (e.altKey && !e.shiftKey && e.code === "KeyS") {
    e.preventDefault();
    saveStep({ action: "screenshot" });
    showToast("📸 Screenshot command added!");
  }

  // Wait for Text (Option/Alt + W)
  if (e.altKey && !e.shiftKey && e.code === "KeyW") {
    e.preventDefault();
    const selectedText = window
      .getSelection()
      .toString()
      .trim()
      .replace(/[\r\n]+/g, " ");
    if (selectedText) {
      saveStep({ action: "wait", text: selectedText });
      showToast(`⏳ Wait command added: "${selectedText}"`);
      window.getSelection().removeAllRanges();
    } else {
      showToast("⚠️ Please highlight text first.", "#dc3545");
    }
  }
});
