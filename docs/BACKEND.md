# Dormitory Management API

Backend สำหรับระบบจัดการหอพักมหาวิทยาลัย ใช้ Node.js 24, Express และ SQLite ในตัว Node เพื่อให้เริ่มพัฒนาและทดสอบได้โดยไม่ต้องติดตั้งฐานข้อมูลเพิ่ม

## เริ่มใช้งาน

```powershell
Copy-Item apps/api/.env.example apps/api/.env
npm run dev:api
```

API เริ่มต้นที่ `http://localhost:3000` และเก็บฐานข้อมูลที่ `data/dormitory.db` บัญชี seed สำหรับ development คือ `admin` / `Admin@1234` หากตั้ง `ADMIN_INITIAL_PASSWORD` ก่อนสร้างฐานข้อมูล ระบบจะใช้รหัสผ่านจาก environment แทน ต้องเปลี่ยนรหัสผ่านและ `JWT_SECRET` ก่อนนำไปใช้งานจริง

## ขอบเขตที่พัฒนาแล้ว

- Authentication แบบ local และ LDAP/AD adapter
- RBAC: ผู้ใช้งาน กลุ่มผู้ใช้งาน สิทธิ์ และผู้ใช้งานไม่จำกัดจำนวน
- Audit log สำหรับ login, create, update, delete, cancel, status change, password reset และ bank import
- Audit retention ไม่น้อยกว่า 90 วัน (`AUDIT_RETENTION_DAYS` ตั้งต่ำกว่า 90 ไม่ได้)
- ผู้เช่า 3 ประเภท พร้อมบัญชี Portal และ reset password
- อาคาร ชั้น ห้อง เตียง และสถานะว่าง/มีผู้พัก/ไม่พร้อม/ชำรุด
- Rate plan รายวัน รายเดือน รายเทอม รายปี, ค่าสาธารณูปโภค และค่าธรรมเนียม
- ใบแจ้งหนี้ รับชำระ ใบเสร็จ และการยกเลิกแบบบังคับระบุเหตุผล
- นำเข้าการชำระจาก CSV ธนาคาร
- งานแจ้งซ่อมและสถานะงาน
- สต็อกอุปกรณ์หอพัก ช่าง และทำความสะอาด พร้อมรายการเคลื่อนไหว
- รายงานรายวันตามผู้ออกใบเสร็จ, สรุปรายรับ, ใบนำส่ง, ทะเบียนใบเสร็จ, ลูกหนี้และอายุหนี้, เงินประกัน

## API สำคัญ

| Method | Path | หน้าที่ |
| --- | --- | --- |
| POST | `/api/auth/login` | Login local หรือ LDAP |
| GET/POST/PATCH/DELETE | `/api/users` | ผู้ใช้งานระบบ |
| GET/POST/PATCH/DELETE | `/api/roles` | กลุ่มผู้ใช้งาน |
| GET/PATCH | `/api/permissions` | สิทธิ์การใช้งาน |
| GET | `/api/audit-logs` | ตรวจสอบ Log ย้อนหลัง |
| GET/POST/PATCH | `/api/tenants` | นักศึกษา บุคลากร บุคคลภายนอก |
| GET/PATCH | `/api/rooms` | ห้องและสถานะห้อง |
| POST | `/api/invoices` | ตั้งหนี้และออกใบแจ้งหนี้ |
| POST | `/api/payments` | รับชำระและออกใบเสร็จ |
| POST | `/api/invoices/:id/cancel` | ยกเลิกใบแจ้งหนี้พร้อมเหตุผล |
| POST | `/api/receipts/:id/cancel` | ยกเลิกใบเสร็จพร้อมเหตุผล |
| POST | `/api/bank-imports` | นำเข้า CSV จากธนาคาร |
| GET | `/api/reports/*` | รายงานการเงินและลูกหนี้ |
| GET/POST/PATCH | `/api/repairs` | งานซ่อม |
| GET/POST | `/api/inventory` | สต็อกและการเบิกจ่าย |

ทุก endpoint ยกเว้น health และ login ใช้ `Authorization: Bearer <token>` และตรวจ permission ของผู้ใช้

## รูปแบบไฟล์ธนาคาร

Endpoint `/api/bank-imports` รับ JSON ที่มี `bankCode`, `filename` และ `csv` โดย CSV ต้องมีหัวคอลัมน์:

```csv
invoice_no,amount,reference_no,paid_at
INV-20260727-00001,8500,TX123456,2026-07-27T10:30:00.000Z
```

ก่อนเชื่อมธนาคารจริงต้องปรับ parser ให้ตรง specification ของธนาคารที่มหาวิทยาลัยเลือก เช่น encoding, delimiter, checksum, settlement date และ duplicate reference rule

## สิ่งที่ต้องได้รับจากมหาวิทยาลัยก่อนขึ้น Production

1. LDAP/AD URL, Base DN, service account, certificate chain, user filter และ attribute mapping
2. รูปแบบไฟล์ธนาคารและกติกากระทบยอดของธนาคารอย่างน้อยหนึ่งแห่ง
3. รูปแบบเลขที่เอกสาร ภาษี/ใบเสร็จ และลำดับการอนุมัตินำส่งเงิน
4. Template รายงาน HTML/PDF/Excel และตราสัญลักษณ์ที่อนุมัติ
5. นโยบาย backup, disaster recovery, log archive และการจัดเก็บข้อมูลส่วนบุคคล

SQLite เหมาะกับ development และ pilot ขนาดเล็ก หากเปิดใช้งานหลาย instance หรือมีธุรกรรมพร้อมกันจำนวนมาก ควรย้าย schema ไป PostgreSQL ก่อน Production
