import { z } from 'zod'
import { requirePermission } from './auth.js'
import { writeAudit } from './audit.js'
import { notifyTenant } from './notifications.js'
import { requireUtilityRate } from './utilityRates.js'

const idSchema = z.coerce.number().int().positive()
function validate(schema, value) { const result = schema.safeParse(value); if (result.success) return result.data; throw Object.assign(new Error(result.error.issues.map(x => x.message).join(', ')), { status: 400, code: 'VALIDATION_ERROR' }) }
function fail(status, code, message) { throw Object.assign(new Error(message), { status, code }) }
function getById(db, table, id) { return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) }
function transaction(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error } }
function requestNo(db) { const date = new Date().toISOString().slice(0, 10).replaceAll('-', ''); const count = db.prepare(`SELECT COUNT(*) count FROM checkout_requests WHERE request_no LIKE ?`).get(`COR-${date}-%`).count + 1; return `COR-${date}-${String(count).padStart(5, '0')}` }
function outstandingDebt(db, tenantId) { return Number(db.prepare(`SELECT COALESCE(SUM(balance),0) amount FROM invoices WHERE tenant_id=? AND status NOT IN ('paid','cancelled')`).get(tenantId).amount.toFixed(2)) }

const detailSql = `SELECT cr.*,t.tenant_code,t.tenant_type,t.first_name,t.last_name,t.email,r.room_no,b.bed_no,bu.name building_name,l.contract_no,l.deposit_amount,
  u1.display_name debt_checked_by_name,u2.display_name room_inspected_by_name,u3.display_name approved_by_name,i.invoice_no final_invoice_no
  FROM checkout_requests cr JOIN tenants t ON t.id=cr.tenant_id LEFT JOIN leases l ON l.id=cr.lease_id LEFT JOIN beds b ON b.id=cr.bed_id
  LEFT JOIN rooms r ON r.id=cr.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings bu ON bu.id=f.building_id
  LEFT JOIN users u1 ON u1.id=cr.debt_checked_by LEFT JOIN users u2 ON u2.id=cr.room_inspected_by LEFT JOIN users u3 ON u3.id=cr.approved_by
  LEFT JOIN invoices i ON i.id=cr.final_invoice_id`

function requestDetail(db, id) { return db.prepare(`${detailSql} WHERE cr.id=?`).get(id) }
function canAccess(user, row) { return !user.tenant_id || user.tenant_id === row.tenant_id }
function currentRate(db, type, date) { return requireUtilityRate(db, type, date) }
function previousReading(db, roomId, type) { return db.prepare(`SELECT current_reading FROM meter_readings WHERE room_id=? AND utility_type=? ORDER BY billing_month DESC,id DESC LIMIT 1`).get(roomId, type)?.current_reading ?? 0 }

export function registerCheckoutRoutes(app, db) {
  app.get('/api/checkout-requests', requirePermission('checkouts.read'), (req, res) => {
    const where = req.user.tenant_id ? 'WHERE cr.tenant_id=?' : ''
    res.json(db.prepare(`${detailSql} ${where} ORDER BY CASE cr.status WHEN 'submitted' THEN 0 WHEN 'debt_checked' THEN 1 WHEN 'inspected' THEN 2 ELSE 3 END,cr.id DESC`).all(...(req.user.tenant_id ? [req.user.tenant_id] : [])))
  })

  app.post('/api/checkout-requests', requirePermission('checkouts.create'), async (req, res, next) => {
    try {
      if (!req.user.tenant_id) fail(403, 'TENANT_ONLY', 'คำขอย้ายออกต้องยื่นจากบัญชีผู้เช่า')
      const body = validate(z.object({ requestedCheckoutDate: z.iso.date(), reason: z.string().trim().min(5).max(2000) }), req.body)
      if (db.prepare(`SELECT id FROM checkout_requests WHERE tenant_id=? AND status IN ('submitted','debt_checked','inspected')`).get(req.user.tenant_id)) fail(409, 'ACTIVE_REQUEST_EXISTS', 'มีคำขอย้ายออกที่กำลังดำเนินการอยู่แล้ว')
      const stay = db.prepare(`SELECT l.id lease_id,l.bed_id,b.room_id FROM leases l LEFT JOIN beds b ON b.id=l.bed_id WHERE l.tenant_id=? AND l.status='active' ORDER BY l.id DESC LIMIT 1`).get(req.user.tenant_id)
      if (!stay?.bed_id) fail(409, 'NO_ACTIVE_STAY', 'ไม่พบการเข้าพักที่ยื่นคำขอย้ายออกได้')
      const result = db.prepare(`INSERT INTO checkout_requests(request_no,tenant_id,lease_id,bed_id,room_id,requested_checkout_date,reason) VALUES (?,?,?,?,?,?,?)`)
        .run(requestNo(db), req.user.tenant_id, stay.lease_id, stay.bed_id, stay.room_id, body.requestedCheckoutDate, body.reason)
      const created = requestDetail(db, Number(result.lastInsertRowid))
      writeAudit(db, req, { action: 'CHECKOUT_REQUESTED', entityType: 'checkout_request', entityId: created.id, after: created })
      res.status(201).json(created)
    } catch (error) { next(error) }
  })

  app.post('/api/checkout-requests/:id/debt-review', requirePermission('checkouts.manage'), async (req, res, next) => {
    try {
      const id = validate(idSchema, req.params.id), before = requestDetail(db, id)
      if (!before) fail(404, 'NOT_FOUND', 'ไม่พบคำขอย้ายออก')
      if (before.status !== 'submitted') fail(409, 'INVALID_STATUS', 'ตรวจหนี้ได้เฉพาะคำขอใหม่')
      const debt = outstandingDebt(db, before.tenant_id)
      db.prepare(`UPDATE checkout_requests SET outstanding_debt=?,debt_checked_at=CURRENT_TIMESTAMP,debt_checked_by=?,status='debt_checked',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(debt, req.user.id, id)
      const after = requestDetail(db, id)
      await notifyTenant(db, { tenantId: after.tenant_id, type: 'checkout_debt_review', title: 'ตรวจสอบคำขอย้ายออกแล้ว', message: debt > 0 ? `พบยอดค้างชำระ ${debt.toFixed(2)} บาท กรุณาชำระก่อนอนุมัติย้ายออก` : 'ไม่พบยอดค้างชำระ เจ้าหน้าที่จะนัดตรวจห้องต่อไป', entityType: 'checkout_request', entityId: id })
      writeAudit(db, req, { action: 'DEBT_REVIEWED', entityType: 'checkout_request', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })

  app.post('/api/checkout-requests/:id/inspection', requirePermission('checkouts.manage'), async (req, res, next) => {
    try {
      const id = validate(idSchema, req.params.id), before = requestDetail(db, id)
      if (!before) fail(404, 'NOT_FOUND', 'ไม่พบคำขอย้ายออก')
      if (before.status !== 'debt_checked') fail(409, 'INVALID_STATUS', 'ต้องตรวจหนี้ก่อนตรวจห้อง')
      const body = validate(z.object({ inspectionNote: z.string().trim().min(1).max(2000), waterReading: z.number().nonnegative(), electricityReading: z.number().nonnegative(), damageDetail: z.string().max(2000).nullable().optional(), damageAmount: z.number().nonnegative().default(0) }), req.body)
      const waterPrevious = previousReading(db, before.room_id, 'water'), electricPrevious = previousReading(db, before.room_id, 'electricity')
      if (body.waterReading < waterPrevious || body.electricityReading < electricPrevious) fail(400, 'METER_READING_REVERSED', 'เลขมิเตอร์วันย้ายออกต้องไม่น้อยกว่าเลขครั้งล่าสุด')
      const waterRate = currentRate(db, 'water', before.requested_checkout_date), electricRate = currentRate(db, 'electricity', before.requested_checkout_date)
      const waterAmount = Number(Math.max((body.waterReading - waterPrevious) * waterRate.unit_rate, waterRate.minimum_charge).toFixed(2))
      const electricAmount = Number(Math.max((body.electricityReading - electricPrevious) * electricRate.unit_rate, electricRate.minimum_charge).toFixed(2))
      const deposit = Number(before.deposit_amount || 0), excessDamage = Math.max(0, body.damageAmount - deposit), utilityAmount = Number((waterAmount + electricAmount).toFixed(2)), invoiceTotal = Number((utilityAmount + excessDamage).toFixed(2))
      const finalInvoiceId = transaction(db, () => {
        let invoiceId = null
        if (invoiceTotal > 0) {
          const invoiceNo = `INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(db.prepare(`SELECT COUNT(*) count FROM invoices WHERE invoice_no LIKE ?`).get(`INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-%`).count + 1).padStart(5,'0')}`
          const invoice = db.prepare(`INSERT INTO invoices(invoice_no,tenant_id,due_date,total,balance,created_by) VALUES (?,?,?,?,?,?)`).run(invoiceNo, before.tenant_id, before.requested_checkout_date, invoiceTotal, invoiceTotal, req.user.id)
          invoiceId = Number(invoice.lastInsertRowid)
          if (waterAmount > 0) db.prepare(`INSERT INTO invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) VALUES (?,'water',?,1,?,?)`).run(invoiceId, 'ค่าน้ำประปารอบสุดท้ายก่อนย้ายออก', waterAmount, waterAmount)
          if (electricAmount > 0) db.prepare(`INSERT INTO invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) VALUES (?,'electricity',?,1,?,?)`).run(invoiceId, 'ค่าไฟฟ้ารอบสุดท้ายก่อนย้ายออก', electricAmount, electricAmount)
          if (excessDamage > 0) db.prepare(`INSERT INTO invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) VALUES (?,'damage',?,1,?,?)`).run(invoiceId, 'ค่าความเสียหายส่วนเกินเงินประกัน', excessDamage, excessDamage)
        }
        db.prepare(`UPDATE checkout_requests SET status='inspected',room_inspected_at=CURRENT_TIMESTAMP,room_inspected_by=?,inspection_note=?,final_water_reading=?,final_electricity_reading=?,final_utility_amount=?,damage_detail=?,damage_amount=?,final_invoice_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(req.user.id, body.inspectionNote, body.waterReading, body.electricityReading, utilityAmount, body.damageDetail || null, body.damageAmount, invoiceId, id)
        return invoiceId
      })
      const after = requestDetail(db, id)
      await notifyTenant(db, { tenantId: after.tenant_id, type: 'checkout_inspection', title: 'สรุปการตรวจห้องก่อนย้ายออก', message: `ค่าสาธารณูปโภครอบสุดท้าย ${utilityAmount.toFixed(2)} บาท ความเสียหาย ${body.damageAmount.toFixed(2)} บาท${finalInvoiceId ? ' กรุณาตรวจสอบใบแจ้งหนี้ในระบบ' : ''}`, entityType: 'checkout_request', entityId: id })
      writeAudit(db, req, { action: 'ROOM_INSPECTED', entityType: 'checkout_request', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })

  app.post('/api/checkout-requests/:id/approve', requirePermission('checkouts.manage'), async (req, res, next) => {
    try {
      const id = validate(idSchema, req.params.id), before = requestDetail(db, id)
      if (!before) fail(404, 'NOT_FOUND', 'ไม่พบคำขอย้ายออก')
      if (before.status !== 'inspected') fail(409, 'INVALID_STATUS', 'ต้องตรวจห้องและมิเตอร์ก่อนอนุมัติ')
      const debt = outstandingDebt(db, before.tenant_id)
      if (debt > 0) fail(409, 'OUTSTANDING_DEBT', `ยังมียอดค้างชำระ ${debt.toFixed(2)} บาท`)
      const deposit = Number(before.deposit_amount || 0), refund = Math.max(0, Number((deposit - before.damage_amount).toFixed(2)))
      const checkoutId = transaction(db, () => {
        const checkout = db.prepare(`INSERT INTO checkouts(tenant_id,lease_id,bed_id,checkout_date,damage_detail,damage_amount,outstanding_debt,deposit_amount,refund_amount,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(before.tenant_id, before.lease_id, before.bed_id, before.requested_checkout_date, before.damage_detail, before.damage_amount, 0, deposit, refund, req.user.id)
        db.prepare(`UPDATE beds SET status='vacant',tenant_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(before.bed_id)
        db.prepare(`UPDATE leases SET status='expired',ends_at=? WHERE id=?`).run(before.requested_checkout_date, before.lease_id)
        db.prepare(`UPDATE rooms SET readiness_status='not_ready',readiness_confirmed_at=NULL,readiness_confirmed_by=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(before.room_id)
        db.prepare(`UPDATE checkout_requests SET status='approved',approved_at=CURRENT_TIMESTAMP,approved_by=?,completed_checkout_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.user.id, checkout.lastInsertRowid, id)
        return Number(checkout.lastInsertRowid)
      })
      const after = requestDetail(db, id)
      await notifyTenant(db, { tenantId: after.tenant_id, type: 'checkout_approved', title: 'อนุมัติการลาออกจากหอพักแล้ว', message: `อนุมัติย้ายออกวันที่ ${after.requested_checkout_date} ยอดเงินประกันคงเหลือรอคืน ${refund.toFixed(2)} บาท`, entityType: 'checkout', entityId: checkoutId })
      writeAudit(db, req, { action: 'CHECKOUT_APPROVED', entityType: 'checkout_request', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })

  app.post('/api/checkout-requests/:id/reject', requirePermission('checkouts.manage'), async (req, res, next) => {
    try { const id = validate(idSchema, req.params.id), before = requestDetail(db, id); if (!before) fail(404, 'NOT_FOUND', 'ไม่พบคำขอย้ายออก'); if (!['submitted','debt_checked'].includes(before.status)) fail(409, 'INVALID_STATUS', 'ส่งกลับได้ก่อนบันทึกผลตรวจห้องเท่านั้น'); const { reason } = validate(z.object({ reason: z.string().trim().min(5).max(2000) }), req.body); db.prepare(`UPDATE checkout_requests SET status='rejected',rejected_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason, id); const after = requestDetail(db, id); await notifyTenant(db, { tenantId: after.tenant_id, type: 'checkout_rejected', title: 'คำขอย้ายออกต้องแก้ไข', message: reason, entityType: 'checkout_request', entityId: id }); writeAudit(db, req, { action: 'CHECKOUT_REJECTED', entityType: 'checkout_request', entityId: id, before, after }); res.json(after) } catch (error) { next(error) }
  })

  app.get('/api/checkouts', requirePermission('checkouts.read'), (req, res) => {
    const where = req.user.tenant_id ? 'WHERE c.tenant_id=?' : ''
    res.json(db.prepare(`SELECT c.id,c.tenant_id,c.lease_id,c.checkout_date,c.damage_detail,c.damage_amount,c.outstanding_debt,c.deposit_amount,c.refund_amount,c.status,c.refund_transfer_status,c.refund_transfer_reference,c.refund_transferred_at,c.refund_proof_filename,c.refund_notified_at,c.created_at,t.tenant_code,t.first_name,t.last_name FROM checkouts c JOIN tenants t ON t.id=c.tenant_id ${where} ORDER BY c.id DESC`).all(...(req.user.tenant_id ? [req.user.tenant_id] : [])))
  })

  app.post('/api/checkouts/:id/refund-transfer', requirePermission('checkouts.manage'), async (req, res, next) => {
    try {
      const id = validate(idSchema, req.params.id), before = getById(db, 'checkouts', id)
      if (!before) fail(404, 'NOT_FOUND', 'ไม่พบรายการคืนเงินประกัน')
      if (before.refund_transfer_status === 'transferred') fail(409, 'ALREADY_TRANSFERRED', 'บันทึกผลการโอนแล้ว')
      const body = validate(z.object({ referenceNo: z.string().trim().min(3).max(200), transferredAt: z.iso.datetime(), filename: z.string().min(1).max(255), mimeType: z.enum(['image/jpeg','image/png','application/pdf']), fileBase64: z.string().min(20).max(4_200_000) }), req.body)
      db.prepare(`UPDATE checkouts SET refund_transfer_status='transferred',refund_transfer_reference=?,refund_transferred_at=?,refund_proof_filename=?,refund_proof_mime_type=?,refund_proof_base64=?,refund_notified_at=CURRENT_TIMESTAMP WHERE id=?`).run(body.referenceNo, body.transferredAt, body.filename, body.mimeType, body.fileBase64, id)
      const after = getById(db, 'checkouts', id)
      await notifyTenant(db, { tenantId: after.tenant_id, type: 'deposit_refund', title: 'โอนคืนเงินประกันห้องพักแล้ว', message: `ยอดคืน ${after.refund_amount.toFixed(2)} บาท เลขอ้างอิง ${body.referenceNo} กรุณาตรวจสอบหลักฐานในระบบ`, entityType: 'checkout', entityId: id })
      writeAudit(db, req, { action: 'DEPOSIT_REFUND_TRANSFERRED', entityType: 'checkout', entityId: id, before: { ...before, refund_proof_base64: undefined }, after: { ...after, refund_proof_base64: '[REDACTED]' } })
      res.json({ ...after, refund_proof_base64: undefined })
    } catch (error) { next(error) }
  })

  app.get('/api/checkouts/:id/refund-proof', requirePermission('checkouts.read'), (req, res, next) => {
    try { const row = getById(db, 'checkouts', validate(idSchema, req.params.id)); if (!row || !canAccess(req.user, row) || !row.refund_proof_base64) fail(404, 'NOT_FOUND', 'ไม่พบหลักฐานการคืนเงิน'); res.set({ 'content-type': row.refund_proof_mime_type, 'content-disposition': `inline; filename="${row.refund_proof_filename.replace(/["\r\n]/g, '_')}"`, 'cache-control': 'private, no-store' }).send(Buffer.from(row.refund_proof_base64, 'base64')) } catch (error) { next(error) }
  })
}
