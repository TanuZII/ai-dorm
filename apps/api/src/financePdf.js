import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'node:url'

const thaiFont = fileURLToPath(new URL('../assets/fonts/NotoSansThai.ttf', import.meta.url))

export function createInvoicePdf(invoice, items) {
  return createDocument({
    title: 'ใบแจ้งหนี้', number: invoice.invoice_no,
    person: `${invoice.tenant_code} · ${invoice.first_name} ${invoice.last_name}`,
    dateLabel: 'กำหนดชำระ', date: invoice.due_date,
    rows: items.map(item => [item.description, item.quantity, item.unit_price, item.amount]),
    total: invoice.total,
    note: 'กรุณาตรวจสอบเลขที่ใบแจ้งหนี้และยอดเงินก่อนชำระทุกครั้ง',
  })
}

export function createReceiptPdf(receipt, items) {
  return createDocument({
    title: 'ใบเสร็จรับเงิน', number: receipt.receipt_no,
    person: `${receipt.tenant_code} · ${receipt.first_name} ${receipt.last_name}`,
    dateLabel: 'วันที่รับชำระ', date: receipt.paid_at,
    rows: items.map(item => [item.description, item.quantity, item.unit_price, Number((item.amount * receipt.amount / receipt.invoice_total).toFixed(2))]),
    total: receipt.amount,
    note: `ช่องทางรับเงิน: ${methodLabel(receipt.method)}${receipt.reference_no ? ` · อ้างอิง ${receipt.reference_no}` : ''}`,
  })
}

function createDocument({ title, number, person, dateLabel, date, rows, total, note }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 54, right: 54 }, info: { Title: `${title} ${number}`, Author: 'Campus Nest - Suan Dusit University' } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.registerFont('Thai', thaiFont).font('Thai')
    doc.fillColor('#173653').fontSize(20).text(title, { align: 'center' })
    doc.fillColor('#6c7f8e').fontSize(9).text('โครงการอาคารที่พัก มหาวิทยาลัยสวนดุสิต', { align: 'center' })
    doc.moveDown(1.3).fillColor('#173653').fontSize(11).text(`เลขที่ ${number}`)
    doc.fillColor('#52697b').fontSize(10).text(`ผู้เช่า ${person}`)
    doc.text(`${dateLabel} ${formatDate(date)}`)
    doc.moveDown(.8)
    drawRule(doc)
    const y = doc.y + 8
    doc.fillColor('#6f8291').fontSize(9).text('รายการ', 54, y).text('จำนวน', 310, y, { width: 60, align: 'right' }).text('ราคา/หน่วย', 375, y, { width: 75, align: 'right' }).text('จำนวนเงิน', 455, y, { width: 86, align: 'right' })
    doc.y = y + 24; drawRule(doc)
    for (const [description, quantity, unitPrice, amount] of rows) {
      const rowY = doc.y + 7
      doc.fillColor('#263f56').fontSize(10).text(description, 54, rowY, { width: 245 }).text(money(quantity), 310, rowY, { width: 60, align: 'right' }).text(money(unitPrice), 375, rowY, { width: 75, align: 'right' }).text(money(amount), 455, rowY, { width: 86, align: 'right' })
      doc.y = Math.max(doc.y, rowY + 24); drawRule(doc)
    }
    doc.moveDown(.6).fillColor('#173653').fontSize(12).text(`รวมทั้งสิ้น ${money(total)} บาท`, { align: 'right' })
    doc.moveDown(1.2).fillColor('#6d7f8c').fontSize(9).text(note, { align: 'center' })
    doc.text(`สร้างเอกสารเมื่อ ${new Date().toISOString()}`, { align: 'center' })
    doc.end()
  })
}

function drawRule(doc) { doc.moveTo(54, doc.y).lineTo(541, doc.y).strokeColor('#d9e2e8').stroke() }
function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(value) { return value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: value.includes?.('T') ? 'short' : undefined }) : '-' }
function methodLabel(value) { return ({ cash:'เงินสด', transfer:'เงินโอน', bank_file:'ไฟล์ธนาคาร', online_account:'บัญชีออนไลน์' })[value] || value }
