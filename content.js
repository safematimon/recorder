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

// --- Robot/Selenium selector (attribute & XPath engine, configurable) ---
const robotSelectorOf = (el) => {
  // First enabled strategy whose selector matches exactly one element.
  for (const key of selectorOrder) {
    const result = buildSelector(el, key);
    if (result && countMatches(result.pw) === 1) return result.robot;
  }
  // Nothing unique → positional XPath fallback.
  return `xpath=${positionalXPath(el)}`;
};

// --- Playwright locator (user-facing locators, per Playwright guidance) ---
// String escaping helpers.
const jsStr = (s) =>
  `'${String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}'`;

const cssAttrVal = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);

// Build a valid XPath string literal, even when the value contains quotes.
const xpathLiteral = (s) => {
  s = String(s);
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  return "concat(" + s.split('"').map((p) => `"${p}"`).join(`, '"', `) + ")";
};

const visibleText = (el) =>
  (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");

// Implicit ARIA role for elements whose accessible name is their text.
const textNamedRole = (el) => {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (/^h[1-6]$/.test(tag)) return "heading";
  return null;
};

// Resolve the associated label text for a form control.
const labelTextFor = (el) => {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const ref = document.getElementById(labelledby);
    if (ref) return visibleText(ref);
  }
  if (el.id) {
    const lbl = document.querySelector(`label[for="${cssAttrVal(el.id)}"]`);
    if (lbl) return visibleText(lbl);
  }
  const wrap = el.closest?.("label");
  if (wrap) return visibleText(wrap);
  return "";
};

// Each returns { expr, match }: `expr` is the Playwright locator (after
// `page.`), `match` is a CSS/XPath used to verify it identifies one element.
const PW_STRATEGIES = {
  testid: (el) => {
    const v = el.getAttribute("data-testid");
    return v
      ? { expr: `getByTestId(${jsStr(v)})`, match: `[data-testid="${cssAttrVal(v)}"]` }
      : null;
  },
  role: (el) => {
    const role = textNamedRole(el);
    if (!role) return null;
    const name = visibleText(el);
    if (!name || name.length > 60) return null;
    const lit = xpathLiteral(name);
    const explicit = el.getAttribute("role");
    const match = explicit
      ? `//*[@role=${xpathLiteral(explicit)}][normalize-space(.)=${lit}]`
      : `//${el.tagName.toLowerCase()}[normalize-space(.)=${lit}]`;
    return { expr: `getByRole('${role}', { name: ${jsStr(name)} })`, match };
  },
  label: (el) => {
    const tag = el.tagName.toLowerCase();
    if (!["input", "textarea", "select"].includes(tag)) return null;
    const label = labelTextFor(el);
    if (!label) return null;
    return {
      expr: `getByLabel(${jsStr(label)})`,
      match: `//label[normalize-space(.)=${xpathLiteral(label)}]`,
    };
  },
  placeholder: (el) => {
    const v = el.getAttribute("placeholder");
    return v
      ? { expr: `getByPlaceholder(${jsStr(v)})`, match: `[placeholder="${cssAttrVal(v)}"]` }
      : null;
  },
  alt: (el) => {
    if (el.tagName.toLowerCase() !== "img") return null;
    const v = el.getAttribute("alt");
    return v
      ? { expr: `getByAltText(${jsStr(v)})`, match: `img[alt="${cssAttrVal(v)}"]` }
      : null;
  },
  text: (el) => {
    const t = visibleText(el);
    if (!t || t.length > 40) return null;
    return {
      expr: `getByText(${jsStr(t)}, { exact: true })`,
      match: `//*[normalize-space(.)=${xpathLiteral(t)}]`,
    };
  },
  id: (el) => {
    if (!isStableId(el)) return null;
    const sel = `#${cssEscape(el.id)}`;
    return { expr: `locator(${jsStr(sel)})`, match: sel };
  },
};

// Default Playwright priority (highest first); reorder/disable from the popup.
const DEFAULT_PW_ORDER = [
  "testid",
  "role",
  "label",
  "placeholder",
  "alt",
  "text",
  "id",
];
let pwOrder = [...DEFAULT_PW_ORDER];
const applyPwConfig = (config) => {
  if (Array.isArray(config) && config.length) {
    pwOrder = config
      .filter((c) => c && c.enabled && PW_STRATEGIES[c.key])
      .map((c) => c.key);
  }
};

const playwrightLocatorOf = (el) => {
  for (const key of pwOrder) {
    let r = null;
    try {
      r = PW_STRATEGIES[key](el);
    } catch {
      r = null;
    }
    if (r && countMatches(r.match) === 1) return r.expr;
  }
  // anything that selects → positional XPath.
  return `locator(${jsStr("xpath=" + positionalXPath(el))})`;
};

// --- Combined ---
const getSelectors = (el) => {
  if (!el || !el.tagName) return { robot: "", pw: "" };
  return { robot: robotSelectorOf(el), pw: playwrightLocatorOf(el) };
};

// --- Load config from storage (registered after all definitions) ---
chrome.storage.local.get(
  ["isRecording", "selectorConfig", "pwSelectorConfig"],
  (result) => {
    isRecording = result.isRecording || false;
    applySelectorConfig(result.selectorConfig);
    applyPwConfig(result.pwSelectorConfig);
  },
);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) isRecording = changes.isRecording.newValue;
  if (changes.selectorConfig)
    applySelectorConfig(changes.selectorConfig.newValue);
  if (changes.pwSelectorConfig) applyPwConfig(changes.pwSelectorConfig.newValue);
});

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
