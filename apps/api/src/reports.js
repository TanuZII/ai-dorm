import XlsxPopulate from 'xlsx-populate'

const moneyColumn = type => ({ type: 'money', ...type })
const columns = {
  debtors: [
    { key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้เช่า' },
    { key: 'tenant_type', label: 'ประเภทผู้เช่า' }, { key: 'invoice_no', label: 'เลขที่ใบแจ้งหนี้' },
    { key: 'due_date', label: 'วันครบกำหนด', type: 'date' }, moneyColumn({ key: 'total', label: 'ยอดตั้งหนี้' }),
    moneyColumn({ key: 'balance', label: 'ยอดคงเหลือ' }), { key: 'age_days', label: 'อายุหนี้ (วัน)', type: 'number' },
    { key: 'age_bucket', label: 'ช่วงอายุหนี้' },
  ],
  debtorsMonthly: [
    { key: 'period', label: 'เดือนครบกำหนด' }, { key: 'debtor_count', label: 'จำนวนลูกหนี้', type: 'number' },
    { key: 'invoice_count', label: 'จำนวนใบแจ้งหนี้', type: 'number' }, moneyColumn({ key: 'balance', label: 'ยอดคงเหลือ' }),
  ],
  debtAge: [
    { key: 'age_bucket', label: 'ช่วงอายุหนี้' }, { key: 'debtor_count', label: 'จำนวนลูกหนี้', type: 'number' },
    { key: 'invoice_count', label: 'จำนวนใบแจ้งหนี้', type: 'number' }, moneyColumn({ key: 'balance', label: 'ยอดคงเหลือ' }),
  ],
  room: [{ key: 'period', label: 'งวดรับชำระ' }, { key: 'transaction_count', label: 'จำนวนรายการ', type: 'number' }, moneyColumn({ key: 'amount', label: 'ค่าเช่าห้องพัก' })],
  utilities: [{ key: 'period', label: 'งวดรับชำระ' }, moneyColumn({ key: 'water', label: 'ค่าน้ำประปา' }), moneyColumn({ key: 'electricity', label: 'ค่าไฟฟ้า' }), moneyColumn({ key: 'amount', label: 'รวมสาธารณูปโภค' })],
  simplePayment: [{ key: 'period', label: 'งวดรับชำระ' }, { key: 'transaction_count', label: 'จำนวนรายการ', type: 'number' }, moneyColumn({ key: 'amount', label: 'จำนวนเงิน' })],
  depositReceived: [{ key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้จ่ายเงินประกัน' }, moneyColumn({ key: 'amount', label: 'รับเงินประกัน' })],
  depositRefunded: [{ key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้รับคืนเงินประกัน' }, { key: 'checkout_date', label: 'วันที่คืน', type: 'date' }, moneyColumn({ key: 'amount', label: 'คืนเงินประกัน' })],
  depositBalance: [{ key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้เช่า' }, moneyColumn({ key: 'received', label: 'รับเงินประกัน' }), moneyColumn({ key: 'refunded', label: 'คืนเงินประกัน' }), moneyColumn({ key: 'balance', label: 'คงเหลือ' })],
  remittance: [{ key: 'revenue_group', label: 'กลุ่มรายได้' }, { key: 'revenue_type', label: 'ประเภทรายได้' }, moneyColumn({ key: 'full_amount', label: 'นำส่งเต็ม 100%' }), moneyColumn({ key: 'reclaim_amount', label: 'ขอเบิกกลับ' }), moneyColumn({ key: 'university_amount', label: 'นำส่งมหาวิทยาลัย' })],
}

export const reportCatalog = [
  { type: 'debtors', group: 'ลูกหนี้', title: 'ลูกหนี้คงเหลือ แยกตามรายชื่อ / ใบแจ้งหนี้', columns: columns.debtors },
  { type: 'debtors-monthly', group: 'ลูกหนี้', title: 'ลูกหนี้คงเหลือแต่ละเดือน', columns: columns.debtorsMonthly },
  { type: 'debt-age', group: 'ลูกหนี้', title: 'อายุลูกหนี้', columns: columns.debtAge },
  { type: 'room-rent', group: 'การรับชำระ', title: 'การรับชำระค่าเช่าห้องพัก', columns: columns.room, supportsPeriod: true },
  { type: 'utilities', group: 'การรับชำระ', title: 'การรับชำระค่าน้ำประปาและค่าไฟฟ้า', columns: columns.utilities, supportsPeriod: true },
  { type: 'late-fees', group: 'การรับชำระ', title: 'การรับชำระค่าปรับชำระล่าช้า', columns: columns.simplePayment, supportsPeriod: true },
  { type: 'other-payments', group: 'การรับชำระ', title: 'การรับชำระเงินอื่น ๆ', columns: columns.simplePayment, supportsPeriod: true },
  { type: 'deposits-received', group: 'เงินประกัน', title: 'รายชื่อผู้จ่ายเงินประกันห้องพัก', columns: columns.depositReceived },
  { type: 'deposits-refunded', group: 'เงินประกัน', title: 'รายชื่อผู้รับคืนเงินประกันห้องพัก', columns: columns.depositRefunded },
  { type: 'deposits-balance', group: 'เงินประกัน', title: 'เงินประกันห้องพักคงเหลือ', columns: columns.depositBalance },
  { type: 'revenue-remittance', group: 'นำส่งรายได้', title: 'รายการนำส่งเงินรายได้เข้ามหาวิทยาลัย', columns: columns.remittance },
]

const catalogByType = new Map(reportCatalog.map(report => [report.type, report]))
const ageBucketSql = `CASE WHEN julianday('now')<=julianday(i.due_date) THEN 'ยังไม่ครบกำหนด' WHEN julianday('now')-julianday(i.due_date)<=30 THEN '1–30 วัน' WHEN julianday('now')-julianday(i.due_date)<=60 THEN '31–60 วัน' WHEN julianday('now')-julianday(i.due_date)<=90 THEN '61–90 วัน' ELSE 'มากกว่า 90 วัน' END`
const ageBucketOrderSql = `CASE ${ageBucketSql} WHEN 'ยังไม่ครบกำหนด' THEN 0 WHEN '1–30 วัน' THEN 1 WHEN '31–60 วัน' THEN 2 WHEN '61–90 วัน' THEN 3 ELSE 4 END`

function periodSql(period) {
  return ({ daily: "strftime('%Y-%m-%d',p.paid_at)", monthly: "strftime('%Y-%m',p.paid_at)", term: "COALESCE((SELECT academic_year||' / ภาค '||term FROM academic_terms WHERE date(p.paid_at) BETWEEN starts_at AND ends_at ORDER BY id DESC LIMIT 1),'ไม่ระบุภาคเรียน')", yearly: "strftime('%Y',p.paid_at)" })[period]
}

function dateRange(query) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : '0000-01-01'
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : '9999-12-31'
  if (from > to) throw Object.assign(new Error('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด'), { status: 400, code: 'INVALID_DATE_RANGE' })
  return { from, to }
}

function paidRows(db, itemTypes, query, extraSelect = 'SUM(ii.amount*(p.amount/i.total)) amount') {
  const { from, to } = dateRange(query)
  const period = ['daily', 'monthly', 'term', 'yearly'].includes(query.period) ? query.period : 'monthly'
  const placeholders = itemTypes.map(() => '?').join(',')
  return db.prepare(`SELECT ${periodSql(period)} period,COUNT(DISTINCT p.id) transaction_count,${extraSelect}
    FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id
    WHERE r.status='issued' AND date(p.paid_at) BETWEEN ? AND ? AND ii.item_type IN (${placeholders})
    GROUP BY period ORDER BY period`).all(from, to, ...itemTypes)
}

function depositReceivedRows(db, query) {
  const { from, to } = dateRange(query)
  return db.prepare(`SELECT t.tenant_code,t.first_name||' '||t.last_name tenant_name,ROUND(SUM(ii.amount*(p.amount/i.total)),2) amount
    FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id JOIN tenants t ON t.id=i.tenant_id
    WHERE r.status='issued' AND ii.item_type='deposit' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY t.id ORDER BY t.tenant_code`).all(from, to)
}

const remittanceRules = {
  room: ['รายได้หอพัก', 'ค่าห้องพัก', .8, .2], late_fee: ['รายได้หอพัก', 'ค่าปรับชำระล่าช้า', .8, .2], other: ['รายได้หอพัก', 'ค่าอื่น ๆ', .8, .2],
  water: ['รายได้หอพัก', 'ค่าน้ำประปา', 0, 1], electricity: ['รายได้หอพัก', 'ค่าไฟฟ้า', 0, 1],
  printing_room: ['ศูนย์ความเป็นเลิศด้านการพิมพ์และบรรจุภัณฑ์', 'ค่าห้องพัก', .8, .2],
  food_beverage: ['ศูนย์ความเป็นเลิศด้านการพิมพ์และบรรจุภัณฑ์', 'ค่าอาหารและเครื่องดื่ม', 1, 0],
  health_field: ['ศูนย์บริการสุขภาพ', 'ค่าบริการสนาม', .8, .2], swimming_instruction: ['ศูนย์บริการสุขภาพ', 'ค่าสอนว่ายน้ำ', .8, .2],
  health_membership: ['ศูนย์บริการสุขภาพ', 'ค่าสมาชิกรายปี', .8, .2], area_rent: ['ศูนย์บริการสุขภาพ', 'ค่าเช่าพื้นที่', 0, 1],
}

function remittanceRows(db, query) {
  const { from, to } = dateRange(query)
  const paid = db.prepare(`SELECT ii.item_type,ROUND(SUM(ii.amount*(p.amount/i.total)),2) amount FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id WHERE r.status='issued' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY ii.item_type`).all(from, to)
  return paid.filter(row => remittanceRules[row.item_type]).map(row => {
    const [revenue_group, revenue_type, reclaimRate, universityRate] = remittanceRules[row.item_type]
    return { revenue_group, revenue_type, full_amount: row.amount, reclaim_amount: Number((row.amount * reclaimRate).toFixed(2)), university_amount: Number((row.amount * universityRate).toFixed(2)) }
  })
}

export function buildReport(db, query = {}) {
  const definition = catalogByType.get(query.type)
  if (!definition) throw Object.assign(new Error('ไม่พบประเภทรายงาน'), { status: 400, code: 'INVALID_REPORT_TYPE' })
  let rows
  if (query.type === 'debtors') rows = db.prepare(`SELECT t.tenant_code,t.first_name||' '||t.last_name tenant_name,t.tenant_type,i.invoice_no,i.due_date,i.total,i.balance,MAX(0,CAST(julianday('now')-julianday(i.due_date) AS INTEGER)) age_days,${ageBucketSql} age_bucket FROM invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.balance>0 AND i.status!='cancelled' ORDER BY age_days DESC,i.invoice_no`).all()
  else if (query.type === 'debtors-monthly') rows = db.prepare(`SELECT strftime('%Y-%m',i.due_date) period,COUNT(DISTINCT i.tenant_id) debtor_count,COUNT(*) invoice_count,ROUND(SUM(i.balance),2) balance FROM invoices i WHERE i.balance>0 AND i.status!='cancelled' GROUP BY period ORDER BY period`).all()
  else if (query.type === 'debt-age') rows = db.prepare(`SELECT ${ageBucketSql} age_bucket,COUNT(DISTINCT i.tenant_id) debtor_count,COUNT(*) invoice_count,ROUND(SUM(i.balance),2) balance FROM invoices i WHERE i.balance>0 AND i.status!='cancelled' GROUP BY age_bucket ORDER BY ${ageBucketOrderSql}`).all()
  else if (query.type === 'room-rent') rows = paidRows(db, ['room'], query)
  else if (query.type === 'utilities') rows = paidRows(db, ['water', 'electricity'], query, `ROUND(SUM(CASE WHEN ii.item_type='water' THEN ii.amount*(p.amount/i.total) ELSE 0 END),2) water,ROUND(SUM(CASE WHEN ii.item_type='electricity' THEN ii.amount*(p.amount/i.total) ELSE 0 END),2) electricity,ROUND(SUM(ii.amount*(p.amount/i.total)),2) amount`)
  else if (query.type === 'late-fees') rows = paidRows(db, ['late_fee'], query)
  else if (query.type === 'other-payments') rows = paidRows(db, ['other'], query)
  else if (query.type === 'deposits-received') rows = depositReceivedRows(db, query)
  else if (query.type === 'deposits-refunded') { const { from, to } = dateRange(query); rows = db.prepare(`SELECT t.tenant_code,t.first_name||' '||t.last_name tenant_name,c.checkout_date,c.refund_amount amount FROM checkouts c JOIN tenants t ON t.id=c.tenant_id WHERE c.refund_amount>0 AND date(c.checkout_date) BETWEEN ? AND ? ORDER BY c.checkout_date,t.tenant_code`).all(from, to) }
  else if (query.type === 'deposits-balance') { const { from, to } = dateRange(query); rows = db.prepare(`WITH received AS (SELECT i.tenant_id,SUM(ii.amount*(p.amount/i.total)) amount FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id WHERE r.status='issued' AND ii.item_type='deposit' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY i.tenant_id), refunded AS (SELECT tenant_id,SUM(refund_amount) amount FROM checkouts WHERE refund_amount>0 AND date(checkout_date) BETWEEN ? AND ? GROUP BY tenant_id) SELECT t.tenant_code,t.first_name||' '||t.last_name tenant_name,ROUND(COALESCE(received.amount,0),2) received,ROUND(COALESCE(refunded.amount,0),2) refunded,ROUND(COALESCE(received.amount,0)-COALESCE(refunded.amount,0),2) balance FROM tenants t LEFT JOIN received ON received.tenant_id=t.id LEFT JOIN refunded ON refunded.tenant_id=t.id WHERE COALESCE(received.amount,0)>0 OR COALESCE(refunded.amount,0)>0 ORDER BY t.tenant_code`).all(from, to, from, to) }
  else rows = remittanceRows(db, query)
  rows = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? Number(value.toFixed(2)) : value])))
  const totals = Object.fromEntries(definition.columns.filter(column => ['money', 'number'].includes(column.type)).map(column => [column.key, rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0)]))
  return { type: definition.type, title: definition.title, columns: definition.columns, rows, totals, generatedAt: new Date().toISOString(), filters: { ...dateRange(query), period: query.period || 'monthly' } }
}

export async function createReportXlsx(report) {
  const workbook = await XlsxPopulate.fromBlankAsync()
  const sheet = workbook.sheet(0).name('รายงาน')
  const lastColumn = excelColumnName(Math.max(report.columns.length, 1))
  sheet.range(`A1:${lastColumn}1`).merged(true)
  sheet.cell('A1').value(report.title).style({ fontFamily: 'Tahoma', fontSize: 18, bold: true, fontColor: '16324F' })
  sheet.cell('A2').value(`ช่วงข้อมูล ${report.filters.from} ถึง ${report.filters.to}`).style({ fontFamily: 'Tahoma', fontSize: 10, fontColor: '526B7C' })
  sheet.cell('A3').value(`สร้างเมื่อ ${new Date(report.generatedAt).toLocaleString('th-TH')}`).style({ fontFamily: 'Tahoma', fontSize: 10, fontColor: '80909B' })
  const headerRow = report.columns.map(column => column.label)
  const tableRows = report.rows.map(row => report.columns.map(column => column.type === 'date' && row[column.key] ? new Date(`${row[column.key]}T00:00:00`) : row[column.key] ?? ''))
  sheet.range(`A5:${lastColumn}5`).value([headerRow]).style({ fill: '0F766E', fontColor: 'FFFFFF', bold: true, fontFamily: 'Tahoma', fontSize: 10, verticalAlignment: 'center' })
  if (tableRows.length) sheet.range(`A6:${lastColumn}${tableRows.length + 5}`).value(tableRows).style({ fontFamily: 'Tahoma', fontSize: 10, verticalAlignment: 'center' })
  sheet.range(`A5:${lastColumn}${Math.max(5, tableRows.length + 5)}`).autoFilter()
  sheet.freezePanes(0, 5)
  sheet.row(5).height(24)
  report.columns.forEach((column, index) => {
    const letter = excelColumnName(index + 1)
    sheet.column(letter).width(Math.min(34, Math.max(14, column.label.length + 6, ...report.rows.slice(0, 200).map(row => String(row[column.key] ?? '').length + 2))))
    if (tableRows.length && column.type === 'money') sheet.range(`${letter}6:${letter}${tableRows.length + 5}`).style({ numberFormat: '#,##0.00;[Red](#,##0.00);-' })
    if (tableRows.length && column.type === 'number') sheet.range(`${letter}6:${letter}${tableRows.length + 5}`).style({ numberFormat: '#,##0' })
    if (tableRows.length && column.type === 'date') sheet.range(`${letter}6:${letter}${tableRows.length + 5}`).style({ numberFormat: 'yyyy-mm-dd' })
  })
  return workbook.outputAsync()
}

function excelColumnName(index) {
  let name = ''
  while (index > 0) { index -= 1; name = String.fromCharCode(65 + (index % 26)) + name; index = Math.floor(index / 26) }
  return name
}
