import test from 'node:test'
import assert from 'node:assert/strict'
import XlsxPopulate from 'xlsx-populate'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'

test('critical dormitory backend flows', async (t) => {
  const db = createDb(':memory:')
  const server = createApp({ db }).listen(0, '127.0.0.1')
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
    const policies = await api('/rate-policies')
    assert.equal(policies.response.status, 200)
    assert.ok(policies.body.some(item => item.code === 'ST68_TERM' && item.amount === 8000))
    const roomRate = await api('/rate-plans', { method: 'POST', body: { name: 'นักศึกษา 2569 รายภาคเรียน', rentalPeriod: 'term', tenantType: 'student', amount: 8000, startsAt: '2026-06-01', endsAt: '2027-05-31' } })
    assert.equal(roomRate.response.status, 201)
    assert.equal(roomRate.body.rental_period, 'term')
    const utilityRate = await api('/utility-rates', { method: 'POST', body: { utilityType: 'water', unitRate: 23, minimumCharge: 0, startsAt: '2026-06-01', endsAt: null } })
    assert.equal(utilityRate.response.status, 201)
    assert.equal(utilityRate.body.unit_rate, 23)
    const fee = await api('/fee-types', { method: 'POST', body: { code: 'DAMAGE', name: 'ค่าปรับทรัพย์สินเสียหาย', defaultAmount: 0 } })
    assert.equal(fee.response.status, 201)
    const configuredRates = await api('/rate-plans')
    assert.ok(configuredRates.body.some(item => item.id === roomRate.body.id && item.starts_at === '2026-06-01'))
    const imported = await api('/master-data/province/import', { method: 'POST', body: { rows: [{ code: '10', name: 'กรุงเทพมหานคร' }] } })
    assert.equal(imported.response.status, 201)
    assert.equal(imported.body.imported, 1)
    const buildings = await api('/master-data/building')
    const floor = await api('/master-data/floor', { method: 'POST', body: { code: 'PRAMOTE1-F1', name: 'ชั้น 1', parentId: buildings.body.find(item => item.code === 'PRAMOTE1').id } })
    assert.equal(floor.response.status, 201)
    const floors = await api('/master-data/floor')
    assert.ok(floors.body.some(item => item.code === 'PRAMOTE1-F1' && item.parent_name === 'อาคารปราโมทย์ 1'))
  })

  let tenantId
  await t.test('create tenant and portal account with password policy', async () => {
    const created = await api('/tenants', { method: 'POST', body: { tenantCode: 'ST690001', tenantType: 'student', firstName: 'สมหญิง', lastName: 'เรียนดี', email: 'student@example.test', currentAddress: 'มหาวิทยาลัยตัวอย่าง' } })
    assert.equal(created.response.status, 201)
    tenantId = created.body.id

    const weak = await api(`/tenants/${tenantId}/portal-account`, { method: 'POST', body: { username: 'st690001', password: 'short' } })
    assert.equal(weak.response.status, 400)
    const missingUppercase = await api(`/tenants/${tenantId}/portal-account`, { method: 'POST', body: { username: 'st690001', password: 'student@123' } })
    assert.equal(missingUppercase.response.status, 400)
    const valid = await api(`/tenants/${tenantId}/portal-account`, { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    assert.equal(valid.response.status, 201)
    assert.equal(valid.body.tenant_id, tenantId)
  })

  let invoiceId
  let receiptId
  await t.test('issue invoice, receive payment and issue receipt', async () => {
    const invoice = await api('/invoices', { method: 'POST', body: { tenantId, dueDate: '2026-08-15', items: [
      { itemType: 'room', description: 'ค่าห้องพัก ภาคเรียน 1/2569', quantity: 1, unitPrice: 8500 },
      { itemType: 'deposit', description: 'เงินประกันห้องพัก', quantity: 1, unitPrice: 3000 },
    ] } })
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
    const invoice = await api('/invoices', { method: 'POST', body: { tenantId, dueDate: '2026-08-25', items: [
      { itemType: 'room', description: 'ค่าห้องพัก สิงหาคม 2569', quantity: 1, unitPrice: 3000 },
      { itemType: 'deposit', description: 'เงินประกันห้องพัก', quantity: 1, unitPrice: 2000 },
    ] } })
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
    const remittance = await api('/remittances', { method: 'POST', body: { date: '2026-08-20' } })
    assert.equal(remittance.response.status, 201)
    assert.equal(remittance.body.revenue_amount, 3000)
    assert.equal(remittance.body.deposit_amount, 2000)
    assert.equal(remittance.body.cash_amount, 2000)
    assert.equal(remittance.body.transfer_amount, 3000)
    const submitted = await api(`/remittances/${remittance.body.id}/submit`, { method: 'POST', body: {} })
    assert.equal(submitted.body.status, 'submitted')
    const missingTransfer = await api(`/remittances/${remittance.body.id}/approve`, { method: 'POST', body: { universityReceiptNo: 'SDU-001' } })
    assert.equal(missingTransfer.response.status, 400)
    const approved = await api(`/remittances/${remittance.body.id}/approve`, { method: 'POST', body: { revenueTransferReference: 'REV-001', depositTransferReference: 'DEP-001', universityReceiptNo: 'SDU-001' } })
    assert.equal(approved.body.status, 'approved')
    const noReason = await api(`/remittances/${remittance.body.id}/cancel`, { method: 'POST', body: { reason: '' } })
    assert.equal(noReason.response.status, 400)
    const cancelled = await api(`/remittances/${remittance.body.id}/cancel`, { method: 'POST', body: { reason: 'ยกเลิกเพื่อแก้ไขเลขที่ใบเสร็จมหาวิทยาลัย' } })
    assert.equal(cancelled.body.status, 'cancelled')
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
    const reserved = await api('/reservations', { method: 'POST', body: { tenantId, scope: 'bed', roomId: firstBed.room_id, bedId: firstBed.id, startsAt: '2026-08-01', endsAt: '2026-12-31' } })
    assert.equal(reserved.response.status, 201)
    assert.match(reserved.body.reservation_no, /^RSV-/)
    const occupied = await api(`/beds/${firstBed.id}/status`, { method: 'PATCH', body: { status: 'occupied', tenantId } })
    assert.equal(occupied.response.status, 200)
    const missing = await api('/contracts/missing')
    assert.ok(missing.body.some(item => item.id === tenantId))
    const contract = await api('/contracts', { method: 'POST', body: { contractNo: 'CT-690001', tenantId, bedId: firstBed.id, contractType: 'STUDENT_TERM', contractDate: '2026-07-30', rentalPeriod: 'term', startsAt: '2026-08-01', endsAt: '2026-12-31', advanceRent: 8000, minimumTermMonths: 4, depositAmount: 2000 } })
    assert.equal(contract.response.status, 201)
    assert.equal(contract.body.document_status, 'draft')
    const sent = await api(`/contracts/${contract.body.id}/send`, { method: 'POST', body: {} })
    assert.equal(sent.response.status, 200)
    assert.equal(sent.body.email_status, 'queued')
    const pending = await api('/contracts/pending-signatures')
    assert.ok(pending.body.some(item => item.id === contract.body.id))

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    token = tenantLogin.body.token
    const ownContracts = await api('/contracts')
    assert.equal(ownContracts.response.status, 200)
    assert.equal(ownContracts.body.length, 1)
    const wrongSignature = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: 'Wrong@123', confirmed: true } })
    assert.equal(wrongSignature.response.status, 401)
    const signed = await api(`/contracts/${contract.body.id}/sign`, { method: 'POST', body: { password: 'Student@123', confirmed: true } })
    assert.equal(signed.response.status, 200)
    assert.equal(signed.body.document_status, 'signed')
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
    const immutable = await api(`/contracts/${contract.body.id}`, { method: 'PATCH', body: { endsAt: '2027-01-31' } })
    assert.equal(immutable.response.status, 409)

    const afterReserve = await api('/beds?availability=available&bedCount=2')
    const target = afterReserve.body.find(x => x.room_id !== firstBed.room_id)
    const moved = await api('/room-transfers', { method: 'POST', body: { tenantId, toBedId: target.id, transferDate: '2026-08-10', reason: 'ย้ายตามคำร้องของผู้พักอาศัย' } })
    assert.equal(moved.response.status, 201)
    occupiedRoomId = target.room_id

    const meter = await api('/meter-readings', { method: 'POST', body: { roomId: target.room_id, utilityType: 'electricity', billingMonth: '2026-08', previousReading: 100, currentReading: 110, unitRate: 7, dueDate: '2026-09-05', issueInvoices: true } })
    assert.equal(meter.response.status, 201)
    assert.equal(meter.body.amount_per_bed, 35)
    assert.equal(meter.body.invoice_ids.length, 1)

    const checkout = await api('/checkouts', { method: 'POST', body: { tenantId, checkoutDate: '2026-08-31', damageDetail: 'โต๊ะมีรอยขีดข่วน', damageAmount: 500 } })
    assert.equal(checkout.response.status, 201)
    assert.equal(checkout.body.refund_amount, 1500)
    assert.ok(checkout.body.outstanding_debt >= 35)
    const inspected = await api(`/rooms/${target.room_id}/readiness`, { method: 'POST', body: { ready: true, checklist: { cleanliness: true, electricity: true, water: true, furniture: true } } })
    assert.equal(inspected.response.status, 200)
    assert.equal(inspected.body.readiness_status, 'ready')
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
    const otherInvoice = await api('/invoices', { method: 'POST', body: { tenantId: otherTenant.body.id, dueDate: '2026-09-05', items: [{ itemType: 'room', description: 'ค่าเช่าของผู้เช่าคนอื่น', quantity: 1, unitPrice: 5000 }] } })
    assert.equal(otherInvoice.response.status, 201)
    const otherRepair = await api('/repairs', { method: 'POST', body: { roomId: occupiedRoomId, tenantId: otherTenant.body.id, source: 'staff', title: 'งานซ่อมของผู้เช่าคนอื่น', detail: 'ใช้ทดสอบการแยกข้อมูล', priority: 'normal' } })
    assert.equal(otherRepair.response.status, 201)

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'st690001', password: 'Student@123' } })
    token = tenantLogin.body.token
    const summary = await api('/tenant-portal/summary')
    assert.equal(summary.response.status, 200)
    assert.equal(summary.body.id, tenantId)

    const ownInvoices = await api('/invoices')
    assert.ok(ownInvoices.body.every(item => item.tenant_id === tenantId))
    assert.ok(!ownInvoices.body.some(item => item.id === otherInvoice.body.id))
    const crossTenantProof = await api('/payment-proofs', { method: 'POST', body: { invoiceId: otherInvoice.body.id, amount: 5000, referenceNo: 'INVALID-CROSS-TENANT', paidAt: '2026-09-01T10:00:00.000Z', filename: 'proof.pdf', mimeType: 'application/pdf', fileBase64: Buffer.from('cross tenant proof').toString('base64') } })
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
    await api('/reservations', { method: 'POST', body: { tenantId: tenantIdForCheckout, scope: 'bed', roomId: bed.room_id, bedId: bed.id, startsAt: '2026-09-01', endsAt: '2026-12-31' } })
    await api(`/beds/${bed.id}/status`, { method: 'PATCH', body: { status: 'occupied', tenantId: tenantIdForCheckout } })
    const contract = await api('/contracts', { method: 'POST', body: { contractNo: 'CT-690099', tenantId: tenantIdForCheckout, bedId: bed.id, contractType: 'STUDENT_TERM', contractDate: '2026-08-30', rentalPeriod: 'term', startsAt: '2026-09-01', endsAt: '2026-12-31', advanceRent: 8000, minimumTermMonths: 4, depositAmount: 2000 } })
    assert.equal(contract.response.status, 201)

    const tenantLogin = await api('/auth/login', { method: 'POST', body: { username: 'checkout99', password: 'Checkout@123' } })
    token = tenantLogin.body.token
    assert.ok(tenantLogin.body.user.permissions.includes('checkouts.create'))
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
    assert.equal(inspection.body.final_utility_amount, 300)
    const blocked = await api(`/checkout-requests/${request.body.id}/approve`, { method: 'POST' })
    assert.equal(blocked.response.status, 409)
    const finalPayment = await api('/payments', { method: 'POST', body: { invoiceId: inspection.body.final_invoice_id, amount: 300, method: 'transfer', referenceNo: 'FINAL-UTIL-001' } })
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
    const invoice = await api('/invoices', { method: 'POST', body: { tenantId, dueDate: '2026-09-05', items: [
      { itemType: 'room', description: 'ค่าเช่าห้องพัก', quantity: 1, unitPrice: 1000 },
      { itemType: 'water', description: 'ค่าน้ำประปา', quantity: 1, unitPrice: 100 },
      { itemType: 'electricity', description: 'ค่าไฟฟ้า', quantity: 1, unitPrice: 200 },
      { itemType: 'late_fee', description: 'ค่าปรับชำระล่าช้า', quantity: 1, unitPrice: 100 },
      { itemType: 'deposit', description: 'เงินประกันห้องพัก', quantity: 1, unitPrice: 2000 },
      { itemType: 'food_beverage', description: 'ค่าอาหารและเครื่องดื่ม', quantity: 1, unitPrice: 500 },
    ] } })
    assert.equal(invoice.response.status, 201)
    const paid = await api('/payments', { method: 'POST', body: { invoiceId: invoice.body.id, amount: 3900, method: 'cash', referenceNo: 'REPORT-001', paidAt: '2026-09-01T09:00:00.000Z' } })
    assert.equal(paid.response.status, 201)
    const dailyRemittance = await api('/remittances', { method: 'POST', body: { date: '2026-09-01' } })
    assert.equal(dailyRemittance.response.status, 201)

    const utilities = await api('/reports/general?type=utilities&from=2026-09-01&to=2026-09-30&period=monthly')
    assert.equal(utilities.response.status, 200)
    assert.equal(utilities.body.rows[0].water, 100)
    assert.equal(utilities.body.rows[0].electricity, 200)
    const remittance = await api('/reports/general?type=revenue-remittance&from=2026-09-01&to=2026-09-30')
    assert.equal(remittance.response.status, 200)
    assert.ok(remittance.body.rows.some(row => row.revenue_type === 'ค่าห้องพัก' && row.reclaim_amount === 800 && row.university_amount === 200))
    assert.ok(remittance.body.rows.some(row => row.revenue_type === 'ค่าน้ำประปา' && row.university_amount === 100))
    assert.ok(remittance.body.rows.some(row => row.revenue_type === 'ค่าอาหารและเครื่องดื่ม' && row.reclaim_amount === 500 && row.university_amount === 0))

    const issuer = await api('/reports/general?type=receipts-by-issuer&from=2026-09-01&to=2026-09-30')
    assert.equal(issuer.response.status, 200)
    assert.ok(issuer.body.rows.some(row => row.issuer === 'ผู้ดูแลระบบ' && row.amount === 3900))
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
