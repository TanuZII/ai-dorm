# Project Architecture

## Boundary

### `apps/web`

รับผิดชอบเฉพาะส่วนติดต่อผู้ใช้งาน การแสดงผล การกรอกข้อมูล และเรียก REST API ไม่มีการเข้าถึงฐานข้อมูลหรือ LDAP โดยตรง

โครงสร้างภายในยึดแนวทาง presentational/container:

- `assets/` เก็บรูปภาพ ไอคอน และฟอนต์ที่ import เข้า application
- `components/` เก็บ component ที่ไม่มี state ของตัวเอง หนึ่งโฟลเดอร์ต่อหนึ่ง component
- `containers/` เก็บ component ที่ควบคุม state, event และประกอบ components เข้าด้วยกัน
- `App.jsx` เป็น root component และไม่รวม business UI จำนวนมากไว้ในไฟล์เดียว
- `main.jsx` เป็น entry point สำหรับ render React

โปรเจกต์ใช้ Tailwind จึงไม่สร้างไฟล์ CSS เปล่าให้ทุก component; global CSS อยู่ที่ `index.css` และ component styling อยู่ใน utility classes

### `apps/api`

รับผิดชอบ authentication, authorization, validation, business rules, audit log, LDAP adapter และการเข้าถึงฐานข้อมูล ทุก endpoint ยกเว้น health และ login ต้องผ่าน JWT และ permission middleware

โครงสร้างภายใน API ยังตั้งใจให้เรียบง่าย:

- `index.js` เปิด HTTP server เท่านั้น
- `app.js` ประกอบ Express application และ routes
- `db.js` สร้าง schema, seed และจัดการ retention ของ log
- `auth.js` ตรวจ credentials, JWT และ permission
- `ldap.js` เชื่อมฐานผู้ใช้งานกลาง
- `audit.js` กรองข้อมูลลับและเขียน audit trail
- `reports.js` รวมคำจำกัดความรายงาน สูตรแบ่งรายได้ และสร้างไฟล์ Excel
- `announcements.js` ควบคุมผู้รับข่าวระดับทุกห้อง/เฉพาะห้องและคอมเมนต์ผู้เช่า
- `test/` ทดสอบ flow ผ่าน HTTP API จริงด้วยฐานข้อมูล in-memory

เมื่อโมดูลใน `app.js` เติบโต ค่อยแยกตาม domain เช่น `modules/finance`, `modules/tenants` และ `modules/inventory` โดยไม่ต้องแยกก่อนมีความซับซ้อนจริง

### `data`

เก็บไฟล์ runtime เท่านั้น ฐานข้อมูล default คือ `data/dormitory.db` และไม่ควร commit ไฟล์ฐานข้อมูล

### `docs`

เก็บเอกสาร architecture, API, integration requirements และ production checklist แยกจาก source code

## Request flow

```text
Browser
  → React web
  → /api request
  → Authentication
  → Permission check
  → Validation
  → Business rule
  → SQLite
  → Audit log
```

LDAP ใช้เฉพาะขั้นตอนยืนยันตัวตน Backend จะออก JWT ของระบบหลัง LDAP ยืนยันสำเร็จ เพื่อไม่ให้ frontend ถือ LDAP credentials นานเกิน request login
