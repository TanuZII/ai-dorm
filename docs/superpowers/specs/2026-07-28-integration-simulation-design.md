# Integration Simulation Design

## เป้าหมาย

เพิ่มระบบจำลองสำหรับ LDAP/Active Directory, ไฟล์รับชำระจากธนาคาร และ Online Payment เพื่อทดสอบกระบวนการครบวงจรโดยไม่พึ่งบริการภายนอก ระบบจำลองต้องใช้เส้นทางธุรกิจเดียวกับ Production ให้มากที่สุด ตรวจสอบผลได้จากหน้าจอและ Audit Log และเปิดใช้ได้เฉพาะ Development/Test

## ขอบเขต

ระบบจะเพิ่ม Integration Adapter สามกลุ่มโดยไม่เปลี่ยนกฎค่าเช่า ห้องพัก สัญญา ใบแจ้งหนี้ ใบเสร็จ และรายงานที่มีอยู่:

1. Directory Adapter สำหรับยืนยันตัวตน LDAP/AD และอ่านชื่อกับอีเมล
2. Bank Adapter สำหรับสร้างไฟล์จำลอง นำเข้า ตรวจสอบ และกระทบยอดรายการธนาคาร
3. Payment Gateway Adapter สำหรับสร้าง Payment Session จำลองผลการชำระ และรับ Callback

ระบบจำลองเปิดด้วย `INTEGRATION_SIMULATION=true` เฉพาะเมื่อ `NODE_ENV` ไม่ใช่ `production` หากพบ configuration นี้ใน Production โปรแกรมต้องหยุดเริ่มทำงานพร้อมข้อความผิดพลาดที่ชัดเจน

บริการภายนอกจริงยังคงเป็นงาน Integration pending จนกว่ามหาวิทยาลัยจะให้ specification, credentials และ test environment ที่ได้รับอนุมัติ ระบบจำลองไม่ถือเป็นหลักฐานว่าเชื่อมต่อ Production สำเร็จแล้ว

## สถาปัตยกรรม

### การเลือก Adapter

แต่ละ Integration มีสัญญากลางที่แยก business flow ออกจากผู้ให้บริการ:

- Directory: ตรวจ credentials และคืน canonical identity
- Bank: parse และ validate settlement records ให้อยู่ในรูปแบบกลาง
- Payment Gateway: สร้าง session และตรวจสอบ callback event

Composition root เลือก Real หรือ Simulated Adapter ตอนเริ่มระบบจาก configuration Route และ service ที่เหลือรับ Adapter ผ่าน dependency injection เพื่อไม่ให้มีเงื่อนไข simulation กระจายอยู่ใน business logic

Simulated Adapter ต้อง deterministic: input และ scenario เดียวกันให้ผลลัพธ์เดียวกัน ยกเว้น identifier และ timestamp ที่ระบบสร้างอย่างชัดเจน

### ขอบเขตข้อมูล

ข้อมูล Integration จำลองทุกเหตุการณ์มี `simulation_id`, `provider`, `scenario`, external reference, สถานะ และ timestamp เพื่อเชื่อม Timeline กับ Audit Log ห้ามเก็บ password, shared secret, raw authorization header หรือ signing key ลงฐานข้อมูลและ Audit Log

ฐานข้อมูล automated test ใช้ in-memory database ส่วนการทดสอบผ่านหน้าจอใช้ฐานข้อมูล Development แยกจาก Production การรีเซ็ตลบได้เฉพาะ record ที่มี `simulation_id` ของ run ที่เลือก และต้องตรวจ foreign-key scope ก่อนลบ

## Directory Simulation

### บัญชีและผลลัพธ์

มีบัญชีจำลองสำหรับนักศึกษา บุคลากร และผู้ใช้ที่ไม่ผูก Tenant โดยใช้ข้อมูลที่ไม่ใช่บุคคลจริง บัญชีรองรับ scenario:

- `success`: credentials ถูกต้องและคืน username, display name และ email
- `invalid_credentials`: ปฏิเสธ username/password
- `not_found`: ไม่พบ directory entry
- `disabled`: พบบัญชีแต่ถูกระงับ
- `unavailable`: Directory ไม่พร้อมใช้งาน

### กระบวนการ

ผู้ใช้ Login ผ่าน endpoint และหน้าปกติ Directory Adapter คืน canonical identity ให้กระบวนการจับคู่ user เดิม เมื่อสำเร็จระบบออก JWT ตามสิทธิ์ภายใน เมื่อไม่สำเร็จระบบคืน error code ที่แยกประเภทได้แต่ไม่เปิดเผยข้อมูลลับ ทุกผลลัพธ์บันทึก Audit Log แบบ redacted

การลงนามสัญญาด้วยบัญชี LDAP จำลองใช้การยืนยัน credentials ผ่าน Directory Adapter เดียวกัน จึงทดสอบเส้นทาง re-authentication ได้ด้วย

## Bank Simulation

### รูปแบบกลาง

Bank Adapter แปลงไฟล์ provider-specific เป็น settlement record กลางที่มี invoice number, amount, reference number, paid timestamp และ optional settlement metadata การนำเข้าต้องตรวจ schema, ยอดเป็นบวก, timestamp, invoice, duplicate reference และยอดคงเหลือ

### กระบวนการ

1. เจ้าหน้าที่เลือกใบแจ้งหนี้และ scenario ในศูนย์ทดสอบ
2. ระบบสร้างไฟล์ธนาคารจำลองที่ดาวน์โหลดได้
3. เจ้าหน้าที่นำไฟล์เข้าผ่าน flow นำเข้าเดิม
4. Bank Adapter parse และ validate ทีละแถว
5. รายการผ่านสร้าง Payment วิธี `bank_file`, Receipt และปรับ Invoice balance ภายใน transaction เดียว
6. ผลตอบกลับแยก accepted/rejected รายบรรทัดพร้อมรหัสเหตุผล

Scenario ขั้นต่ำคือ `success`, `duplicate_reference`, `unknown_invoice`, `amount_mismatch`, `malformed_row` และ `invalid_timestamp` การนำเข้าไฟล์เดิมซ้ำต้องไม่สร้าง Payment หรือ Receipt เพิ่ม

## Online Payment Simulation

### Payment Session

ผู้เช่าสร้าง Payment Session จากใบแจ้งหนี้ที่ยังมียอดคงเหลือ ระบบตรึง invoice ID, tenant ID, requested amount, currency `THB`, expiry และ unique session reference ผู้เช่าเข้าถึงได้เฉพาะ session ของตนเอง เจ้าหน้าที่ที่มีสิทธิ์ Integration simulation จึงจะเลือก scenario ได้

### Callback

Payment Simulator รองรับ `success`, `declined`, `cancelled`, `expired`, `amount_mismatch`, `invalid_signature` และ duplicate delivery Callback ใช้ payload canonical, HMAC signature, timestamp และ event ID

Callback endpoint ต้อง:

1. ตรวจ signature และช่วงอายุ timestamp ก่อนอ่านผลธุรกรรม
2. ตรวจ event ID และ provider reference แบบ idempotent
3. ตรวจ session, invoice, tenant, currency และ amount
4. เมื่อสำเร็จจึงสร้าง Payment วิธี `online_account`, Receipt และปรับ Invoice balance ใน transaction เดียว
5. บันทึกเหตุการณ์ที่ปฏิเสธโดยไม่เปลี่ยนยอดหนี้
6. ตอบ duplicate callback ด้วยผลสำเร็จแบบ idempotent โดยอ้าง Payment เดิม

## ศูนย์ทดสอบ Integration

หน้า “ศูนย์ทดสอบ Integration” แสดงเฉพาะเมื่อ Backend ยืนยันว่า simulation เปิดใช้งาน และผู้ใช้มีสิทธิ์ผู้ดูแล Integration หน้าจอประกอบด้วย:

- สถานะ Directory, Bank และ Payment Adapter พร้อมแถบคำเตือน “ระบบจำลอง”
- รายการบัญชี Directory จำลองและ scenario สำหรับทดสอบ
- ตัวสร้างไฟล์ธนาคารจากใบแจ้งหนี้
- Payment Simulator สำหรับเลือก session และผลลัพธ์
- Timeline ของ request, callback, validation, Payment, Receipt และ Audit Log
- การรีเซ็ต simulation run ที่เลือกพร้อมหน้าต่างยืนยัน

หน้า Login และหน้าการเงินต้องแสดง badge จำลองเมื่อ health/config endpoint แจ้งว่า simulation เปิดอยู่ เพื่อป้องกันผู้ทดสอบเข้าใจผิดว่าเป็นระบบจริง

## สิทธิ์และความปลอดภัย

- Endpoint สำหรับสร้าง scenario, ส่ง callback จำลอง และรีเซ็ตข้อมูลต้องใช้ permission เฉพาะ `integrations.simulate`
- Endpoint callback รับได้โดยไม่ใช้ JWT แต่ต้องผ่าน signature และ timestamp validation
- Endpoint จำลองทั้งหมดตอบ `404` เมื่อ simulation ปิด เพื่อลดการเปิดเผย attack surface
- Production startup guard ตรวจ configuration ก่อนเปิด HTTP listener
- Secret ใช้ผ่าน environment และไม่ส่งกลับ Frontend
- Audit Log redaction ครอบคลุม password, secret, signature และ authorization data
- การ reset เป็นการกระทำที่มีผลกระทบ จึงต้องระบุ simulation run ชัดเจนและบันทึก Audit Log

## การจัดการข้อผิดพลาด

API ใช้ error code ที่คงที่และข้อความภาษาไทยสำหรับผู้ใช้ ได้แก่ invalid credentials, provider unavailable, invalid file, duplicate reference, invoice unavailable, amount mismatch, invalid signature, expired event และ forbidden simulation Error response ต้องไม่คืน stack trace หรือ secret

ธุรกรรมการเงินใช้ database transaction หากสร้าง Payment, Receipt หรือปรับ Invoice ขั้นใดล้มเหลว ต้อง rollback ทั้งชุด Callback และ bank row ที่ล้มเหลวต้องสามารถ retry ได้เมื่อแก้ข้อมูลแล้ว ยกเว้น event ที่ประมวลผลสำเร็จแล้วซึ่งตอบแบบ idempotent

## การทดสอบ

ใช้ TDD กับพฤติกรรมใหม่ทุกส่วน:

- Unit tests สำหรับ configuration guard, Adapter contract, bank parser, HMAC signing และ timestamp validation
- API integration tests สำหรับ Directory scenario ทุกแบบ
- Bank end-to-end tests ตั้งแต่ Invoice ถึง Payment, Receipt และรายงาน รวม duplicate และ malformed rows
- Online Payment end-to-end tests ตั้งแต่ session ถึง callback, Receipt และ notification รวม signature ปลอม ยอดไม่ตรง callback หมดอายุ และ duplicate event
- Authorization tests สำหรับสิทธิ์ `integrations.simulate`, tenant ownership และ simulation endpoints เมื่อปิดระบบ
- Reset-scope tests เพื่อยืนยันว่าไม่ลบข้อมูลนอก simulation run
- Frontend tests สำหรับ conditional visibility, warning badge และ scenario result
- Regression suite ทั้ง API/Web และ production frontend build

## เกณฑ์รับงาน

1. เปิด simulation ใน Development/Test แล้วทดสอบ LDAP, Bank และ Online Payment จากหน้าจอจนถึง Audit Log ได้
2. Scenario ที่กำหนดทั้งหมดให้ผลลัพธ์และ error code ที่ตรวจสอบซ้ำได้
3. การรับเงินสำเร็จสร้าง Payment/Receipt และอัปเดต Invoice/Report เพียงครั้งเดียว
4. Duplicate import/callback ไม่สร้างรายการรับเงินซ้ำ
5. ผู้ไม่มีสิทธิ์เรียก simulation endpoint ไม่ได้ และ endpoint หายไปเมื่อปิด simulation
6. Production ปฏิเสธ `INTEGRATION_SIMULATION=true` ก่อนเปิด HTTP listener
7. ข้อมูลลับไม่ปรากฏใน response, database หรือ Audit Log
8. Automated tests ใหม่และ regression tests เดิมผ่าน พร้อม frontend production build ผ่าน

## สิ่งที่ไม่อยู่ในขอบเขต

- การเชื่อม LDAP/AD, ธนาคาร หรือ Payment Gateway Production จริง
- การรับรอง format หรือ security control จากผู้ให้บริการจริง
- การย้ายฐานข้อมูลจาก SQLite ไป PostgreSQL
- การเปลี่ยนกฎค่าเช่า สัญญา ห้องพัก หรือรายงานที่ไม่เกี่ยวกับ Integration simulation
