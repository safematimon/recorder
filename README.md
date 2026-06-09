# 🎬 Auto Test Recorder for Robot & Playwright

> Chrome Extension ที่บันทึกการกระทำบนหน้าเว็บ แล้วแปลงเป็น **Test Script** ให้ทันที — รองรับทั้ง **Robot Framework** และ **Playwright** จากการอัดเพียงครั้งเดียว

แทนที่จะนั่งเขียน selector ทีละบรรทัด แค่ใช้งานเว็บตามปกติ (คลิก พิมพ์ อัปโหลด) แล้ว extension จะเขียนโค้ดเทสต์ที่พร้อมรันให้

---

## ✨ Features

- 🎥 **บันทึก interaction อัตโนมัติ** — คลิก, พิมพ์ในช่อง input/textarea, อัปโหลดไฟล์
- ⌨️ **คำสั่งพิเศษผ่านคีย์ลัด** ระหว่างอัด — เพิ่ม screenshot และ wait ได้
- 🤖🎭 **Export ได้ 2 framework** — สลับ Robot Framework / Playwright ได้โดยไม่ต้องอัดใหม่
- 🧠 **Smart Selector Engine** — เลือก selector ที่เสถียร, เช็กความ unique, ปรับลำดับเองได้, เพิ่ม custom attribute ได้
- 📋 **จัดการ steps** — ดูรายการที่อัด, ลบทีละ step, ล้างทั้งหมด
- 💾 **ส่งออกง่าย** — พรีวิว real-time, คัดลอก, ดาวน์โหลดเป็นไฟล์

---

## 📦 การติดตั้ง

1. โคลนหรือดาวน์โหลดโปรเจกต์นี้
2. เปิด Chrome ไปที่ `chrome://extensions`
3. เปิด **Developer mode** (มุมขวาบน)
4. กด **Load unpacked** แล้วเลือกโฟลเดอร์โปรเจกต์
5. ปักหมุด extension ไว้บน toolbar เพื่อใช้งานสะดวก

---

## 🚀 วิธีใช้งาน

1. เปิดหน้าเว็บที่ต้องการเทสต์ แล้วคลิกไอคอน extension
2. กด **▶ Start** (ระบบจะจำ URL ปัจจุบันเป็นจุดเริ่มต้น)
3. ใช้งานเว็บตามปกติ — ทุกคลิก/การพิมพ์จะถูกบันทึก
4. กด **⏹ Stop** เมื่อเสร็จ
5. รีวิวรายการ steps แล้วลบอันที่ไม่ต้องการได้
6. เลือก framework (🤖 Robot / 🎭 Playwright) แล้ว **📋 Copy** หรือ **⬇️ Download**

### ⌨️ คีย์ลัดระหว่างอัด

| คีย์ลัด | การทำงาน |
|--------|----------|
| `Alt` + `S` | 📸 เพิ่มคำสั่งถ่าย Screenshot |
| `Alt` + `W` | ⏳ ไฮไลต์ข้อความก่อน แล้วเพิ่มคำสั่ง "รอจนกว่าข้อความจะปรากฏ" |

> 💡 ผู้ใช้ Mac ใช้ปุ่ม `Option` แทน `Alt`

---

## 🧠 Smart Selector Engine

extension เลือก selector ที่ **เสถียรและชี้ถูกตัว** โดยแยก engine ตาม framework — แต่ละฝั่งใช้ locator ที่เป็นสำนวนของตัวเอง

### Playwright — user-facing locators (ตามที่ Playwright แนะนำ)

| ลำดับ | เงื่อนไข | ผลลัพธ์ที่ได้ |
|------|---------|--------------|
| 1 | มี `data-testid` | `getByTestId('...')` |
| 2 | มี role + ชื่อ (ปุ่ม/ลิงก์/heading) | `getByRole('button', { name: '...' })` |
| 3 | input ผูกกับ `<label>` | `getByLabel('...')` |
| 4 | มี placeholder | `getByPlaceholder('...')` |
| 5 | รูปมี alt | `getByAltText('...')` |
| 6 | ข้อความสั้น ๆ | `getByText('...', { exact: true })` |
| 7 | มี id | `locator('#...')` |
| 8 | อื่น ๆ (อะไรก็ได้ที่ select ได้) | `locator('xpath=...')` (positional) |

> ลำดับฝั่ง Playwright ปรับเอง + เปิด/ปิดได้จาก UI (⚙️ Selector Priority (Playwright))

### Robot Framework — attribute & XPath (ปรับลำดับเองได้)

| ลำดับ | Strategy | ผลลัพธ์ที่ได้ | หมายเหตุ |
|------|----------|--------------|----------|
| 1 | `id` | `id=submit` | ข้าม id ที่มีเลขสุ่ม 4 หลักขึ้นไป |
| 2 | `data-testid` | `css=[data-testid="..."]` | มาตรฐานสำหรับ test |
| 3 | `name` | `css=[name="..."]` | name ของ form field |
| 4 | `text` | `xpath=//button[contains(text(), '...')]` | เฉพาะ `<button>` / `<a>` |
| fallback | positional XPath | `xpath=//*[@id="form"]/button[2]` | ใช้เมื่อไม่มีตัวไหน unique |

> ลำดับฝั่ง Robot ปรับเองได้ + เพิ่ม custom attribute (เช่น `aria-label`, `placeholder`) ได้จาก UI (⚙️ Selector Priority)

### จุดเด่นร่วม

- ✅ **เช็ก uniqueness** — ใช้ selector เฉพาะตอนที่ match element **เพียงตัวเดียว**บนหน้า ถ้าไม่ unique จะ fallback เป็น positional XPath ที่การันตีว่าชี้ถูกตัว
- 🎚️ **ปรับลำดับเองได้ทั้ง 2 engine** — ลากจัดลำดับ และเปิด/ปิด selector แต่ละแบบผ่าน UI แยกกันสำหรับ Robot และ Playwright
- 🛡️ **escape ปลอดภัย** — ทั้ง selector และค่าที่มี `'`, `"`, ช่องว่างซ้อน ถูก escape ให้สคริปต์ไม่พัง

---

## 📄 ตัวอย่าง Output

อัด: เข้าหน้า login → กรอกอีเมล/รหัสผ่าน → กดปุ่ม Login
(การอัดเดียวกัน แต่ละ engine ให้ selector คนละสำนวน)

### Robot Framework

```robotframework
*** Settings ***
Library    SeleniumLibrary

*** Variables ***
${URL}    https://example.com/login
${BROWSER}    chrome

*** Test Cases ***
My Recorded Test
    Open Browser    ${URL}    ${BROWSER}
    Maximize Browser Window
    Input Text    id=email    john@example.com
    Input Text    css=[name="password"]    secret123
    Click Element    xpath=//button[contains(text(), 'Login')]
    Close Browser
```

### Playwright

```javascript
import { test, expect } from '@playwright/test';

test('My Recorded Test', async ({ page }) => {
  await page.goto('https://example.com/login');

  await page.getByLabel('Email address').fill('john@example.com');
  await page.getByPlaceholder('Password').fill('secret123');
  await page.getByRole('button', { name: 'Login' }).click();
});
```

---

## 🗂️ โครงสร้างโปรเจกต์

```
recorder/
├── manifest.json     # Manifest V3
├── content.js        # บันทึก event + Smart Selector Engine
├── popup.html        # หน้าตา UI ของ popup
├── popup.js          # generate script + จัดการ steps/settings
├── style.css         # สไตล์ของ popup
└── icons/            # ไอคอน 16 / 48 / 128 px
```

---

## 🔧 รายละเอียดเชิงเทคนิค

- **Manifest V3** Chrome Extension
- **Vanilla JavaScript** ล้วน — ไม่มี dependency, ไม่ต้อง build
- เก็บ state ผ่าน `chrome.storage.local` (สถานะการอัด, steps, framework, ลำดับ selector)
- Content script ทำงานบน `<all_urls>` ดัก event ที่ระดับ `document` แบบ capture phase

### Permissions

| Permission | ใช้ทำอะไร |
|-----------|-----------|
| `storage` | เก็บ steps, การตั้งค่า และสถานะการอัด |
| `activeTab` | ดึง URL ของแท็บปัจจุบันตอนเริ่มอัด |
| `downloads` | ดาวน์โหลดไฟล์สคริปต์ที่ generate |

---