# Requirement Coverage 3.11–3.22

สถานะในเอกสารนี้แยก `Implemented` ออกจาก `Integration pending` เพื่อไม่ให้ตีความว่าระบบเชื่อมบริการภายนอกสำเร็จแล้วทั้งที่ยังไม่ได้รับ configuration และ specification จากมหาวิทยาลัย

| Requirement | สถานะ | Implementation |
| --- | --- | --- |
| 3.11.1 อัตราห้องรายวัน/เดือน/เทอม/ปี | Implemented | เมนูการเงิน > กำหนดอัตรา บันทึก `rate_plans` พร้อมประเภทผู้เช่าและช่วงวันที่มีผล |
| 3.11.2 อัตราสาธารณูปโภค | Implemented | เมนูการเงิน > กำหนดอัตรา รองรับน้ำ/ไฟ อัตราต่อหน่วย ขั้นต่ำ และช่วงวันที่มีผล |
| 3.11.3 ค่าธรรมเนียมอื่น | Implemented | เมนูการเงิน > กำหนดอัตรา บันทึกรหัส ชื่อ และค่าเริ่มต้นใน `fee_types` |
| 3.11.4 ตั้งหนี้รายบุคคล | Implemented | Invoice และ invoice items ผูก tenant |
| 3.11.5 รับชำระและออกใบเสร็จ | Implemented | Payment สร้าง receipt ใน transaction เดียวกัน |
| 3.11.6–7 ยกเลิกใบแจ้งหนี้/ใบเสร็จพร้อมเหตุผล | Implemented | บังคับ reason และ Audit Log |
| 3.11.8–12 รายงานการรับเงินและลูกหนี้ | Implemented | ศูนย์รายงานมีกลุ่ม “การเงิน 3.11” ครบ 5 รายงาน: ตามผู้ออกใบเสร็จ, สรุปรายวัน, ใบนำส่งรายวัน, ทะเบียนเลขใบเสร็จ และสถานะชำระของนักศึกษา/บุคลากร พร้อม Export Excel |
| 3.12.1 รับชำระใบแจ้งหนี้ผ่านธนาคาร | Integration pending | Data model และ bank-file flow พร้อม รอ bank specification |
| 3.12.2 ชำระด้วยเลขที่บัญชีออนไลน์ | Integration pending | รองรับ payment method แล้ว รอ provider/callback specification |
| 3.12.3 นำเข้าไฟล์ธนาคาร | Implemented | CSV import พร้อมผลสำเร็จ/ผิดพลาดรายบรรทัด |
| 3.12.4 รองรับอย่างน้อยหนึ่งธนาคาร | Integration pending | UI เตรียมกรุงไทย รอ format และ test file ที่ธนาคารรับรอง |
| 3.13.1–2 ประวัติและที่อยู่ปัจจุบัน | Implemented | Tenant registry และ `current_address` |
| 3.13.3–4 บัญชีและรีเซ็ตรหัสผ่าน | Implemented | Local Portal account; LDAP ส่งต่อระบบกลาง |
| 3.13.5.1–3 รายงานใบแจ้งหนี้/รายรับแยกคอลัมน์ | Implemented | Report APIs และ Report Center UI |
| 3.13.5.4 ลูกหนี้และอายุหนี้ | Implemented | คำนวณ `age_days` จาก due date |
| 3.13.5.5 ผู้ทำสัญญา | Implemented | `leases` และ `/api/reports/contracts` |
| 3.13.5.6 เงินประกัน | Implemented | `/api/reports/deposits` |
| 3.14 ห้อง/เตียงว่าง/ห้องชำรุด | Implemented | Room/bed status และเหตุผลห้องชำรุด |
| 3.15 แจ้งซ่อม/กำลังซ่อม/ซ่อมแล้ว | Implemented | Repair workflow และ Repair board |
| 3.16–17 สต็อกอุปกรณ์ทุกประเภท | Implemented | Dormitory, maintenance และ cleaning categories |
| 3.18 Login ผ่าน LDAP | Integration pending | LDAPS adapter พร้อม รอ URL, certificate, bind DN และ mapping |
| 3.19 รหัสผ่านไม่น้อยกว่า 8 ตัว | Implemented | Frontend และ backend validation |
| 3.20 จัดเก็บรหัสผ่านปลอดภัย | Implemented | bcrypt cost 12; ไม่เก็บ LDAP password |
| 3.21 ข้อมูลอีเมลตาม AD | Integration pending | รองรับ `mail`/UPN รอรูปแบบบัญชีที่มหาวิทยาลัยอนุมัติ |
| 3.22 History Log ไม่น้อยกว่า 90 วัน | Implemented | Audit trail และ retention ต่ำสุด 90 วัน |

## External inputs required

1. LDAP/AD production URL, CA certificate, Base DN, bind account และ attribute mapping
2. รูปแบบ username และ email ของนักศึกษา/บุคลากร
3. Bank file specification, encoding, delimiter, checksum และ duplicate rules
4. Online payment provider, callback signature และ reconciliation process
5. แบบฟอร์มรายงาน ตราสัญลักษณ์ และรูปแบบเลขที่เอกสารที่ได้รับอนุมัติ
