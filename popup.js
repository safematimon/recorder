const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const scriptDisplay = document.getElementById("scriptDisplay");
const statusText = document.getElementById("statusText");

// อัปเดตหน้าตาปุ่มตามสถานะการอัด
function updateUI(isRecording) {
  if (isRecording) {
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    statusText.innerHTML = "🟢 Recording... (คลิกบนเว็บได้เลย)";
    statusText.style.color = "#28a745";
  } else {
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    statusText.innerHTML = "🔴 Stopped";
    statusText.style.color = "#dc3545";
  }
}

// นำข้อมูลมาแสดงบนหน้าต่าง และใส่ URL ที่บันทึกไว้
function renderScript() {
  // ดึงทั้ง steps และ startUrl (ถ้าไม่มีให้ค่าเริ่มต้นเป็น URL ว่างๆ ไว้ก่อน)
  chrome.storage.local.get(
    { steps: [], startUrl: "https://example.com" },
    (data) => {
      // จัด Format ของ Robot Framework ให้สวยงาม
      const header = `*** Settings ***
Library    SeleniumLibrary

*** Variables ***
\${URL}    ${data.startUrl}
\${BROWSER}    chrome

*** Test Cases ***
My Recorded Test
    Open Browser    \${URL}    \${BROWSER}
    Maximize Browser Window
`;
      const footer = "\n    Close Browser";

      if (data.steps.length === 0) {
        scriptDisplay.textContent = "ยังไม่มีการบันทึก...";
      } else {
        scriptDisplay.textContent = header + data.steps.join("\n") + footer;
      }
    },
  );
}

// โหลดสถานะเมื่อเปิดหน้า Popup
chrome.storage.local.get(["isRecording"], (result) => {
  updateUI(result.isRecording || false);
  renderScript();
});

// ฟังคำสั่งเมื่อมี Step เพิ่มเข้ามา ให้รันแสดงผลใหม่ทันที
chrome.storage.onChanged.addListener((changes) => {
  if (changes.steps || changes.startUrl) renderScript();
});

// ตั้งค่าปุ่ม Start: ดึง URL ของแท็บปัจจุบันมาเก็บไว้ด้วย
startBtn.onclick = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0].url; // ดึง URL ของหน้าเว็บที่กำลังเปิดอยู่

    chrome.storage.local.set(
      {
        isRecording: true,
        startUrl: currentUrl, // บันทึก URL ไว้ใน Storage
      },
      () => updateUI(true),
    );
  });
};

// ตั้งค่าปุ่ม Stop และ Clear
stopBtn.onclick = () =>
  chrome.storage.local.set({ isRecording: false }, () => updateUI(false));
clearBtn.onclick = () => chrome.storage.local.set({ steps: [] }, renderScript);

// ฟังก์ชันสร้างไฟล์ .robot และดาวน์โหลด
downloadBtn.onclick = () => {
  const scriptContent = scriptDisplay.textContent;
  if (scriptContent === "ยังไม่มีการบันทึก...") {
    alert("ยังไม่มี Step ให้ดาวน์โหลดครับ!");
    return;
  }

  // สร้างไฟล์และบังคับนามสกุลเป็น .robot
  const blob = new Blob([scriptContent], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: url,
    filename: "automate_test.robot", // บังคับให้เป็นชื่อนี้
    saveAs: true, // เปิดหน้าต่างให้เลือกที่ Save (ผู้ใช้จะเห็นนามสกุล .robot ชัดเจน)
  });
};
