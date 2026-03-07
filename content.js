let isRecording = false;

// เช็คว่าตอนนีอัดอยู่ไหม
chrome.storage.local.get(["isRecording"], function (result) {
  isRecording = result.isRecording || false;
});

// รอฟังคำสั่งจาก Popup ว่าให้เปิดหรือปิดการอัด
chrome.storage.onChanged.addListener(function (changes) {
  if (changes.isRecording) {
    isRecording = changes.isRecording.newValue;
  }
});

// ฟังก์ชันหา Selector (Priority ใหม่: ID > data-* > name > xpath)
function getSmartSelector(el) {
  // 1. Priority หลัก: เช็ค ID ก่อนเพื่อน (ยังคงดักจับ ID ที่เป็นตัวเลขสุ่ม 4 ตัวขึ้นไปเผื่อไว้)
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
    if (el.hasAttribute(attr)) {
      return `css=[${attr}="${el.getAttribute(attr)}"]`;
    }
  }

  // 3. ถ้าไม่มีทั้ง ID และ Data Attributes ให้ดูว่าเป็นปุ่มหรือลิงก์ไหม ถ้าใช่ให้หาจากข้อความ
  const tag = el.tagName.toLowerCase();
  if ((tag === "button" || tag === "a") && el.innerText.trim()) {
    // ดึงข้อความมาตัดช่องว่างและจำกัดความยาวไม่เกิน 30 ตัวอักษร
    const text = el.innerText.trim().substring(0, 30);
    return `xpath=//${tag}[contains(text(), '${text}')]`;
  }

  // 4. ท่าไม้ตายสุดท้าย ถ้าหาอะไรไม่เจอเลย คืนค่าเป็นชื่อ Tag
  return `xpath=//${tag}`;
}
// ฟังก์ชันบันทึก Step
function saveStep(step) {
  chrome.storage.local.get({ steps: [] }, (data) => {
    const newSteps = [...data.steps, step];
    chrome.storage.local.set({ steps: newSteps });
  });
}

// 1. ดักจับการคลิก
document.addEventListener(
  "click",
  (e) => {
    if (!isRecording) return;
    const selector = getSmartSelector(e.target);
    saveStep(`    Click Element    ${selector}`);
  },
  true,
);

// 2. ดักจับการพิมพ์ (รอให้พิมพ์เสร็จแล้วคลิกที่อื่น หรือกด Enter)
document.addEventListener(
  "change",
  (e) => {
    if (!isRecording) return;
    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      const selector = getSmartSelector(e.target);
      saveStep(`    Input Text    ${selector}    ${e.target.value}`);
    }
  },
  true,
);
