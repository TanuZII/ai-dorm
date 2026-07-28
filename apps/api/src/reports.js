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
  depositReceived: [{ key: 'period', label: 'งวดรับชำระ' }, { key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้จ่ายเงินประกัน' }, moneyColumn({ key: 'amount', label: 'รับเงินประกัน' })],
  depositRefunded: [{ key: 'period', label: 'งวดคืนเงิน' }, { key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้รับคืนเงินประกัน' }, moneyColumn({ key: 'amount', label: 'คืนเงินประกัน' })],
  depositBalance: [{ key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้เช่า' }, moneyColumn({ key: 'received', label: 'รับเงินประกัน' }), moneyColumn({ key: 'refunded', label: 'คืนเงินประกัน' }), moneyColumn({ key: 'balance', label: 'คงเหลือ' })],
  remittance: [{ key: 'policy_code', label: 'รหัสนโยบาย' }, { key: 'revenue_group', label: 'กลุ่มรายได้' }, { key: 'revenue_type', label: 'ประเภทรายได้' }, { key:'reclaim_percent',label:'ขอเบิกกลับ (%)',type:'percentage' }, { key:'university_percent',label:'นำส่ง (%)',type:'percentage' }, moneyColumn({ key: 'full_amount', label: 'ยอดรับจริง' }), moneyColumn({ key: 'reclaim_amount', label: 'ขอเบิกกลับ' }), moneyColumn({ key: 'university_amount', label: 'นำส่งมหาวิทยาลัย' })],
  receiptIssuer: [{ key: 'issuer', label: 'ผู้ออกใบเสร็จ' }, { key: 'receipt_count', label: 'จำนวนใบเสร็จ', type: 'number' }, moneyColumn({ key: 'amount', label: 'ยอดรับชำระ' })],
  dailyPayment: [{ key: 'payment_date', label: 'วันที่รับชำระ', type: 'date' }, { key: 'transaction_count', label: 'จำนวนรายการ', type: 'number' }, { key: 'receipt_count', label: 'จำนวนใบเสร็จ', type: 'number' }, moneyColumn({ key: 'amount', label: 'ยอดรับชำระ' })],
  dailyRemittance: [{ key: 'remittance_no', label: 'เลขที่ใบนำส่ง' }, { key: 'remittance_date', label: 'วันที่นำส่ง', type: 'date' }, moneyColumn({ key: 'revenue_amount', label: 'รายได้' }), moneyColumn({ key: 'deposit_amount', label: 'เงินประกัน' }), moneyColumn({ key: 'cash_amount', label: 'เงินสด' }), moneyColumn({ key: 'transfer_amount', label: 'เงินโอน' }), { key: 'status', label: 'สถานะ' }, { key: 'university_receipt_no', label: 'เลขใบเสร็จมหาวิทยาลัย' }],
  receiptRegister: [{ key: 'receipt_no', label: 'เลขที่ใบเสร็จ' }, { key: 'payment_date', label: 'วันที่รับชำระ', type: 'date' }, { key: 'invoice_no', label: 'เลขที่ใบแจ้งหนี้' }, { key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้ชำระ' }, { key: 'method', label: 'ช่องทาง' }, { key: 'reference_no', label: 'เลขอ้างอิง' }, { key: 'issuer', label: 'ผู้ออกใบเสร็จ' }, moneyColumn({ key: 'amount', label: 'จำนวนเงิน' }), { key: 'status', label: 'สถานะ' }],
  tenantPayment: [{ key: 'tenant_code', label: 'รหัสผู้เช่า' }, { key: 'tenant_name', label: 'ชื่อผู้เช่า' }, { key: 'tenant_type', label: 'ประเภทผู้เช่า' }, moneyColumn({ key: 'billed', label: 'ยอดตั้งหนี้' }), moneyColumn({ key: 'paid', label: 'ยอดชำระ' }), moneyColumn({ key: 'outstanding', label: 'ยอดค้างชำระ' }), { key: 'payment_status', label: 'สถานะการชำระ' }],
}

export const reportCatalog = [
  { type: 'receipts-by-issuer', group: 'การเงิน 3.11', title: 'การรับเงินตามผู้ออกใบเสร็จ', columns: columns.receiptIssuer },
  { type: 'daily-payment-summary', group: 'การเงิน 3.11', title: 'สรุปการชำระเงินประจำวัน', columns: columns.dailyPayment },
  { type: 'daily-remittance-register', group: 'การเงิน 3.11', title: 'ใบนำส่งเงินประจำวัน', columns: columns.dailyRemittance },
  { type: 'receipt-register', group: 'การเงิน 3.11', title: 'การรับเงินจำแนกตามเลขที่ใบเสร็จ', columns: columns.receiptRegister },
  { type: 'student-staff-payment-status', group: 'การเงิน 3.11', title: 'การชำระและค้างชำระของนักศึกษา / บุคลากร', columns: columns.tenantPayment },
  { type: 'debtors', group: 'ลูกหนี้', title: 'ลูกหนี้คงเหลือ แยกตามรายชื่อ / ใบแจ้งหนี้', columns: columns.debtors },
  { type: 'debtors-monthly', group: 'ลูกหนี้', title: 'ลูกหนี้คงเหลือแต่ละเดือน', columns: columns.debtorsMonthly },
  { type: 'debt-age', group: 'ลูกหนี้', title: 'อายุลูกหนี้', columns: columns.debtAge },
  { type: 'room-rent', group: 'การรับชำระ', title: 'การรับชำระค่าเช่าห้องพัก', columns: columns.room, supportsPeriod: true },
  { type: 'utilities', group: 'การรับชำระ', title: 'การรับชำระค่าน้ำประปาและค่าไฟฟ้า', columns: columns.utilities, supportsPeriod: true },
  { type: 'late-fees', group: 'การรับชำระ', title: 'การรับชำระค่าปรับชำระล่าช้า', columns: columns.simplePayment, supportsPeriod: true },
  { type: 'other-payments', group: 'การรับชำระ', title: 'การรับชำระเงินอื่น ๆ', columns: columns.simplePayment, supportsPeriod: true },
  { type: 'deposits-received', group: 'เงินประกัน', title: 'รายชื่อผู้จ่ายเงินประกันห้องพัก', columns: columns.depositReceived, supportsPeriod:true },
  { type: 'deposits-refunded', group: 'เงินประกัน', title: 'รายชื่อผู้รับคืนเงินประกันห้องพัก', columns: columns.depositRefunded, supportsPeriod:true },
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
  const period = ['daily','monthly','term','yearly'].includes(query.period) ? query.period : 'monthly'
  return db.prepare(`SELECT ${periodSql(period)} period,t.tenant_code,t.first_name||' '||t.last_name tenant_name,ROUND(SUM(ii.amount*(p.amount/i.total)),2) amount
    FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id JOIN tenants t ON t.id=i.tenant_id
    WHERE r.status='issued' AND ii.item_type='deposit' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY period,t.id ORDER BY period,t.tenant_code`).all(from, to)
}

function remittanceRows(db, query) {
  const { from, to } = dateRange(query)
  const paid = db.prepare(`SELECT ii.item_type,rp.code policy_code,rp.revenue_group,rp.revenue_name revenue_type,rp.reclaim_rate,rp.university_rate,ROUND(SUM(ii.amount*(p.amount/i.total)),2) amount
    FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id
    LEFT JOIN revenue_share_policies rp ON rp.id=(SELECT policy.id FROM revenue_share_policies policy WHERE policy.item_type=ii.item_type AND date(p.paid_at)>=date(policy.starts_at) AND (policy.ends_at IS NULL OR date(p.paid_at)<=date(policy.ends_at)) ORDER BY policy.starts_at DESC,policy.id DESC LIMIT 1)
    WHERE r.status='issued' AND ii.item_type!='deposit' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY ii.item_type,rp.id ORDER BY rp.revenue_group,rp.revenue_name`).all(from, to)
  const missing=paid.find(row=>!row.policy_code);if(missing)throw Object.assign(new Error(`ยังไม่ได้กำหนดสัดส่วนแบ่งรายได้สำหรับ ${missing.item_type}`),{status:409,code:'REVENUE_POLICY_NOT_CONFIGURED'})
  return paid.map(row => ({ policy_code:row.policy_code,revenue_group:row.revenue_group,revenue_type:row.revenue_type,reclaim_percent:Number((row.reclaim_rate*100).toFixed(2)),university_percent:Number((row.university_rate*100).toFixed(2)),full_amount:row.amount,reclaim_amount:Number((row.amount*row.reclaim_rate).toFixed(2)),university_amount:Number((row.amount*row.university_rate).toFixed(2)) }))
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
  else if (query.type === 'other-payments') rows = paidRows(db, ['damage','other','printing_room','food_beverage','health_field','swimming_instruction','health_membership','area_rent'], query)
  else if (query.type === 'deposits-received') rows = depositReceivedRows(db, query)
  else if (query.type === 'deposits-refunded') { const { from, to } = dateRange(query),period=['daily','monthly','term','yearly'].includes(query.period)?query.period:'monthly',periodExpression=period==='daily'?"strftime('%Y-%m-%d',c.checkout_date)":period==='yearly'?"strftime('%Y',c.checkout_date)":period==='term'?"COALESCE((SELECT academic_year||' / ภาค '||term FROM academic_terms WHERE date(c.checkout_date) BETWEEN starts_at AND ends_at ORDER BY id DESC LIMIT 1),'ไม่ระบุภาคเรียน')":"strftime('%Y-%m',c.checkout_date)"; rows = db.prepare(`SELECT ${periodExpression} period,t.tenant_code,t.first_name||' '||t.last_name tenant_name,ROUND(SUM(c.refund_amount),2) amount FROM checkouts c JOIN tenants t ON t.id=c.tenant_id WHERE c.refund_amount>0 AND date(c.checkout_date) BETWEEN ? AND ? GROUP BY period,t.id ORDER BY period,t.tenant_code`).all(from, to) }
  else if (query.type === 'deposits-balance') { const { to } = dateRange(query); rows = db.prepare(`WITH received AS (SELECT i.tenant_id,SUM(ii.amount*(p.amount/i.total)) amount FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id WHERE r.status='issued' AND ii.item_type='deposit' AND date(p.paid_at)<=? GROUP BY i.tenant_id), refunded AS (SELECT tenant_id,SUM(refund_amount) amount FROM checkouts WHERE refund_amount>0 AND date(checkout_date)<=? GROUP BY tenant_id) SELECT t.tenant_code,t.first_name||' '||t.last_name tenant_name,ROUND(COALESCE(received.amount,0),2) received,ROUND(COALESCE(refunded.amount,0),2) refunded,ROUND(COALESCE(received.amount,0)-COALESCE(refunded.amount,0),2) balance FROM tenants t LEFT JOIN received ON received.tenant_id=t.id LEFT JOIN refunded ON refunded.tenant_id=t.id WHERE COALESCE(received.amount,0)>0 OR COALESCE(refunded.amount,0)>0 ORDER BY t.tenant_code`).all(to, to) }
  else if (query.type === 'receipts-by-issuer') { const { from, to } = dateRange(query); rows = db.prepare(`SELECT u.display_name issuer,COUNT(*) receipt_count,ROUND(SUM(p.amount),2) amount FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN users u ON u.id=r.issued_by WHERE r.status='issued' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY u.id ORDER BY u.display_name`).all(from, to) }
  else if (query.type === 'daily-payment-summary') { const { from, to } = dateRange(query); rows = db.prepare(`SELECT date(p.paid_at) payment_date,COUNT(DISTINCT p.id) transaction_count,COUNT(DISTINCT r.id) receipt_count,ROUND(SUM(p.amount),2) amount FROM payments p JOIN receipts r ON r.payment_id=p.id WHERE r.status='issued' AND date(p.paid_at) BETWEEN ? AND ? GROUP BY payment_date ORDER BY payment_date`).all(from, to) }
  else if (query.type === 'daily-remittance-register') { const { from, to } = dateRange(query); rows = db.prepare(`SELECT remittance_no,remittance_date,revenue_amount,deposit_amount,cash_amount,transfer_amount,status,university_receipt_no FROM remittances WHERE date(remittance_date) BETWEEN ? AND ? ORDER BY remittance_date,remittance_no`).all(from, to) }
  else if (query.type === 'receipt-register') { const { from, to } = dateRange(query); rows = db.prepare(`SELECT r.receipt_no,date(p.paid_at) payment_date,i.invoice_no,t.tenant_code,t.first_name||' '||t.last_name tenant_name,p.method,p.reference_no,u.display_name issuer,p.amount,r.status FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN tenants t ON t.id=i.tenant_id JOIN users u ON u.id=r.issued_by WHERE date(p.paid_at) BETWEEN ? AND ? ORDER BY r.receipt_no`).all(from, to) }
  else if (query.type === 'student-staff-payment-status') { const { from, to } = dateRange(query); rows = db.prepare(`SELECT t.tenant_code,t.first_name||' '||t.last_name tenant_name,t.tenant_type,ROUND(SUM(i.total),2) billed,ROUND(SUM(i.total-i.balance),2) paid,ROUND(SUM(i.balance),2) outstanding,CASE WHEN SUM(i.balance)=0 THEN 'ชำระแล้ว' WHEN SUM(i.total-i.balance)>0 THEN 'ชำระบางส่วน' ELSE 'ค้างชำระ' END payment_status FROM invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.status!='cancelled' AND t.tenant_type IN ('student','staff') AND date(i.due_date) BETWEEN ? AND ? GROUP BY t.id ORDER BY t.tenant_code`).all(from, to) }
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
    if (tableRows.length && column.type === 'percentage') sheet.range(`${letter}6:${letter}${tableRows.length + 5}`).style({ numberFormat: '0.00' })
    if (tableRows.length && column.type === 'date') sheet.range(`${letter}6:${letter}${tableRows.length + 5}`).style({ numberFormat: 'yyyy-mm-dd' })
  })
  if(tableRows.length){const totalRow=tableRows.length+6;sheet.cell(`A${totalRow}`).value('รวม').style({bold:true,fontFamily:'Tahoma'});report.columns.forEach((column,index)=>{if(['money','number'].includes(column.type)){const letter=excelColumnName(index+1);sheet.cell(`${letter}${totalRow}`).value(report.totals[column.key]||0).style({bold:true,fontFamily:'Tahoma',numberFormat:column.type==='money'?'#,##0.00;[Red](#,##0.00);-':'#,##0'})}});sheet.range(`A${totalRow}:${lastColumn}${totalRow}`).style({fill:'E8F5F1',fontColor:'0F5F57'})}
  return workbook.outputAsync()
}

function excelColumnName(index) {
  let name = ''
  while (index > 0) { index -= 1; name = String.fromCharCode(65 + (index % 26)) + name; index = Math.floor(index / 26) }
  return name
}
