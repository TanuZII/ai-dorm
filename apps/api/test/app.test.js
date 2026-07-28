import test from 'node:test'
import assert from 'node:assert/strict'
import XlsxPopulate from 'xlsx-populate'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'

test('critical dormitory backend flows', async (t) => {
  const db = createDb(':memory:')
  const server = createApp({ db, integrations: { studentDirectory: { lookup: async studentId => ({ studentCode: studentId, title: 'นางสาว', firstName: 'ข้อมูล', lastName: 'จากระบบการศึกษา', nationalId: '1101700000001', email: 'directory@example.test', phone: '0811111111', currentAddress: 'สุพรรณบุรี', faculty: 'คณะครุศาสตร์', program: 'ศึกษาศาสตรบัณฑิต', major: 'การศึกษาปฐมวัย' }) } } }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  let token = ''

  async function api(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    })
    const body = response.status === 204 ? null : await response.json()
    return { response, body }
  }
  let configuredFeeSequence=0
  async function issueConfiguredInvoice(tenantId,dueDate,items){
    const configured=[]
    for(const item of items){const fee=await api('/fee-types',{method:'POST',body:{code:`TEST_FEE_${++configuredFeeSequence}`,name:item.description,defaultAmount:item.unitPrice,itemType:item.itemType}});assert.equal(fee.response.status,201);configured.push({feeTypeId:fee.body.id,description:item.description,quantity:item.quantity||1})}
    return api('/invoices',{method:'POST',body:{tenantId,dueDate,items:configured}})
  }

  t.after(() => { server.close(); db.close() })

  await t.test('login and RBAC identity', async () => {
    const { response, body } = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    assert.equal(response.status, 200)
    assert.ok(body.token)
    assert.ok(body.user.permissions.includes('finance.cancel'))
    assert.ok(body.user.permissions.includes('finance.approve'))
    token = body.token
  })

  await t.test('master data and rate policies are seeded and cancellable with reason', async () => {
    const tenantTypes = await api('/master-data/tenant_type')
    assert.equal(tenantTypes.response.status, 200)
    assert.equal(tenantTypes.body.length, 5)
    const created = await api('/master-data/tenant_type', { method: 'POST', body: { code: 'VISITING', name: 'อาจารย์ผู้มาเยือน' } })
    assert.equal(created.response.status, 201)
    const withoutReason = await api(`/master-data/tenant_type/${created.body.id}`, { method: 'DELETE', body: {} })
    assert.equal(withoutReason.response.status, 400)
    const cancelled = await api(`/master-data/tenant_type/${created.body.id}`, { method: 'DELETE', body: { reason: 'ยกเลิกตามประกาศประเภทผู้เช่าใหม่' } })
    assert.equal(cancelled.response.status, 204)
    const tenantOptions = await api('/tenants/options')
    assert.equal(tenantOptions.response.status, 200)
    assert.equal(tenantOptions.body.tenantTypes.length, 5)
    assert.ok(tenantOptions.body.titles.some(item => item.name === 'นางสาว'))
    assert.ok(tenantOptions.body.faculties.some(item => item.name === 'คณะครุศาสตร์'))
    assert.ok(tenantOptions.body.majors.some(item => item.name === 'การศึกษาปฐมวัย'))
    assert.ok(!tenantOptions.body.tenantTypes.some(item => item.code === 'VISITING'))
    const policies = await api('/rate-policies')
    assert.equal(policies.response.status, 200)
    assert.ok(policies.body.some(item => item.code === 'ST68_TERM' && item.amount === 8000))
    assert.ok(policies.body.some(item => item.code === 'ST64_YEAR' && item.amount === 16000 && item.utility_split_divisor === 2))
    assert.ok(policies.body.some(item => item.code === 'ST64_SUMMER' && item.amount === 6000 && item.due_day === 5))
    assert.ok(policies.body.some(item => item.code === 'EXTERNAL_MONTH' && item.amount === 5000 && item.rate_scope === 'room'))
    const policyVersion = await api('/rate-policies', { method: 'POST', body: { code: 'ST68_TERM_2570', name: 'นักศึกษา 68+ ภาคเรียน ปี 2570', tenantCohort: 'STUDENT_68_PLUS', rentalPeriod: 'term', rateScope: 'person', amount: 8500, occupancyLimit: 2, utilitySplitDivisor: 2, waterRate: 23, electricityRate: 7, depositAmount: 2000, dueDay: 5, lateFee: 100, delinquencyMonths: 2, terminationAction: 'ค้างค่าสาธารณูปโภค 2 เดือน ยุติการเช่า', startsAt: '2027-06-01', endsAt: null } })
    assert.equal(policyVersion.response.status, 201)
    assert.equal(policyVersion.body.amount, 8500)
    const cancelPolicyWithoutReason = await api(`/rate-policies/${policyVersion.body.id}`, { method: 'PATCH', body: { active: false } })
    assert.equal(cancelPolicyWithoutReason.response.status, 400)
    const cancelledPolicy = await api(`/rate-policies/${policyVersion.body.id}`, { method: 'PATCH', body: { active: false, reason: 'ยกเลิกเวอร์ชันทดสอบก่อนเริ่มใช้งาน' } })
    assert.equal(cancelledPolicy.body.active, 0)
    const roomRate = await api('/rate-plans', { method: 'POST', body: { name: 'นักศึกษา 2569 รายภาคเรียน', rentalPeriod: 'term', tenantType: 'student', amount: 8000, startsAt: '2026-06-01', endsAt: '2027-05-31' } })
    assert.equal(roomRate.response.status, 201)
    assert.equal(roomRate.body.rental_period, 'term')
    const utilityRate = await api('/utility-rates', { method: 'POST', body: { utilityType: 'water', unitRate: 23, minimumCharge: 0, startsAt: '2026-06-01', endsAt: null } })
    assert.equal(utilityRate.response.status, 201)
    assert.equal(utilityRate.body.unit_rate, 23)
    const fee = await api('/fee-types', { method: 'POST', body: { code: 'DAMAGE', name: 'ค่าปรับทรัพย์สินเสียหาย', defaultAmount: 0 } })
    assert.equal(fee.response.status, 201)
    const updatedFee = await api(`/fee-types/${fee.body.id}`, { method: 'PATCH', body: { name: 'ค่าปรับความเสียหาย', defaultAmount: 350 } })
    assert.equal(updatedFee.response.status, 200)
    assert.equal(updatedFee.body.default_amount, 350)
    const configuredRates = await api('/rate-plans')
    assert.ok(configuredRates.body.some(item => item.id === roomRate.body.id && item.starts_at === '2026-06-01'))
    const imported = await api('/master-data/province/import', { method: 'POST', body: { rows: [{ code: '10', name: 'กรุงเทพมหานคร' }] } })
    assert.equal(imported.response.status, 201)
    assert.equal(imported.body.imported, 1)
    const floors = await api('/master-data/floor')
    assert.ok(floors.body.some(item => item.code === 'PRAMOTE1-F1' && item.parent_name === 'อาคารปราโมทย์ 1'))
    const dormRooms = await api('/rooms?availability=all')
    const dormBeds = await api('/beds')
    const masterRooms = await api('/master-data/room')
    const masterBeds = await api('/master-data/bed')
    assert.equal(masterRooms.body.filter(item => item.active).length, 414)
    assert.equal(masterBeds.body.filter(item => item.active).length, 756)
    assert.equal(dormRooms.body.length, 414)
    assert.equal(dormBeds.body.length, 756)
    assert.ok(dormRooms.body.every(item => ['PRAMOTE1', 'PRAMOTE2'].includes(item.building_code)))
    assert.deepEqual(masterRooms.body.find(item => item.code === '1209').details, { roomType: 'electrical', bedCount: 0 })
    const synchronized = await api('/master-data/sync-space', { method: 'POST', body: {} })
    assert.equal(synchronized.response.status, 200)
    assert.ok(synchronized.body.rooms >= 414)
    const pramote1 = dormRooms.body.filter(item => item.building_name === 'อาคารปราโมทย์ 1')
    const pramote2 = dormRooms.body.filter(item => item.building_name === 'อาคารปราโมทย์ 2')
    assert.equal(pramote1.length, 207)
    assert.equal(pramote2.length, 207)
    assert.deepEqual([1,2,3,4,5].map(floorNo => pramote1.filter(item => item.floor_no === floorNo).length), [29,59,55,55,9])
    assert.deepEqual([1,2,3,4,5].map(floorNo => pramote2.filter(item => item.floor_no === floorNo).length), [29,59,55,55,9])
    assert.equal(pramote1.filter(item => item.room_type === 'residential').length, 187)
    assert.equal(pramote2.filter(item => item.room_type === 'residential').length, 191)
    assert.equal(pramote1.find(item => item.room_no === '1209').room_type, 'electrical')
    assert.equal(pramote1.find(item => item.room_no === '1203').room_type, 'prayer')
    assert.equal(pramote2.find(item => item.room_no === '2209').room_type, 'electrical')
    assert.equal(pramote2.find(item => item.room_no === '2203').room_type, 'prayer')
    const pramote1Beds = await api(`/beds?buildingId=${pramote1[0].building_id}`)
    const pramote2Beds = await api(`/beds?buildingId=${pramote2[0].building_id}`)
    assert.equal(pramote1Beds.body.length, 374)
    assert.equal(pramote2Beds.body.length, 382)
  })

  await t.test('user groups, permissions, password tools and audit filters are manageable', async () => {
    const permissions = await api('/permissions')
    const usersRead = permissions.body.find(item => item.code === 'users.read')
    const role = await api('/roles', { method: 'POST', body: { name: 'ผู้ตรวจสอบทดสอบ', description: 'กลุ่มสำหรับตรวจสอบการจัดการสิทธิ์', permissionIds: [usersRead.id] } })
    assert.equal(role.response.status, 201)
    const updatedRole = await api(`/roles/${role.body.id}`, { method: 'PATCH', body: { description: 'แก้ไขรายละเอียดกลุ่มแล้ว', permissionIds: [usersRead.id] } })
    assert.equal(updatedRole.response.status, 200)
    const createdUser = await api('/users', { method: 'POST', body: { username: 'auditor.test', displayName: 'ผู้ตรวจสอบระบบ', email: 'auditor@example.test', authSource: 'local', password: 'Auditor@123', roleIds: [role.body.id] } })
    assert.equal(createdUser.response.status, 201)
    const changedUser = await api(`/users/${createdUser.body.id}`, { method: 'PATCH', body: { displayName: 'ผู้ตรวจสอบระบบแก้ไข', roleIds: [role.body.id] } })
    assert.equal(changedUser.response.status, 200)
    const reset = await api(`/users/${createdUser.body.id}/reset-password`, { method: 'POST', body: { newPassword: 'Reset@1234' } })
    assert.equal(reset.response.status, 204)
    const auditorLogin = await api('/auth/login', { method: 'POST', body: { username: 'auditor.test', password: 'Reset@1234' } })
    assert.equal(auditorLogin.response.status, 200)
    token = auditorLogin.body.token
    const changedPassword = await api('/auth/change-password', { method: 'POST', body: { currentPassword: 'Reset@1234', newPassword: 'Changed@1234' } })
    assert.equal(changedPassword.response.status, 204)
    const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    token = adminLogin.body.token
    const filteredLogs = await api('/audit-logs?actor=auditor.test&from=2020-01-01T00:00:00&to=2099-12-31T23:59:59')
    assert.ok(filteredLogs.body.some(item => item.action === 'PASSWORD_CHANGED'))
    const cancelledUser = await api(`/users/${createdUser.body.id}`, { method: 'DELETE', body: { reason: 'ยกเลิกบัญชีหลังจบการทดสอบระบบ' } })
    assert.equal(cancelledUser.response.status, 204)
    const cancelledRole = await api(`/roles/${role.body.id}`, { method: 'DELETE', body: { reason: 'ยกเลิกกลุ่มหลังจบการทดสอบระบบ' } })
    assert.equal(cancelledRole.response.status, 204)
  })

  let tenantId
  let checkerToken
  await t.test('create tenant and portal account with password policy', async () => {
    const directory = await api('/integrations/students/690001')
    assert.equal(directory.response.status, 200)
    assert.equal(directory.body.firstName, 'ข้อมูล')
    const created = await api('/tenants', { method: 'POST', body: { tenantCode: 'ST690001', tenantType: 'student', tenantTypeCode: 'STUDENT', firstName: 'สมหญิง', lastName: 'เรียนดี', nationalId: '1101700000001', email: 'student@example.test', phone: '0811111111', currentAddress: 'มหาวิทยาลัยตัวอย่าง', faculty: 'คณะครุศาสตร์', program: 'ศึกษาศาสตรบัณฑิต', major: 'การศึกษาปฐมวัย', lineId: 'student.line', guardianName: 'นาง สมใจ เรียนดี', guardianPhone: '0822222222', guardianEmail: 'guardian@example.test', guardianLineId: 'guardian.line' } })
    assert.equal(created.response.status, 201)
    assert.equal(created.body.tenant_type_code, 'STUDENT')
    tenantId = created.body.id

    const weak = await api(`/tenants/${tenantId}/portal-account`, { method: 'POST', body: { username: 'st690001', password: 'short' } })
    assert.equal(weak.response.status, 400)
    const missingUppercase = await api(`/tenants/${tenantId}/portal-account`, { method: 'POST', body: { username: 'st690001', password: 'student@123' } })
    assert.equal(missingUppercase.response.status, 400)
    const valid = await api(`/tenants/${tenantId}/portal-account`, { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    assert.equal(valid.response.status, 201)
    assert.equal(valid.body.tenant_id, tenantId)
    db.prepare(`INSERT INTO leases(contract_no,tenant_id,contract_type,starts_at,ends_at,deposit_amount,status,contract_date,rental_period,advance_rent,minimum_term_months,document_status,signed_at,rate_policy_code,rate_snapshot_json) VALUES (?,?,?,'2026-01-01','2026-09-30',0,'expired','2025-12-20','term',0,1,'signed','2025-12-20T09:00:00.000Z','ST68_TERM',?)`).run('CT-HIST-690001',tenantId,'STUDENT_TERM',JSON.stringify({lateFee:100,delinquencyMonths:2,terminationAction:'ยุติการเช่าห้องพัก'}))
    const permissions = await api('/permissions')
    const checkerPermissions = permissions.body.filter(item => ['finance.read','finance.approve'].includes(item.code)).map(item => item.id)
    const checkerRole = await api('/roles', { method:'POST', body:{name:'ผู้อนุมัติการเงินทดสอบ',permissionIds:checkerPermissions} })
    const checker = await api('/users', { method:'POST', body:{username:'finance.checker',displayName:'ผู้ตรวจสอบการเงิน',authSource:'local',password:'Checker@1234',roleIds:[checkerRole.body.id]} })
    assert.equal(checker.response.status,201)
    const checkerLogin = await api('/auth/login', { method:'POST', body:{username:'finance.checker',password:'Checker@1234'} })
    checkerToken=checkerLogin.body.token
  })

  let invoiceId
  let receiptId
  await t.test('issue invoice, receive payment and issue receipt', async () => {
    const invoice = await issueConfiguredInvoice(tenantId,'2026-08-15',[
      { itemType: 'room', description: 'ค่าห้องพัก ภาคเรียน 1/2569', quantity: 1, unitPrice: 8500 },
      { itemType: 'deposit', description: 'เงินประกันห้องพัก', quantity: 1, unitPrice: 3000 },
    ])
    assert.equal(invoice.response.status, 201)
    assert.equal(invoice.body.total, 11500)
    invoiceId = invoice.body.id

    const payment = await api('/payments', { method: 'POST', body: { invoiceId, amount: 11500, method: 'transfer', referenceNo: 'TX-001' } })
    assert.equal(payment.response.status, 201)
    assert.match(payment.body.receipt.receipt_no, /^RC-/)
    receiptId = payment.body.receipt.id
  })

  await t.test('cancellation reason is mandatory and audit is retained', async () => {
    const noReason = await api(`/receipts/${receiptId}/cancel`, { method: 'POST', body: { reason: '' } })
    assert.equal(noReason.response.status, 400)

    const cancelled = await api(`/receipts/${receiptId}/cancel`, { method: 'POST', body: { reason: 'ผู้ชำระโอนยอดผิดบัญชี' } })
    assert.equal(cancelled.response.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')

    const invoiceCancelled = await api(`/invoices/${invoiceId}/cancel`, { method: 'POST', body: { reason: 'ออกเอกสารผิดภาคการศึกษา' } })
    assert.equal(invoiceCancelled.response.status, 200)
    assert.equal(invoiceCancelled.body.status, 'cancelled')

    const logs = await api('/audit-logs?entityType=invoice')
    assert.equal(logs.response.status, 200)
    assert.ok(logs.body.some(log => log.action === 'CREATE'))
    assert.ok(logs.body.some(log => log.action === 'CANCEL'))
  })

  await t.test('invoice delivery, payment proof, receipt document and daily remittance workflow', async () => {
    const invoice = await issueConfiguredInvoice(tenantId,'2026-08-25',[
      { itemType: 'room', description: 'ค่าห้องพัก สิงหาคม 2569', quantity: 1, unitPrice: 3000 },
      { itemType: 'deposit', description: 'เงินประกันห้องพัก', quantity: 1, unitPrice: 2000 },
    ])
    assert.equal(invoice.response.status, 201)
    const sent = await api(`/invoices/${invoice.body.id}/send`, { method: 'POST', body: {} })
    assert.equal(sent.response.status, 200)
    assert.equal(sent.body.status, 'queued')
    const invoicePdf = await fetch(`${base}/invoices/${invoice.body.id}/document`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(invoicePdf.headers.get('content-type'), 'application/pdf')
    assert.equal(Buffer.from(await invoicePdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF')

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    token = tenantLogin.body.token
    const ownInvoices = await api('/invoices')
    assert.ok(ownInvoices.body.every(item => item.tenant_id === tenantId))
    const proof = await api('/payment-proofs', { method: 'POST', body: {
      invoiceId: invoice.body.id, amount: 3000, referenceNo: 'KPLUS-001', paidAt: '2026-08-20T09:15:00.000Z',
      filename: 'transfer.pdf', mimeType: 'application/pdf', fileBase64: Buffer.from('payment proof document').toString('base64'),
    } })
    assert.equal(proof.response.status, 201)
    assert.equal(proof.body.status, 'pending')

    const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    token = adminLogin.body.token
    const reviewed = await api(`/payment-proofs/${proof.body.id}/review`, { method: 'POST', body: { decision: 'approved', note: 'ตรวจสอบยอดและบัญชีผู้โอนถูกต้อง' } })
    assert.equal(reviewed.response.status, 200)
    assert.match(reviewed.body.receipt.receipt_no, /^RC-/)
    const receiptPdf = await fetch(`${base}/receipts/${reviewed.body.receipt.id}/document`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(receiptPdf.headers.get('content-type'), 'application/pdf')
    assert.equal(Buffer.from(await receiptPdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF')

    const cash = await api('/payments', { method: 'POST', body: { invoiceId: invoice.body.id, amount: 2000, method: 'cash', paidAt: '2026-08-20T10:00:00.000Z' } })
    assert.equal(cash.response.status, 201)
    const mismatch = await api('/remittances', { method: 'POST', body: { date: '2026-08-20', holdingStatementAmount:4999, cashDepositReference:'CASH-DEP-001' } })
    assert.equal(mismatch.response.status,409)
    assert.equal(mismatch.body.error,'RECONCILIATION_MISMATCH')
    const remittance = await api('/remittances', { method: 'POST', body: { date: '2026-08-20', holdingStatementAmount:5000, cashDepositReference:'CASH-DEP-001' } })
    assert.equal(remittance.response.status, 201)
    assert.equal(remittance.body.revenue_amount, 3000)
    assert.equal(remittance.body.deposit_amount, 2000)
    assert.equal(remittance.body.cash_amount, 2000)
    assert.equal(remittance.body.transfer_amount, 3000)
    const submitted = await api(`/remittances/${remittance.body.id}/submit`, { method: 'POST', body: {} })
    assert.equal(submitted.body.status, 'submitted')
    const blockedReceiptCancel = await api(`/receipts/${cash.body.receipt.id}/cancel`, { method:'POST', body:{reason:'ทดสอบห้ามยกเลิกหลังนำส่ง'} })
    assert.equal(blockedReceiptCancel.response.status,409)
    const selfApproval = await api(`/remittances/${remittance.body.id}/approve`, { method: 'POST', body: { revenueTransferReference:'REV-SELF',depositTransferReference:'DEP-SELF',universityReceiptNo: 'SDU-SELF' } })
    assert.equal(selfApproval.response.status, 409)
    token=checkerToken
    const missingTransfer = await api(`/remittances/${remittance.body.id}/approve`, { method: 'POST', body: { universityReceiptNo: 'SDU-001' } })
    assert.equal(missingTransfer.response.status, 400)
    const approved = await api(`/remittances/${remittance.body.id}/approve`, { method: 'POST', body: { revenueTransferReference: 'REV-001', depositTransferReference: 'DEP-001', universityReceiptNo: 'SDU-001' } })
    assert.equal(approved.body.status, 'approved')
    const adminAgain = await api('/auth/login', { method:'POST', body:{username:'admin',password:'Admin@1234'} })
    token=adminAgain.body.token
    const noReason = await api(`/remittances/${remittance.body.id}/cancel`, { method: 'POST', body: { reason: '' } })
    assert.equal(noReason.response.status, 400)
    const cancelled = await api(`/remittances/${remittance.body.id}/cancel`, { method: 'POST', body: { reason: 'ยกเลิกเพื่อแก้ไขเลขที่ใบเสร็จมหาวิทยาลัย' } })
    assert.equal(cancelled.body.status, 'cancelled')
  })

  await t.test('late fees are Config-driven and delinquency rules are idempotent by tenant type', async()=>{
    for(const [dueDate,type] of [['2026-07-05','water'],['2026-08-05','electricity']]){
      const invoice=await issueConfiguredInvoice(tenantId,dueDate,[{itemType:type,description:`ค่าสาธารณูปโภค ${dueDate.slice(0,7)}`,quantity:1,unitPrice:50}])
      assert.equal(invoice.response.status,201)
    }
    const assessed=await api('/finance/assess-late-fees',{method:'POST',body:{asOf:'2026-09-06'}})
    assert.equal(assessed.response.status,201)
    assert.ok(assessed.body.createdCount>=2)
    assert.ok(assessed.body.invoices.every(item=>item.amount===100))
    const repeated=await api('/finance/assess-late-fees',{method:'POST',body:{asOf:'2026-09-06'}})
    assert.equal(repeated.body.createdCount,0)
    const delinquency=await api('/finance/delinquency?asOf=2026-09-06')
    const student=delinquency.body.rows.find(item=>item.tenant_id===tenantId)
    assert.equal(student.threshold_reached,true)
    assert.equal(student.required_action,'ยุติการเช่าห้องพัก')
  })

  await t.test('bank CSV reconciliation retains every matched and rejected row',async()=>{
    const invoice=await issueConfiguredInvoice(tenantId,'2026-09-15',[{itemType:'other',description:'ค่าธรรมเนียมทดสอบธนาคาร',unitPrice:250}])
    const csv=`invoice_no,amount,reference_no,paid_at\n${invoice.body.invoice_no},250,KBANK-UNIQUE-001,2026-09-10T09:00:00.000Z`
    const imported=await api('/bank-imports',{method:'POST',body:{bankCode:'KASIKORN',filename:'statement.csv',csv}})
    assert.equal(imported.response.status,201)
    assert.equal(imported.body.successCount,1)
    assert.equal(db.prepare(`SELECT status FROM bank_import_rows WHERE bank_import_id=?`).get(imported.body.id).status,'matched')
    const duplicate=await api('/bank-imports',{method:'POST',body:{bankCode:'KASIKORN',filename:'statement-duplicate.csv',csv}})
    assert.equal(duplicate.body.errorCount,1)
    assert.equal(db.prepare(`SELECT status FROM bank_import_rows WHERE bank_import_id=?`).get(duplicate.body.id).status,'error')
  })

  await t.test('room status requires a reason when damaged', async () => {
    const rooms = await api('/rooms')
    const room = rooms.body[0]
    const invalid = await api(`/rooms/${room.id}/status`, { method: 'PATCH', body: { status: 'damaged' } })
    assert.equal(invalid.response.status, 400)
    const valid = await api(`/rooms/${room.id}/status`, { method: 'PATCH', body: { status: 'damaged', reason: 'ระบบไฟฟ้าขัดข้อง' } })
    assert.equal(valid.response.status, 200)
    assert.equal(valid.body.status, 'damaged')
  })

  let occupiedRoomId
  await t.test('availability, reservation, transfer, meter billing and checkout flow', async () => {
    const available = await api('/beds?availability=available&bedCount=2')
    assert.equal(available.response.status, 200)
    assert.ok(available.body.length > 1)
    const firstBed = available.body[0]
    const wrongRatePolicy = await api('/reservations', { method: 'POST', body: { tenantId, scope: 'bed', rentalPeriod: 'monthly', roomId: firstBed.room_id, bedId: firstBed.id, startsAt: '2026-08-01', endsAt: '2026-12-31' } })
    assert.equal(wrongRatePolicy.response.status, 409)
    assert.equal(wrongRatePolicy.body.error, 'RATE_POLICY_NOT_CONFIGURED')
    const reserved = await api('/reservations', { method: 'POST', body: { tenantId, scope: 'bed', rentalPeriod: 'term', roomId: firstBed.room_id, bedId: firstBed.id, startsAt: '2026-08-01', endsAt: '2026-12-31' } })
    assert.equal(reserved.response.status, 201)
    assert.match(reserved.body.reservation_no, /^RSV-/)
    assert.equal(JSON.parse(reserved.body.condition_snapshot).ratePolicyCode, 'ST68_TERM')
    const occupied = await api(`/beds/${firstBed.id}/status`, { method: 'PATCH', body: { status: 'occupied', tenantId } })
    assert.equal(occupied.response.status, 200)
    const missing = await api('/contracts/missing')
    assert.ok(missing.body.some(item => item.id === tenantId))
    const otherTenant = await api('/tenants', { method: 'POST', body: { tenantCode: 'ST690002', tenantType: 'student', firstName: 'ผู้เช่า', lastName: 'คนอื่น' } })
    const stolenBed = await api('/contracts', { method: 'POST', body: { contractNo: 'CT-STOLEN', tenantId: otherTenant.body.id, bedId: firstBed.id, contractType: 'STUDENT_TERM', contractDate: '2026-07-30', rentalPeriod: 'term', startsAt: '2026-08-01', endsAt: '2026-12-31', minimumTermMonths: 4 } })
    assert.equal(stolenBed.response.status, 409)
    assert.equal(stolenBed.body.error, 'BED_NOT_LOCKED_FOR_TENANT')
    const contract = await api('/contracts', { method: 'POST', body: { contractNo: 'CT-690001', tenantId, bedId: firstBed.id, contractType: 'STUDENT_TERM', contractDate: '2026-07-30', rentalPeriod: 'term', startsAt: '2026-08-01', endsAt: '2026-12-31', advanceRent: 1, minimumTermMonths: 4, depositAmount: 1 } })
    assert.equal(contract.response.status, 201)
    assert.equal(contract.body.document_status, 'draft')
    assert.equal(contract.body.status, 'contract_pending')
    assert.equal(contract.body.advance_rent, 8000)
    assert.equal(contract.body.deposit_amount, 2000)
    assert.equal(contract.body.rate_policy_code, 'ST68_TERM')
    const sent = await api(`/contracts/${contract.body.id}/send`, { method: 'POST', body: {} })
    assert.equal(sent.response.status, 200)
    assert.equal(sent.body.email_status, 'queued')
    const pending = await api('/contracts/pending-signatures')
    assert.ok(pending.body.some(item => item.id === contract.body.id))

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    token = tenantLogin.body.token
    const ownContracts = await api('/contracts')
    assert.equal(ownContracts.response.status, 200)
    assert.ok(ownContracts.body.some(item=>item.id===contract.body.id))
    const wrongSignature = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: 'Wrong@123', confirmed: true } })
    assert.equal(wrongSignature.response.status, 401)
    const signed = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: 'Student@123', confirmed: true } })
    assert.equal(signed.response.status, 200)
    assert.equal(signed.body.document_status, 'signed')
    assert.match(signed.body.invoice_no, /^INV-/)
    const contractInvoice = db.prepare(`SELECT * FROM invoices WHERE contract_id=?`).get(contract.body.id)
    assert.equal(contractInvoice.id, signed.body.invoice_id)
    assert.equal(contractInvoice.due_date, '2026-08-01')
    assert.equal(contractInvoice.total, 10000)
    assert.deepEqual(db.prepare(`SELECT item_type,amount FROM invoice_items WHERE invoice_id=? ORDER BY item_type`).all(contractInvoice.id).map(row=>({...row})), [
      { item_type: 'deposit', amount: 2000 },
      { item_type: 'room', amount: 8000 },
    ])
    const duplicateSignature = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: 'Student@123', confirmed: true } })
    assert.equal(duplicateSignature.response.status, 409)
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM invoices WHERE contract_id=? AND source_type='contract'`).get(contract.body.id).count, 1)
    const pdfResponse = await fetch(`${base}/contracts/${contract.body.id}/document`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(pdfResponse.status, 200)
    assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf')
    const pdf = Buffer.from(await pdfResponse.arrayBuffer())
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
    assert.ok(pdf.length > 5000)

    const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    token = adminLogin.body.token
    const expiryAlerts = await api('/contracts/alerts?asOf=2026-12-01')
    assert.ok(expiryAlerts.body.some(item => item.id === contract.body.id && item.days_remaining === 30))
    const monthlyAlertContract = db.prepare(`INSERT INTO leases(contract_no,tenant_id,bed_id,contract_type,contract_date,rental_period,starts_at,ends_at,document_status,status) VALUES ('CT-690-MONTH',?,?, 'STUDENT_MONTH','2027-01-01','monthly','2027-02-01','2027-02-28','signed','active')`).run(tenantId,firstBed.id)
    const beforeMonthlyAlert = await api('/contracts/alerts?asOf=2027-01-24')
    assert.ok(!beforeMonthlyAlert.body.some(item => item.id === Number(monthlyAlertContract.lastInsertRowid)))
    const monthlyAlert = await api('/contracts/alerts?asOf=2027-01-25')
    assert.ok(monthlyAlert.body.some(item => item.id === Number(monthlyAlertContract.lastInsertRowid) && item.alert_at === '2027-01-25'))
    const persistentMonthlyAlert = await api('/contracts/alerts?asOf=2027-02-01')
    assert.ok(persistentMonthlyAlert.body.some(item => item.id === Number(monthlyAlertContract.lastInsertRowid)))
    const calendarMonthContract = db.prepare(`INSERT INTO leases(contract_no,tenant_id,bed_id,contract_type,contract_date,rental_period,starts_at,ends_at,document_status,status) VALUES ('CT-690-CALENDAR',?,?, 'STUDENT_TERM','2027-01-01','term','2027-01-01','2027-03-31','signed','active')`).run(tenantId,firstBed.id)
    const beforeCalendarMonth = await api('/contracts/alerts?asOf=2027-02-27')
    assert.ok(!beforeCalendarMonth.body.some(item => item.id === Number(calendarMonthContract.lastInsertRowid)))
    const onCalendarMonth = await api('/contracts/alerts?asOf=2027-02-28')
    assert.ok(onCalendarMonth.body.some(item => item.id === Number(calendarMonthContract.lastInsertRowid) && item.alert_at === '2027-02-28'))
    db.prepare(`UPDATE leases SET status='cancelled' WHERE id=?`).run(monthlyAlertContract.lastInsertRowid)
    db.prepare(`UPDATE leases SET status='cancelled' WHERE id=?`).run(calendarMonthContract.lastInsertRowid)
    const immutable = await api(`/contracts/${contract.body.id}`, { method: 'PATCH', body: { endsAt: '2027-01-31' } })
    assert.equal(immutable.response.status, 409)

    const renewal = await api(`/contracts/${contract.body.id}/renew`, { method: 'POST', body: { contractNo: 'CT-690001-R2', contractDate: '2026-12-01', rentalPeriod: 'term', startsAt: '2027-01-01', endsAt: '2027-05-31' } })
    assert.equal(renewal.response.status, 201)
    assert.equal(renewal.body.status, 'renewal_pending')
    assert.equal(renewal.body.previous_contract_no, 'CT-690001')
    const duplicateRenewal = await api(`/contracts/${contract.body.id}/renew`, { method: 'POST', body: { contractNo: 'CT-690001-R3', contractDate: '2026-12-01', startsAt: '2027-01-01', endsAt: '2027-05-31' } })
    assert.equal(duplicateRenewal.response.status, 409)
    const alertsAfterRenewal = await api('/contracts/alerts?asOf=2026-12-01')
    assert.ok(!alertsAfterRenewal.body.some(item => item.id === contract.body.id))
    const renewalHistory = await api(`/contracts/${contract.body.id}/history`)
    assert.ok(renewalHistory.body.some(item => item.event_type === 'RENEWAL_CREATED'))
    const renewalSent = await api(`/contracts/${renewal.body.id}/send`, { method: 'POST', body: {} })
    assert.equal(renewalSent.response.status, 200)
    token = tenantLogin.body.token
    const signedRenewal = await api(`/contracts/${renewal.body.id}/sign`, { method: 'POST', body: { password: 'Student@123', confirmed: true } })
    assert.equal(signedRenewal.response.status, 200)
    assert.equal(signedRenewal.body.status, 'active')
    assert.match(signedRenewal.body.invoice_no, /^INV-/)
    const renewalInvoice = db.prepare(`SELECT * FROM invoices WHERE contract_id=?`).get(renewal.body.id)
    assert.equal(renewalInvoice.due_date, '2027-01-01')
    assert.equal(renewalInvoice.total, 8000)
    assert.deepEqual(db.prepare(`SELECT item_type,amount FROM invoice_items WHERE invoice_id=?`).all(renewalInvoice.id).map(row=>({...row})), [
      { item_type: 'room', amount: 8000 },
    ])
    assert.equal(db.prepare(`SELECT status FROM leases WHERE id=?`).get(contract.body.id).status, 'expired')
    token = adminLogin.body.token
    const futureRate = await api('/rate-policies', { method: 'POST', body: { code: 'ST68_TERM_2571', name: 'นักศึกษา 68+ ภาคเรียน ปี 2571', tenantCohort: 'STUDENT_68_PLUS', rentalPeriod: 'term', rateScope: 'person', amount: 9000, occupancyLimit: 2, utilitySplitDivisor: 2, waterRate: 23, electricityRate: 7, depositAmount: 2000, dueDay: 5, lateFee: 100, delinquencyMonths: 2, startsAt: '2027-06-01', endsAt: null } })
    assert.equal(futureRate.response.status, 201)
    const nextRateRenewal = await api(`/contracts/${renewal.body.id}/renew`, { method: 'POST', body: { contractNo: 'CT-690001-R3', contractDate: '2027-05-01', rentalPeriod: 'term', startsAt: '2027-06-01', endsAt: '2027-10-31' } })
    assert.equal(nextRateRenewal.response.status, 201)
    assert.equal(nextRateRenewal.body.rate_policy_code, 'ST68_TERM_2571')
    assert.equal(nextRateRenewal.body.advance_rent, 9000)
    db.prepare(`DELETE FROM contract_documents WHERE lease_id=?`).run(nextRateRenewal.body.id)
    db.prepare(`DELETE FROM contract_events WHERE lease_id=?`).run(nextRateRenewal.body.id)
    db.prepare(`DELETE FROM leases WHERE id=?`).run(nextRateRenewal.body.id)
    const afterReserve = await api('/beds?availability=available&bedCount=2')
    const target = afterReserve.body.find(x => x.room_id !== firstBed.room_id)
    const moved = await api('/room-transfers', { method: 'POST', body: { tenantId, toBedId: target.id, transferDate: '2026-08-10', reason: 'ย้ายตามคำร้องของผู้พักอาศัย' } })
    assert.equal(moved.response.status, 201)
    occupiedRoomId = target.room_id

    const electricityRate = await api('/utility-rates', { method: 'POST', body: { utilityType: 'electricity', unitRate: 9, minimumCharge: 0, startsAt: '2026-08-01', endsAt: null } })
    assert.equal(electricityRate.response.status, 201)
    const meter = await api('/meter-readings', { method: 'POST', body: { roomId: target.room_id, utilityType: 'electricity', billingMonth: '2026-08', previousReading: 100, currentReading: 110, unitRate: 0.01, dueDate: '2026-09-05', issueInvoices: true } })
    assert.equal(meter.response.status, 201)
    assert.equal(meter.body.unit_rate, 9)
    assert.equal(meter.body.amount_per_bed, 45)
    assert.equal(meter.body.invoice_ids.length, 1)

    const checkout = await api('/checkouts', { method: 'POST', body: { tenantId, checkoutDate: '2026-08-31', damageDetail: 'โต๊ะมีรอยขีดข่วน', damageAmount: 500 } })
    assert.equal(checkout.response.status, 201)
    assert.equal(checkout.body.refund_amount, 1500)
    assert.ok(checkout.body.outstanding_debt >= 35)
    const incompleteInspection = await api(`/rooms/${target.room_id}/readiness`, { method: 'POST', body: { ready: true, checklist: { cleanliness: true, electricity: true, water: false, furniture: true } } })
    assert.equal(incompleteInspection.response.status, 400)
    assert.equal(incompleteInspection.body.error, 'CHECKLIST_INCOMPLETE')
    const inspected = await api(`/rooms/${target.room_id}/readiness`, { method: 'POST', body: { ready: true, checklist: { cleanliness: true, electricity: true, water: true, furniture: true } } })
    assert.equal(inspected.response.status, 200)
    assert.equal(inspected.body.readiness_status, 'ready')
  })

  await t.test('staff and external tenants complete real contract signing flows from phase-one rates', async () => {
    const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    token = adminLogin.body.token
    const cases = [
      { tenantCode: 'SF690001', tenantType: 'staff', firstName: 'สมชาย', lastName: 'บุคลากร', organization: 'กองอาคารสถานที่', scope: 'bed', contractType: 'STAFF_MONTH', username: 'staff690001', password: 'Staff@1234', expectedRent: 2000, expectedTotal: 4000 },
      { tenantCode: 'EX690001', tenantType: 'external', firstName: 'สมศรี', lastName: 'ภายนอก', organization: 'บริษัท ทดสอบ จำกัด', scope: 'room', contractType: 'EXTERNAL_MONTH', username: 'external690001', password: 'External@1234', expectedRent: 5000, expectedTotal: 7000 },
    ]
    const overdueTenantIds=[]

    for (const item of cases) {
      const tenant = await api('/tenants', { method: 'POST', body: { tenantCode: item.tenantCode, tenantType: item.tenantType, firstName: item.firstName, lastName: item.lastName, nationalId: item.tenantType === 'staff' ? '1101700000002' : '1101700000003', email: `${item.username}@example.test`, phone: '0833333333', currentAddress: 'สุพรรณบุรี', organization: item.organization, emergencyContactName: 'ผู้ติดต่อฉุกเฉิน', emergencyContactPhone: '0844444444', emergencyContactRelation: 'ญาติ', legalEntity: item.tenantType === 'external' } })
      assert.equal(tenant.response.status, 201)
      const spaces = item.scope === 'room' ? await api('/rooms?availability=vacant&bedCount=2') : await api('/beds?availability=available&bedCount=2')
      const bed = item.scope === 'room' ? db.prepare(`SELECT b.id,r.id room_id FROM beds b JOIN rooms r ON r.id=b.room_id WHERE r.id=? ORDER BY b.id LIMIT 1`).get(spaces.body[0].id) : spaces.body[0]
      const reservation = await api('/reservations', { method: 'POST', body: { tenantId: tenant.body.id, scope: item.scope, rentalPeriod: 'monthly', roomId: bed.room_id, bedId: item.scope === 'bed' ? bed.id : null, startsAt: '2026-09-01', endsAt: '2026-09-30' } })
      assert.equal(reservation.response.status, 201)
      const tenantBed = db.prepare(`SELECT id FROM beds WHERE room_id=? AND tenant_id=? ORDER BY id LIMIT 1`).get(bed.room_id, tenant.body.id)
      await api(`/beds/${tenantBed.id}/status`, { method: 'PATCH', body: { status: 'occupied', tenantId: tenant.body.id } })
      if (item.tenantType === 'external') {
        const withoutCertificate = await api('/contracts', { method: 'POST', body: { contractNo: 'CT-EX-NO-CERT', tenantId: tenant.body.id, bedId: tenantBed.id, contractType: item.contractType, contractDate: '2026-08-25', rentalPeriod: 'monthly', startsAt: '2026-09-01', endsAt: '2026-09-30', minimumTermMonths: 1 } })
        assert.equal(withoutCertificate.response.status, 409)
        assert.equal(withoutCertificate.body.error, 'COMPANY_CERTIFICATE_REQUIRED')
        const certificate = await api(`/tenants/${tenant.body.id}/documents`, { method: 'POST', body: { documentType: 'company_certificate', filename: 'company.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-company-certificate').toString('base64') } })
        assert.equal(certificate.response.status, 201)
      }
      const account = await api(`/tenants/${tenant.body.id}/portal-account`, { method: 'POST', body: { username: item.username, password: item.password } })
      assert.equal(account.response.status, 201)
      const contract = await api('/contracts', { method: 'POST', body: { contractNo: `CT-${item.tenantCode}`, tenantId: tenant.body.id, bedId: tenantBed.id, contractType: item.contractType, contractDate: '2026-08-25', rentalPeriod: 'monthly', startsAt: '2026-09-01', endsAt: '2026-09-30', advanceRent: 1, minimumTermMonths: 1, depositAmount: 1 } })
      assert.equal(contract.response.status, 201)
      assert.equal(contract.body.advance_rent, item.expectedRent)
      assert.equal(contract.body.deposit_amount, 2000)
      const sent = await api(`/contracts/${contract.body.id}/send`, { method: 'POST', body: {} })
      assert.equal(sent.response.status, 200)
      const login = await api('/auth/login', { method: 'POST', body: { username: item.username, password: item.password } })
      token = login.body.token
      const signed = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: item.password, confirmed: true } })
      assert.equal(signed.response.status, 200)
      assert.equal(signed.body.document_status, 'signed')
      assert.equal(db.prepare(`SELECT total FROM invoices WHERE contract_id=?`).get(contract.body.id).total, item.expectedTotal)
      assert.equal(db.prepare(`SELECT COUNT(*) count FROM contract_documents WHERE lease_id=? AND document_state='signed'`).get(contract.body.id).count, 1)
      token = adminLogin.body.token
      const overdue=await issueConfiguredInvoice(tenant.body.id,'2026-09-05',[{itemType:'room',description:`ค่าเช่าค้างชำระ ${item.tenantCode}`,unitPrice:100}])
      assert.equal(overdue.response.status,201)
      overdueTenantIds.push(tenant.body.id)
    }
    const delinquency=await api('/finance/delinquency?asOf=2026-10-06')
    for(const overdueTenantId of overdueTenantIds){const row=delinquency.body.rows.find(item=>item.tenant_id===overdueTenantId);assert.equal(row.threshold_reached,true);assert.match(row.required_action,/บอกเลิกสัญญา/)}
  })

  let inventoryItemId
  await t.test('inventory cannot be overdrawn', async () => {
    const item = await api('/inventory', { method: 'POST', body: { sku: 'LINEN-001', name: 'ผ้าปูที่นอน', category: 'dormitory', unit: 'ผืน', quantity: 10, reorderLevel: 3 } })
    assert.equal(item.response.status, 201)
    inventoryItemId = item.body.id
    const overdraw = await api(`/inventory/${item.body.id}/movements`, { method: 'POST', body: { type: 'out', quantity: 11, reference: 'เบิกประจำเดือน' } })
    assert.equal(overdraw.response.status, 400)
    const movement = await api(`/inventory/${item.body.id}/movements`, { method: 'POST', body: { type: 'out', quantity: 4, reference: 'เบิกประจำเดือน' } })
    assert.equal(movement.response.status, 200)
    assert.equal(movement.body.quantity, 6)
  })

  await t.test('repair timeline, parts usage and close workflow', async () => {
    const repair = await api('/repairs', { method: 'POST', body: { roomId: occupiedRoomId, title: 'หลอดไฟไม่ทำงาน', detail: 'ผู้เช่าแจ้งผ่านเจ้าหน้าที่', priority: 'normal', source: 'staff', tenantId } })
    assert.equal(repair.response.status, 201)
    for (const update of [
      { status: 'repairing', detail: 'ช่างเข้าตรวจสอบ' },
      { status: 'waiting_parts', detail: 'รอเบิกอุปกรณ์' },
    ]) {
      const result = await api(`/repairs/${repair.body.id}/updates`, { method: 'POST', body: update })
      assert.equal(result.response.status, 200)
    }
    const usage = await api(`/repairs/${repair.body.id}/inventory-usage`, { method: 'POST', body: { itemId: inventoryItemId, quantity: 1 } })
    assert.equal(usage.response.status, 201)
    const stockMovement=db.prepare(`SELECT * FROM inventory_movements WHERE item_id=? AND reference=?`).get(inventoryItemId,`งานซ่อม #${repair.body.id}`)
    assert.equal(stockMovement.movement_type,'out')
    const completed = await api(`/repairs/${repair.body.id}/updates`, { method: 'POST', body: { status: 'completed', detail: 'เปลี่ยนหลอดไฟและทดสอบแล้ว' } })
    assert.equal(completed.response.status, 200)
    const closed = await api(`/repairs/${repair.body.id}/updates`, { method: 'POST', body: { status: 'closed', detail: 'เจ้าหน้าที่ตรวจรับและปิดงาน' } })
    assert.equal(closed.response.status, 200)
    const detail = await api(`/repairs/${repair.body.id}`)
    assert.equal(detail.response.status, 200)
    assert.equal(detail.body.workflow_status, 'closed')
    assert.equal(detail.body.updates.length, 5)
    assert.equal(detail.body.inventoryUsage.length, 1)
  })

  await t.test('contract report is available', async () => {
    const contracts = await api('/reports/contracts')
    assert.equal(contracts.response.status, 200)
    assert.ok(contracts.body.some(item => item.contract_no === 'CT-690001' && item.status === 'expired'))
  })

  await t.test('tenant portal is isolated to the signed-in tenant', async () => {
    const otherTenant = await api('/tenants', { method: 'POST', body: { tenantCode: 'EXT690002', tenantType: 'external', firstName: 'ผู้เช่า', lastName: 'คนอื่น', email: 'other@example.test', currentAddress: 'สุพรรณบุรี' } })
    assert.equal(otherTenant.response.status, 201)
    const blockedInvoice = await issueConfiguredInvoice(otherTenant.body.id,'2026-09-05',[{ itemType: 'room', description: 'ค่าเช่าของผู้เช่าคนอื่น', quantity: 1, unitPrice: 5000 }])
    assert.equal(blockedInvoice.response.status, 409)
    assert.equal(blockedInvoice.body.error,'SIGNED_CONTRACT_REQUIRED')
    const otherInvoice = db.prepare(`SELECT i.* FROM invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.tenant_id!=? AND t.tenant_type='external' ORDER BY i.id DESC LIMIT 1`).get(tenantId)
    const otherRepair = await api('/repairs', { method: 'POST', body: { roomId: occupiedRoomId, tenantId: otherTenant.body.id, source: 'staff', title: 'งานซ่อมของผู้เช่าคนอื่น', detail: 'ใช้ทดสอบการแยกข้อมูล', priority: 'normal' } })
    assert.equal(otherRepair.response.status, 201)

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    token = tenantLogin.body.token
    const summary = await api('/tenant-portal/summary')
    assert.equal(summary.response.status, 200)
    assert.equal(summary.body.id, tenantId)

    const ownInvoices = await api('/invoices')
    assert.ok(ownInvoices.body.every(item => item.tenant_id === tenantId))
    assert.ok(!ownInvoices.body.some(item => item.id === otherInvoice.id))
    const otherInvoiceDocument=await fetch(`${base}/invoices/${otherInvoice.id}/document`,{headers:{authorization:`Bearer ${token}`}})
    assert.equal(otherInvoiceDocument.status,404)
    const otherContract=db.prepare(`SELECT id FROM leases WHERE tenant_id!=? AND document_status='signed' ORDER BY id DESC LIMIT 1`).get(tenantId)
    const otherContractDocument=await fetch(`${base}/contracts/${otherContract.id}/document`,{headers:{authorization:`Bearer ${token}`}})
    assert.equal(otherContractDocument.status,404)
    const crossTenantProof = await api('/payment-proofs', { method: 'POST', body: { invoiceId: otherInvoice.id, amount: Math.min(5000,otherInvoice.balance), referenceNo: 'INVALID-CROSS-TENANT', paidAt: '2026-09-01T10:00:00.000Z', filename: 'proof.pdf', mimeType: 'application/pdf', fileBase64: Buffer.from('cross tenant proof').toString('base64') } })
    assert.equal(crossTenantProof.response.status, 403)

    const ownContracts = await api('/contracts')
    assert.ok(ownContracts.body.every(item => item.tenant_id === tenantId))
    const ownRepairs = await api('/repairs')
    assert.ok(ownRepairs.body.every(item => item.tenant_id === tenantId))
    assert.ok(!ownRepairs.body.some(item => item.id === otherRepair.body.id))
    const otherRepairDetail = await api(`/repairs/${otherRepair.body.id}`)
    assert.equal(otherRepairDetail.response.status, 404)

    const submittedRepair = await api('/repairs', { method: 'POST', body: { roomId: occupiedRoomId, title: 'แจ้งซ่อมหลังย้ายออก', detail: 'ระบบต้องไม่ยอมผูกกับห้องที่ไม่ได้พัก', priority: 'normal' } })
    assert.equal(submittedRepair.response.status, 201)
    assert.equal(submittedRepair.body.tenant_id, tenantId)
    assert.equal(submittedRepair.body.room_id, null)
    const notifications = await api('/notifications')
    assert.ok(notifications.body.some(item => item.notification_type === 'repair_update' && item.entity_type === 'repair'))
  })

  await t.test('checkout request, final inspection, approval and deposit refund are tenant-scoped', async () => {
    const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    token = adminLogin.body.token
    const tenant = await api('/tenants', { method: 'POST', body: { tenantCode: 'ST690099', tenantType: 'student', firstName: 'ทดสอบ', lastName: 'ย้ายออก', email: 'checkout@example.test', currentAddress: 'สุพรรณบุรี' } })
    const tenantIdForCheckout = tenant.body.id
    const account = await api(`/tenants/${tenantIdForCheckout}/portal-account`, { method: 'POST', body: { username: 'checkout99', password: 'Checkout@123' } })
    assert.equal(account.response.status, 201)
    const beds = await api('/beds?availability=available')
    const bed = beds.body[0]
    const checkoutReservation = await api('/reservations', { method: 'POST', body: { tenantId: tenantIdForCheckout, scope: 'bed', rentalPeriod: 'term', roomId: bed.room_id, bedId: bed.id, startsAt: '2026-09-01', endsAt: '2026-12-31' } })
    assert.equal(checkoutReservation.response.status, 201)
    await api(`/beds/${bed.id}/status`, { method: 'PATCH', body: { status: 'occupied', tenantId: tenantIdForCheckout } })
    const contract = await api('/contracts', { method: 'POST', body: { contractNo: 'CT-690099', tenantId: tenantIdForCheckout, bedId: bed.id, contractType: 'STUDENT_TERM', contractDate: '2026-08-30', rentalPeriod: 'term', startsAt: '2026-09-01', endsAt: '2026-12-31', advanceRent: 8000, minimumTermMonths: 4, depositAmount: 2000 } })
    assert.equal(contract.response.status, 201)
    await api(`/contracts/${contract.body.id}/send`, { method: 'POST', body: {} })
    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'checkout99', password: 'Checkout@123' } })
    token = tenantLogin.body.token
    assert.ok(tenantLogin.body.user.permissions.includes('checkouts.create'))
    const signedContract = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: 'Checkout@123', confirmed: true } })
    assert.equal(signedContract.response.status, 200)
    token = adminLogin.body.token
    const contractInvoice = db.prepare(`SELECT * FROM invoices WHERE contract_id=?`).get(contract.body.id)
    const contractPayment = await api('/payments', { method: 'POST', body: { invoiceId: contractInvoice.id, amount: contractInvoice.total, method: 'transfer', referenceNo: 'CHECKOUT-CONTRACT-PAID' } })
    assert.equal(contractPayment.response.status, 201)
    token = tenantLogin.body.token
    const request = await api('/checkout-requests', { method: 'POST', body: { requestedCheckoutDate: '2026-12-20', reason: 'สำเร็จการศึกษาและเดินทางกลับภูมิลำเนา' } })
    assert.equal(request.response.status, 201)
    assert.equal(request.body.tenant_id, tenantIdForCheckout)
    const duplicate = await api('/checkout-requests', { method: 'POST', body: { requestedCheckoutDate: '2026-12-21', reason: 'คำขอซ้ำที่ระบบต้องป้องกัน' } })
    assert.equal(duplicate.response.status, 409)

    token = adminLogin.body.token
    const debtReview = await api(`/checkout-requests/${request.body.id}/debt-review`, { method: 'POST' })
    assert.equal(debtReview.body.status, 'debt_checked')
    const inspection = await api(`/checkout-requests/${request.body.id}/inspection`, { method: 'POST', body: { inspectionNote: 'ตรวจห้องและทรัพย์สินครบถ้วน', waterReading: 10, electricityReading: 10, damageDetail: 'โต๊ะมีรอยเล็กน้อย', damageAmount: 500 } })
    assert.equal(inspection.response.status, 200)
    assert.equal(inspection.body.final_utility_amount, 320)
    const blocked = await api(`/checkout-requests/${request.body.id}/approve`, { method: 'POST' })
    assert.equal(blocked.response.status, 409)
    const finalPayment = await api('/payments', { method: 'POST', body: { invoiceId: inspection.body.final_invoice_id, amount: 320, method: 'transfer', referenceNo: 'FINAL-UTIL-001' } })
    assert.equal(finalPayment.response.status, 201)
    const approved = await api(`/checkout-requests/${request.body.id}/approve`, { method: 'POST' })
    assert.equal(approved.body.status, 'approved')
    const refundRows = await api('/checkouts')
    const refund = refundRows.body.find(item => item.id === approved.body.completed_checkout_id)
    assert.equal(refund.refund_amount, 1500)
    const refundTransfer = await api(`/checkouts/${refund.id}/refund-transfer`, { method: 'POST', body: { referenceNo: 'REFUND-001', transferredAt: '2026-12-20T09:30:00.000Z', filename: 'refund.pdf', mimeType: 'application/pdf', fileBase64: Buffer.from('deposit refund transfer proof').toString('base64') } })
    assert.equal(refundTransfer.body.refund_transfer_status, 'transferred')

    token = tenantLogin.body.token
    const ownRequests = await api('/checkout-requests')
    assert.ok(ownRequests.body.every(item => item.tenant_id === tenantIdForCheckout))
    const ownRefunds = await api('/checkouts')
    assert.ok(ownRefunds.body.every(item => item.tenant_id === tenantIdForCheckout))
    const proof = await fetch(`${base}/checkouts/${refund.id}/refund-proof`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(proof.status, 200)
    assert.equal(proof.headers.get('content-type'), 'application/pdf')
    const notifications = await api('/notifications')
    assert.ok(notifications.body.some(item => item.notification_type === 'deposit_refund'))
  })

  await t.test('general reports calculate remittance rules and export sortable Excel', async () => {
    const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@1234' } })
    token = adminLogin.body.token
    const invoice = await issueConfiguredInvoice(tenantId,'2026-09-05',[
      { itemType: 'room', description: 'ค่าเช่าห้องพัก', quantity: 1, unitPrice: 1000 },
      { itemType: 'water', description: 'ค่าน้ำประปา', quantity: 1, unitPrice: 100 },
      { itemType: 'electricity', description: 'ค่าไฟฟ้า', quantity: 1, unitPrice: 200 },
      { itemType: 'late_fee', description: 'ค่าปรับชำระล่าช้า', quantity: 1, unitPrice: 100 },
      { itemType: 'deposit', description: 'เงินประกันห้องพัก', quantity: 1, unitPrice: 2000 },
      { itemType: 'food_beverage', description: 'ค่าอาหารและเครื่องดื่ม', quantity: 1, unitPrice: 500 },
    ])
    assert.equal(invoice.response.status, 201)
    const paid = await api('/payments', { method: 'POST', body: { invoiceId: invoice.body.id, amount: 3900, method: 'cash', referenceNo: 'REPORT-001', paidAt: '2026-09-01T09:00:00.000Z' } })
    assert.equal(paid.response.status, 201)
    const dailyRemittance = await api('/remittances', { method: 'POST', body: { date: '2026-09-01', holdingStatementAmount:3900, cashDepositReference:'CASH-DEP-REPORT' } })
    assert.equal(dailyRemittance.response.status, 201)

    const policies=await api('/revenue-share-policies')
    assert.ok(policies.body.some(row=>row.item_type==='room'&&row.reclaim_rate===0.8&&row.university_rate===0.2))
    const invalidPolicy=await api('/revenue-share-policies',{method:'POST',body:{code:'INVALID_SPLIT',itemType:'room',revenueGroup:'ทดสอบ',revenueName:'ทดสอบ',reclaimRate:0.7,universityRate:0.2,startsAt:'2027-01-01'}})
    assert.equal(invalidPolicy.response.status,400)
    const futurePolicy=await api('/revenue-share-policies',{method:'POST',body:{code:'DORM_ROOM_NEW',itemType:'room',revenueGroup:'รายได้หอพัก',revenueName:'ค่าห้องพัก',reclaimRate:0.7,universityRate:0.3,startsAt:'2026-10-01'}})
    assert.equal(futurePolicy.response.status,201)
    const futureInvoice=await issueConfiguredInvoice(tenantId,'2026-10-05',[{itemType:'room',description:'ค่าห้องพัก',quantity:1,unitPrice:100}])
    assert.equal(futureInvoice.response.status,201)
    const futurePayment=await api('/payments',{method:'POST',body:{invoiceId:futureInvoice.body.id,amount:100,method:'transfer',referenceNo:'POLICY-NEW',paidAt:'2026-10-02T09:00:00.000Z'}})
    assert.equal(futurePayment.response.status,201)
    const futureRemittance=await api('/reports/general?type=revenue-remittance&from=2026-10-01&to=2026-10-31')
    assert.ok(futureRemittance.body.rows.some(row=>row.policy_code==='DORM_ROOM_NEW'&&row.reclaim_amount===70&&row.university_amount===30))

    const utilities = await api('/reports/general?type=utilities&from=2026-09-01&to=2026-09-30&period=monthly')
    assert.equal(utilities.response.status, 200)
    assert.equal(utilities.body.rows[0].water, 100)
    assert.equal(utilities.body.rows[0].electricity, 200)
    const remittance = await api('/reports/general?type=revenue-remittance&from=2026-09-01&to=2026-09-30')
    assert.equal(remittance.response.status, 200)
    assert.ok(remittance.body.rows.some(row => row.revenue_type === 'ค่าห้องพัก' && row.reclaim_amount === 800 && row.university_amount === 200))
    assert.ok(remittance.body.rows.some(row => row.revenue_type === 'ค่าน้ำประปา' && row.university_amount === 100))
    assert.ok(remittance.body.rows.some(row => row.revenue_type === 'ค่าอาหารและเครื่องดื่ม' && row.reclaim_amount === 500 && row.university_amount === 0))
    const dailyRevenue=await api('/reports/general?type=revenue-remittance&from=2026-09-01&to=2026-09-01')
    assert.equal(dailyRevenue.body.rows.reduce((sum,row)=>sum+row.full_amount,0),dailyRemittance.body.revenue_amount)
    assert.equal(dailyRevenue.body.rows.reduce((sum,row)=>sum+row.reclaim_amount+row.university_amount,0),dailyRemittance.body.revenue_amount)
    const depositSnapshot=await api('/reports/general?type=deposits-balance&from=2026-09-15&to=2026-09-30')
    assert.ok(depositSnapshot.body.rows.some(row=>row.tenant_code==='ST690001'&&row.received>=2000))

    const issuer = await api('/reports/general?type=receipts-by-issuer&from=2026-09-01&to=2026-09-30')
    assert.equal(issuer.response.status, 200)
    assert.ok(issuer.body.rows.some(row => row.issuer === 'ผู้ดูแลระบบ' && row.amount === 4150))
    const daily = await api('/reports/general?type=daily-payment-summary&from=2026-09-01&to=2026-09-30')
    assert.deepEqual(daily.body.rows[0], { payment_date: '2026-09-01', transaction_count: 1, receipt_count: 1, amount: 3900 })
    const remittanceRegister = await api('/reports/general?type=daily-remittance-register&from=2026-09-01&to=2026-09-30')
    assert.ok(remittanceRegister.body.rows.some(row => row.remittance_no === dailyRemittance.body.remittance_no))
    const receiptRegister = await api('/reports/general?type=receipt-register&from=2026-09-01&to=2026-09-30')
    assert.ok(receiptRegister.body.rows.some(row => row.receipt_no === paid.body.receipt.receipt_no && row.tenant_code === 'ST690001'))
    const paymentStatus = await api('/reports/general?type=student-staff-payment-status&from=2026-09-01&to=2026-09-30')
    assert.ok(paymentStatus.body.rows.some(row => row.tenant_code === 'ST690001' && row.billed >= 3900 && row.paid >= 3900 && ['ชำระแล้ว', 'ชำระบางส่วน', 'ค้างชำระ'].includes(row.payment_status)))

    const response = await fetch(`${base}/reports/general/export.xlsx?type=utilities&from=2026-09-01&to=2026-09-30`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const workbook = Buffer.from(await response.arrayBuffer())
    assert.equal(workbook.subarray(0, 2).toString(), 'PK')
    assert.ok(workbook.length > 5000)
    const parsedWorkbook = await XlsxPopulate.fromDataAsync(workbook)
    assert.equal(parsedWorkbook.sheet('รายงาน').cell('A5').value(), 'งวดรับชำระ')
    const catalog=await api('/reports/catalog')
    for(const definition of catalog.body){const exported=await fetch(`${base}/reports/general/export.xlsx?type=${definition.type}&from=2026-01-01&to=2026-12-31&period=monthly`,{headers:{authorization:`Bearer ${token}`}});assert.equal(exported.status,200,definition.type);assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0,2).toString(),'PK',definition.type)}
  })

  await t.test('announcements respect room audience and comment setting', async () => {
    const allRooms = await api('/announcements', { method: 'POST', body: { title: 'แจ้งทดสอบส่วนกลาง', body: 'ข้อความสำหรับผู้เช่าทุกห้อง', audienceType: 'all', commentsEnabled: true, publish: true } })
    assert.equal(allRooms.response.status, 201)
    const roomOnly = await api('/announcements', { method: 'POST', body: { title: 'แจ้งเฉพาะห้อง', body: 'ข้อความที่ผู้ย้ายออกไม่ควรเห็น', audienceType: 'room', roomId: occupiedRoomId, commentsEnabled: false, publish: true } })
    assert.equal(roomOnly.response.status, 201)
    const activeMessage = await api('/announcements', { method: 'POST', body: { title: 'ใบแจ้งหนี้ใหม่', body: 'กรุณาตรวจสอบรายการของคุณ', audienceType: 'all', commentsEnabled: false, publish: true, messageType: 'invoice', entityId: 1, expiresAt: '2099-12-31T23:59:59.000Z' } })
    const expiredMessage = await api('/announcements', { method: 'POST', body: { title: 'ข้อความหมดอายุ', body: 'ต้องไม่แสดงหลังล็อกอิน', audienceType: 'all', commentsEnabled: false, publish: true, messageType: 'overdue', expiresAt: '2020-01-01T00:00:00.000Z' } })

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    token = tenantLogin.body.token
    const visible = await api('/announcements')
    assert.equal(visible.response.status, 200)
    assert.ok(visible.body.some(item => item.id === allRooms.body.id))
    assert.ok(visible.body.some(item => item.id === activeMessage.body.id && item.message_type === 'invoice'))
    assert.ok(!visible.body.some(item => item.id === expiredMessage.body.id))
    assert.ok(!visible.body.some(item => item.id === roomOnly.body.id))
    const comment = await api(`/announcements/${allRooms.body.id}/comments`, { method: 'POST', body: { body: 'รับทราบประกาศแล้ว' } })
    assert.equal(comment.response.status, 201)
    const comments = await api(`/announcements/${allRooms.body.id}/comments`)
    assert.equal(comments.body.length, 1)
    const hiddenComment = await api(`/announcements/${roomOnly.body.id}/comments`, { method: 'POST', body: { body: 'ไม่ควรส่งได้' } })
    assert.equal(hiddenComment.response.status, 404)
  })
})
