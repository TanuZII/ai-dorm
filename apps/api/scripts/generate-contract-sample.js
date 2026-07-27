import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createContractPdf } from '../src/contractPdf.js'

const outputDir = resolve('output/pdf')
await mkdir(outputDir, { recursive: true })
const pdf = await createContractPdf({
  id: 1, contract_no: 'CT-SAMPLE-2569-001', version: 1, contract_date: '2026-07-27',
  rental_period: 'term', starts_at: '2026-08-01', ends_at: '2026-12-31', minimum_term_months: 4,
  advance_rent: 8000, deposit_amount: 2000, tenant_type: 'student', tenant_code: '69000001',
  title: 'นางสาว', first_name: 'ตัวอย่าง', last_name: 'นักศึกษา', national_id: '1-1000-00000-00-1',
  current_address: '295 ถนนนครราชสีมา เขตดุสิต กรุงเทพมหานคร 10300',
  faculty: 'คณะครุศาสตร์', program: 'ศึกษาศาสตรบัณฑิต', major: 'การศึกษาปฐมวัย',
  phone: '081-234-5678', email: 'sample@university.ac.th', line_id: 'sample.student',
  guardian_name: 'ผู้ปกครอง ตัวอย่าง', guardian_phone: '089-000-0000', guardian_email: 'parent@example.test',
  building_name: 'อาคารปราโมทย์ 1', room_no: '101', bed_no: 'A',
}, { evidenceId:'sample-evidence-001',displayName:'ตัวอย่าง นักศึกษา',username:'69000001',method:'Local username/password',signedAt:'2026-07-27T10:30:00.000Z' })
await writeFile(resolve(outputDir, 'sample-signed-dormitory-contract.pdf'), pdf)
console.log(`Generated ${pdf.length} bytes`)
