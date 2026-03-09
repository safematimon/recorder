let isRecording = false;

chrome.storage.local.get(["isRecording"], (result) => {
  isRecording = result.isRecording || false;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) isRecording = changes.isRecording.newValue;
});

// --- Helpers ---
const getSelectors = (el) => {
  if (!el || !el.tagName) return { robot: "", pw: "" };

  if (el.id && !/\d{4,}/.test(el.id)) {
    return { robot: `id=${el.id}`, pw: `#${el.id}` };
  }

  const dataAttrs = [
    "data-testid",
    "data-qa",
    "data-cy",
    "data-automation",
    "name",
  ];

  for (const attr of dataAttrs) {
    if (el.hasAttribute?.(attr)) {
      const val = el.getAttribute(attr);
      return { robot: `css=[${attr}="${val}"]`, pw: `[${attr}="${val}"]` };
    }
  }

  const tag = el.tagName.toLowerCase();
  if ((tag === "button" || tag === "a") && el.innerText?.trim()) {
    const text = el.innerText.trim().substring(0, 30).replace(/'/g, "\\'");
    return {
      robot: `xpath=//${tag}[contains(text(), '${text}')]`,
      pw: `//${tag}[contains(text(), '${text}')]`,
    };
  }

  return { robot: `xpath=//${tag}`, pw: `//${tag}` };
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
