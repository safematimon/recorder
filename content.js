let isRecording = false;

// โหลดตั้งค่าเมื่อเริ่มทำงาน
chrome.storage.local.get(["isRecording"], (result) => {
  isRecording = result.isRecording || false;
});

// รอฟังคำสั่งการเปลี่ยนแปลงจาก Popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.isRecording) {
    isRecording = changes.isRecording.newValue;
  }
});

// ฟังก์ชันหา Selector แบบตายตัว (เรียงความสำคัญให้แล้ว)
const getSmartSelector = (el) => {
  if (!el || !el.tagName) return ""; // ป้องกัน Error

  // 1. Priority หลัก: เช็ค ID ก่อน
  if (el.id && !/\d{4,}/.test(el.id)) {
    return `id=${el.id}`;
  }

  // 2. ถ้าไม่มี ID ค่อยมาหา Data Attributes หรือ Name
  const dataAttr = [
    "data-testid",
    "data-qa",
    "data-cy",
    "data-automation",
    "name",
  ];
  for (let attr of dataAttr) {
    if (el.hasAttribute && el.hasAttribute(attr)) {
      return `css=[${attr}="${el.getAttribute(attr)}"]`;
    }
  }

  // 3. ถ้าไม่มี ให้ดูว่าเป็นปุ่มหรือลิงก์ไหม
  const tag = el.tagName.toLowerCase();
  if (
    (tag === "button" || tag === "a") &&
    el.innerText &&
    el.innerText.trim()
  ) {
    const text = el.innerText.trim().substring(0, 30);
    return `xpath=//${tag}[contains(text(), '${text}')]`;
  }

  // 4. ท่าไม้ตาย
  return `xpath=//${tag}`;
};

// ฟังก์ชันบันทึก Step
const saveStep = (step) => {
  chrome.storage.local.get({ steps: [] }, (data) => {
    const newSteps = [...data.steps, step];
    chrome.storage.local.set({ steps: newSteps });
  });
};

// 1. ดักจับการคลิก
document.addEventListener(
  "click",
  (e) => {
    if (!isRecording) return;
    const selector = getSmartSelector(e.target);
    if (selector) saveStep(`    Click Element    ${selector}`);
  },
  true,
);

// 2. ดักจับการพิมพ์
document.addEventListener(
  "change",
  (e) => {
    if (!isRecording) return;
    if (!e.target || !e.target.tagName) return;

    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      const selector = getSmartSelector(e.target);
      if (selector)
        saveStep(`    Input Text    ${selector}    ${e.target.value}`);
    }
  },
  true,
);

// 3. ดักจับการกดคีย์บอร์ด (สำหรับคีย์ลัดต่างๆ)
document.addEventListener("keydown", (e) => {
  if (!isRecording) return; // ถ้าไม่ได้อัดอยู่ให้ข้ามไป

  // ---------------------------------------------------
  // ฟีเจอร์ที่ 1: ถ่ายภาพหน้าจอ (Option + S หรือ Alt + S)
  // ---------------------------------------------------
  if (e.altKey && e.code === "KeyS") {
    e.preventDefault();
    saveStep(`    Capture Page Screenshot`);
    showToast("📸 เพิ่มคำสั่งถ่ายภาพหน้าจอแล้ว!");
  }

  // ---------------------------------------------------
  // ฟีเจอร์ที่ 2: รอจนกว่าจะเจอข้อความ (Option + W หรือ Alt + W)
  // ---------------------------------------------------
  if (e.altKey && e.code === "KeyW") {
    e.preventDefault();

    // ดึงข้อความที่ผู้ใช้กำลังคลุมดำ (Highlight) อยู่บนหน้าเว็บ
    const selectedText = window.getSelection().toString().trim();

    if (selectedText) {
      // จัดการลบพวกการเว้นบรรทัดออก ป้องกันโค้ด Robot Framework พัง
      const cleanText = selectedText.replace(/[\r\n]+/g, " ");

      // แทรกคำสั่ง Wait ลงไป (ใส่ timeout=10s ไว้ให้เป็นมาตรฐาน)
      saveStep(`    Wait Until Page Contains    ${cleanText}    timeout=10s`);

      // แสดงแจ้งเตือนว่าสำเร็จ
      showToast(`⏳ เพิ่มคำสั่งรอ: "${cleanText}"`);

      // เอาแถบคลุมดำออกให้ดูเนียนๆ (จะใส่หรือไม่ใส่ก็ได้)
      window.getSelection().removeAllRanges();
    } else {
      // ถ้ากดปุ่มแต่ไม่ได้คลุมดำข้อความไว้ ให้แจ้งเตือน
      showToast(
        "⚠️ กรุณาคลุมดำข้อความที่ต้องการรอก่อนกดคีย์ลัดครับ",
        "#dc3545",
      );
    }
  }
});

function showToast(message, bgColor = "#28a745") {
  const toast = document.createElement("div");
  toast.textContent = message;

  toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: ${bgColor};
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        font-family: sans-serif;
        font-size: 14px;
        font-weight: bold;
        z-index: 999999;
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        transition: opacity 0.3s;
    `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
