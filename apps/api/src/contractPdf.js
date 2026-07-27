import PDFDocument from 'pdfkit'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const thaiFont = fileURLToPath(new URL('../assets/fonts/NotoSansThai.ttf', import.meta.url))

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function createContractPdf(contract, signature = null) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 54, right: 54 }, info: { Title: `สัญญาเช่าห้องพัก ${contract.contract_no}`, Author: 'Campus Nest - Suan Dusit University' } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.registerFont('Thai', thaiFont).font('Thai')

    const line = () => doc.moveTo(54, doc.y).lineTo(541, doc.y).strokeColor('#d9e2e8').stroke().moveDown(.7)
    const field = (label, value) => { doc.fillColor('#65798a').fontSize(9).text(label); doc.fillColor('#172b45').fontSize(11).text(value || '-', { continued: false }); doc.moveDown(.45) }
    const heading = text => { doc.moveDown(.45).fillColor('#173653').fontSize(13).text(text); doc.moveDown(.25) }

    doc.fillColor('#173653').fontSize(18).text('สัญญาเช่าห้องพักอาศัย', { align: 'center' })
    doc.fillColor('#63798a').fontSize(9).text('โครงการอาคารที่พัก มหาวิทยาลัยสวนดุสิต', { align: 'center' })
    doc.moveDown(.4).fillColor('#172b45').fontSize(10).text(`เลขที่สัญญา ${contract.contract_no}  |  ฉบับที่ ${contract.version || 1}`, { align: 'center' })
    doc.moveDown(.8); line()

    heading('ข้อมูลการทำสัญญา')
    field('วันที่ทำสัญญา', contract.contract_date)
    field('ประเภทและระยะเวลาเช่า', `${periodLabel(contract.rental_period)} ตั้งแต่ ${contract.starts_at} ถึง ${contract.ends_at}`)
    field('ระยะเวลาเช่าขั้นต่ำ', `${contract.minimum_term_months || 1} เดือน`)
    field('ค่าเช่าจ่ายล่วงหน้า', `${money(contract.advance_rent)} บาท`)

    heading('ข้อมูลผู้เช่าห้องพัก')
    field('ชื่อ-นามสกุล', `${contract.title || ''}${contract.first_name} ${contract.last_name}`)
    field('ประเภทผู้เช่า / รหัส', `${tenantTypeLabel(contract.tenant_type)} / ${contract.tenant_code}`)
    field('เลขบัตรประชาชน', contract.national_id)
    field('ที่อยู่', contract.current_address)
    field('คณะ / หลักสูตร / สาขาวิชา หรือหน่วยงาน', [contract.faculty, contract.program, contract.major, contract.organization].filter(Boolean).join(' / '))
    field('โทรศัพท์ / อีเมล / LINE ID', [contract.phone, contract.email, contract.line_id].filter(Boolean).join(' / '))
    field('ผู้ปกครองหรือบุคคลติดต่อฉุกเฉิน', contactText(contract))

    heading('ข้อมูลห้องพักและข้อตกลงทางการเงิน')
    field('อาคาร / ห้อง / เตียง', `${contract.building_name || '-'} / ${contract.room_no || '-'} / ${contract.bed_no || '-'}`)
    field('เงินประกันห้องพัก', `${money(contract.deposit_amount)} บาท`)
    doc.fillColor('#334e63').fontSize(10).text('ผู้เช่ารับรองว่าข้อมูลข้างต้นถูกต้อง ยินยอมปฏิบัติตามระเบียบของโครงการอาคารที่พัก และชำระค่าเช่า ค่าสาธารณูปโภค ค่าปรับ และค่าเสียหายตามอัตราที่มหาวิทยาลัยกำหนด โดยเงื่อนไขอัตราค่าบริการให้เป็นไปตามนโยบายที่มีผลในช่วงสัญญา', { align: 'justify', lineGap: 4 })

    doc.moveDown(1); line(); heading('การยืนยันและลงนาม')
    if (signature) {
      doc.roundedRect(54, doc.y, 487, 108, 8).fillAndStroke('#eff8f5', '#bfe0d5')
      const y = doc.y + 13
      doc.fillColor('#26715e').fontSize(12).text('ลงนามอิเล็กทรอนิกส์แล้ว', 69, y)
      doc.fillColor('#36566c').fontSize(9).text(`ผู้ลงนาม: ${signature.displayName} (${signature.username})`, 69, y + 25)
      doc.text(`วันเวลา: ${signature.signedAt}`, 69, y + 43)
      doc.text(`วิธียืนยันตัวตน: ${signature.method}`, 69, y + 61)
      doc.text(`รหัสหลักฐาน: ${signature.evidenceId}`, 69, y + 79)
      doc.y = y + 110
    } else {
      doc.fillColor('#65798a').fontSize(10).text('เอกสารฉบับนี้รอผู้เช่ายืนยันข้อมูลและลงนามผ่านระบบ Campus Nest', { align: 'center' })
      doc.moveDown(2).fillColor('#172b45').text('ลงชื่อผู้เช่า .............................................................', { align: 'center' })
    }

    doc.moveDown(1.2).fillColor('#82919d').fontSize(8).text('เอกสารฉบับนี้จัดทำในรูปแบบข้อมูลอิเล็กทรอนิกส์ ระบบจัดเก็บประวัติผู้ดำเนินการ วันเวลา และค่าแฮชของเอกสารเพื่อใช้ตรวจสอบความครบถ้วนย้อนหลัง', { align: 'center' })
    doc.text(`สร้างเอกสารเมื่อ ${new Date().toISOString()}`, { align: 'center' })
    doc.end()
  })
}

function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function periodLabel(value) { return ({ daily:'รายวัน', monthly:'รายเดือน', term:'รายภาคการศึกษา', yearly:'รายปี' })[value] || value || '-' }
function tenantTypeLabel(value) { return ({ student:'นักศึกษา', staff:'บุคลากร', external:'บุคคลภายนอก' })[value] || value }
function contactText(row) {
  if (row.tenant_type === 'student') return [row.guardian_name, row.guardian_phone, row.guardian_email, row.guardian_line_id].filter(Boolean).join(' / ') || '-'
  return [row.emergency_contact_name, row.emergency_contact_phone, row.emergency_contact_relation].filter(Boolean).join(' / ') || '-'
}
