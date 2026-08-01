# Code Review Fixes Design

## Goal

แก้ข้อบกพร่อง 4 รายการจาก code review ของ commit `03659d9` โดยรักษา API และรูปแบบการทำงานเดิมให้มากที่สุด พร้อมเพิ่ม regression tests ที่พิสูจน์พฤติกรรมแต่ละข้อ

## Scope

1. การแบ่งรายได้ต้องคงสมการ `reclaim_amount + university_amount = full_amount` ในหน่วยสตางค์เสมอ
2. ยอดรวมท้ายตารางรายงานต้องสะท้อนเฉพาะแถวที่ยังมองเห็นหลังค้นหา
3. ยอดเริ่มต้นของสินค้าใหม่ต้องมี inventory movement ที่ตรวจสอบย้อนหลังได้
4. policy แบ่งรายได้ที่เริ่มในอนาคตต้องยกเลิกได้ โดยไม่กระทบรายงานย้อนหลังของ policy ที่เคยมีผล

ไม่รวมการเปลี่ยนหน้าตา UI, การเพิ่ม dependency ด้าน decimal arithmetic หรือการ refactor ไฟล์ขนาดใหญ่ที่ไม่เกี่ยวข้อง

## Design

### Exact revenue allocation

การคำนวณจะเปลี่ยนจากการปัดยอดทั้งสองฝั่งอย่างอิสระ เป็นการแปลงยอดเต็มเป็นจำนวนสตางค์ก่อน คำนวณและปัด `reclaim` เพียงฝั่งเดียว แล้วกำหนด `university` จากส่วนต่างของยอดเต็ม วิธีนี้รักษายอดรวมได้แม้ยอดรับจริงมีเพียงหนึ่งสตางค์หรือ policy ใช้สัดส่วน 50/50 โดยไม่ต้องเพิ่ม library

### Visible report totals

จะแยก pure helper ในฝั่ง web สำหรับรวมคอลัมน์ชนิด `money` และ `number` จาก rows ที่ส่งเข้าไป `Reports` จะเรียก helper ด้วย rows หลังการค้นหาและเรียงลำดับ ทำให้ footer ตรงกับข้อมูลบนหน้าจอ ส่วน totals จาก API ยังเก็บไว้ใน response เพื่อไม่เปลี่ยน contract เดิม

### Opening inventory movement

การสร้าง `inventory_items` และ movement ยอดยกมาจะอยู่ใน SQLite transaction เดียวกัน หากยอดเริ่มต้นมากกว่า 0 ระบบจะสร้าง movement ชนิด `adjust` พร้อม reference ที่ระบุว่าเป็นยอดเริ่มต้น หากยอดเป็น 0 จะไม่สร้าง movement ที่ไม่มีผลต่อ balance ทั้ง audit record และ response เดิมยังคงอยู่

### Future policy cancellation

เมื่อยกเลิก policy ที่ `starts_at` อยู่หลังวันปัจจุบัน ระบบจะตั้ง `active=0` และไม่สร้าง `ends_at` ที่อยู่ก่อนวันเริ่มใช้ ตัวเลือก policy ในรายงานจะข้าม inactive policy ที่ไม่มี effective history ส่วน policy ที่เริ่มใช้แล้วและถูกยกเลิกจะยังมี `ends_at` และยังถูกเลือกสำหรับรายงานย้อนหลังภายในช่วงเดิมได้ วันที่ปัจจุบันสำหรับกติกานี้จะคำนวณตาม timezone ธุรกิจ `Asia/Bangkok` แทน UTC

## Error Handling and Compatibility

- Validation เดิมของสัดส่วนรวม 100% และช่วงวันที่ยังคงอยู่
- API response shapes และ endpoint paths ไม่เปลี่ยน
- การยกเลิก policy ยังต้องมีเหตุผลตามเดิม
- ข้อมูล policy เดิมที่ active หรือมี `ends_at` ยังคงใช้สร้างรายงานย้อนหลังได้

## Testing

- API report test: ยอด 0.01 บาทกับ policy 50/50 ต้องแบ่งแล้วรวมกลับได้ 0.01 บาท
- Web unit test: เมื่อค้นหาเหลือบาง rows footer totals ต้องรวมเฉพาะ rows เหล่านั้น
- API inventory test: การสร้างสินค้าที่มียอดเริ่มต้นต้องสร้าง `adjust` movement และยอดใน ledger ต้องตรงกับ balance
- API policy test: policy อนาคตยกเลิกได้ และไม่ถูกเลือกโดยรายงานหลังวันเริ่มเดิม
- รัน API/web test suites ทั้งหมดและ production build หลังแก้ไข

## Success Criteria

- regression tests ทั้ง 4 รายการ fail ก่อน implementation และ pass หลัง implementation
- test suites ทั้งหมดผ่านโดยไม่มี failure
- production web build ผ่าน
- ไม่มีการแก้หรือลบ working-tree changes เดิมของผู้ใช้
