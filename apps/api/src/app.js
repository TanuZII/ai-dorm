import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createDb, cleanupAuditLogs, syncSpaceMasterData } from './db.js'
import { authRequired, issueToken, loadUser, requirePermission, verifyCredentials } from './auth.js'
import { writeAudit } from './audit.js'
import { ldapConfigured } from './ldap.js'
import { randomUUID } from 'node:crypto'
import { createContractPdf, sha256 } from './contractPdf.js'
import { createInvoicePdf, createReceiptPdf } from './financePdf.js'
import { emailConfigured, sendContractSignatureEmail, sendInvoiceEmail } from './email.js'
import { buildReport, createReportXlsx, reportCatalog } from './reports.js'
import { registerAnnouncementRoutes } from './announcements.js'
import { registerCheckoutRoutes } from './checkouts.js'
import { notifyTenant } from './notifications.js'

const passwordSchema = z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(128)
  .regex(/[A-Z]/, 'ต้องมีอักษรพิมพ์ใหญ่อย่างน้อย 1 ตัว')
  .regex(/[a-z]/, 'ต้องมีอักษรพิมพ์เล็กอย่างน้อย 1 ตัว')
  .regex(/[^A-Za-z0-9]/, 'ต้องมีอักขระพิเศษอย่างน้อย 1 ตัว')
const idSchema = z.coerce.number().int().positive()
const loginAttempts = new Map()
const masterCategories = new Set(['title','country','province','district','subdistrict','tenant_type','room_type','building','floor','room','bed','academic_year','rental_type','contract_type','fee_type','faculty','major'])

function validate(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) {
    const error = new Error(result.error.issues.map(x => `${x.path.join('.') || 'data'}: ${x.message}`).join(', '))
    error.status = 400
    error.code = 'VALIDATION_ERROR'
    throw error
  }
  return result.data
}

function getById(db, table, id, extra = '') {
  return db.prepare(`SELECT * FROM ${table} WHERE id=? ${extra}`).get(id)
}

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try { const value = fn(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error }
}

function numberId(req) { return validate(idSchema, req.params.id) }
function httpError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error }
function nextDocumentNo(db, table, column, prefix) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const count = db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${column} LIKE ?`).get(`${prefix}-${date}-%`).count + 1
  return `${prefix}-${date}-${String(count).padStart(5, '0')}`
}

function tenantRateCohort(tenant) {
  if (tenant.tenant_type === 'staff') return 'STAFF'
  if (tenant.tenant_type === 'external') return 'EXTERNAL'
  const admissionYear = Number(String(tenant.tenant_code).match(/\d{2}/)?.[0])
  return admissionYear >= 68 ? 'STUDENT_68_PLUS' : 'STUDENT_64_67'
}

function tenantTypeSystemValue(code) {
  if (code === 'STUDENT') return 'student'
  if (code === 'STAFF') return 'staff'
  return 'external'
}

const contractDetailSql = `SELECT l.*,previous.contract_no previous_contract_no,t.tenant_code,t.tenant_type,t.title,t.first_name,t.last_name,t.national_id,
  t.email,t.phone,t.current_address,t.faculty,t.department,t.program,t.major,t.organization,t.line_id,
  t.guardian_name,t.guardian_phone,t.guardian_email,t.guardian_line_id,
  t.emergency_contact_name,t.emergency_contact_phone,t.emergency_contact_relation,
  r.room_no,b.bed_no,bu.name building_name
  FROM leases l LEFT JOIN leases previous ON previous.id=l.previous_lease_id JOIN tenants t ON t.id=l.tenant_id LEFT JOIN beds b ON b.id=l.bed_id
  LEFT JOIN rooms r ON r.id=b.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings bu ON bu.id=f.building_id`

function getContractDetails(db, id) { return db.prepare(`${contractDetailSql} WHERE l.id=?`).get(id) }
function canAccessContract(user, contract) { return user.permissions.includes('tenants.read') || (user.tenant_id && user.tenant_id === contract.tenant_id) }
function writeContractEvent(db, req, leaseId, eventType, detail = {}) {
  db.prepare(`INSERT INTO contract_events(lease_id,event_type,actor_id,actor_username,detail_json,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)`)
    .run(leaseId,eventType,req.user.id,req.user.username,JSON.stringify(detail),req.ip,req.get('user-agent')||null)
}

function createContractInvoice(db, contract, createdBy) {
  const existing = db.prepare(`SELECT * FROM invoices WHERE contract_id=?`).get(contract.id)
  if (existing) return existing
  const items = []
  if (Number(contract.advance_rent) > 0) items.push({ itemType: 'room', description: `ค่าเช่าจ่ายล่วงหน้าตามสัญญา ${contract.contract_no}`, amount: Number(contract.advance_rent) })
  if (!contract.previous_lease_id && Number(contract.deposit_amount) > 0) items.push({ itemType: 'deposit', description: `เงินประกันแรกเข้าตามสัญญา ${contract.contract_no}`, amount: Number(contract.deposit_amount) })
  if (!items.length) return null
  const total = Number(items.reduce((sum, item) => sum + item.amount, 0).toFixed(2))
  const result = db.prepare(`INSERT INTO invoices(invoice_no,tenant_id,due_date,total,balance,contract_id,created_by) VALUES (?,?,?,?,?,?,?)`)
    .run(nextDocumentNo(db,'invoices','invoice_no','INV'),contract.tenant_id,contract.starts_at,total,total,contract.id,createdBy)
  const invoiceId = Number(result.lastInsertRowid)
  const insertItem = db.prepare(`INSERT INTO invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) VALUES (?,?,?,1,?,?)`)
  for (const item of items) insertItem.run(invoiceId,item.itemType,item.description,item.amount,item.amount)
  return getById(db,'invoices',invoiceId)
}

function renewalAlertDate(endsAt, rentalPeriod) {
  const end = new Date(`${endsAt}T00:00:00Z`)
  if (rentalPeriod === 'monthly') return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 25))
  if (rentalPeriod === 'term') return new Date(end.getTime() - 30 * 86400000)
  if (rentalPeriod === 'yearly') return new Date(end.getTime() - 60 * 86400000)
  return null
}

export function createApp(options = {}) {
  const db = options.db || createDb()
  const app = express()
  app.locals.db = db
  app.locals.integrations = options.integrations || {}
  app.locals.integrationConfig = options.integrationConfig || {
    simulationEnabled: false,
    mode: 'real',
    callbackSecret: null,
    directoryPassword: null,
  }
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: false }))
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'sqlite', ldapConfigured: ldapConfigured(), emailConfigured: emailConfigured(), auditRetentionDays: Math.max(90, Number(process.env.AUDIT_RETENTION_DAYS) || 90) }))

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const body = validate(z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(128) }), req.body)
      const key = `${req.ip}:${body.username.toLowerCase()}`
      const attempt = loginAttempts.get(key)
      if (attempt?.blockedUntil > Date.now()) throw httpError(429, 'TOO_MANY_ATTEMPTS', 'เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที')
      const user = await verifyCredentials(db, body.username, body.password)
      if (!user) {
        const failures = (attempt?.failures || 0) + 1
        loginAttempts.set(key, { failures, blockedUntil: failures >= 5 ? Date.now() + 15 * 60_000 : 0 })
        writeAudit(db, req, { action: 'LOGIN_FAILED', entityType: 'auth', entityId: body.username })
        throw httpError(401, 'INVALID_CREDENTIALS', 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง')
      }
      loginAttempts.delete(key)
      req.user = user
      writeAudit(db, req, { action: 'LOGIN_SUCCESS', entityType: 'auth', entityId: user.id })
      res.json({ token: issueToken(user), user })
    } catch (error) { next(error) }
  })

  app.use('/api', authRequired(db))
  app.get('/api/auth/me', (req, res) => res.json(req.user))
  app.post('/api/auth/change-password', async (req, res, next) => {
    try {
      if (req.user.auth_source !== 'local') throw httpError(409, 'LDAP_PASSWORD', 'ผู้ใช้งาน LDAP ต้องเปลี่ยนรหัสผ่านผ่านระบบกลางของมหาวิทยาลัย')
      const body = validate(z.object({ currentPassword: z.string(), newPassword: passwordSchema }), req.body)
      const row = db.prepare(`SELECT password_hash FROM users WHERE id=?`).get(req.user.id)
      if (!await bcrypt.compare(body.currentPassword, row.password_hash)) throw httpError(400, 'WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง')
      db.prepare(`UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(await bcrypt.hash(body.newPassword, 12), req.user.id)
      writeAudit(db, req, { action: 'PASSWORD_CHANGED', entityType: 'user', entityId: req.user.id })
      res.status(204).end()
    } catch (error) { next(error) }
  })

  // Users, groups and permissions
  app.get('/api/users', requirePermission('users.read'), (req, res) => {
    const rows = db.prepare(`SELECT u.id,u.username,u.display_name,u.email,u.auth_source,u.status,u.tenant_id,u.created_at,u.updated_at,(SELECT a.created_at FROM audit_logs a WHERE a.actor_id=u.id AND a.action='LOGIN_SUCCESS' ORDER BY a.id DESC LIMIT 1) last_login_at FROM users u WHERE u.deleted_at IS NULL ORDER BY u.id DESC`).all()
    res.json(rows.map(row => ({ ...row, roles: db.prepare(`SELECT r.id,r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?`).all(row.id) })))
  })
  app.post('/api/users', requirePermission('users.manage'), async (req, res, next) => {
    try {
      const body = validate(z.object({
        username: z.string().min(3).max(100), displayName: z.string().min(1).max(200),
        email: z.email().nullable().optional(), authSource: z.enum(['local','ldap']).default('local'),
        password: passwordSchema.optional(), roleIds: z.array(idSchema).default([]), tenantId: idSchema.nullable().optional(),
      }).refine(x => x.authSource === 'ldap' || x.password, { message: 'ผู้ใช้ local ต้องกำหนดรหัสผ่าน', path: ['password'] }), req.body)
      const result = transaction(db, () => {
        const insert = db.prepare(`INSERT INTO users(username,password_hash,display_name,email,auth_source,tenant_id) VALUES (?,?,?,?,?,?)`).run(
          body.username, body.password ? bcrypt.hashSync(body.password, 12) : null, body.displayName, body.email || null, body.authSource, body.tenantId || null,
        )
        for (const roleId of body.roleIds) db.prepare(`INSERT INTO user_roles(user_id,role_id) VALUES (?,?)`).run(insert.lastInsertRowid, roleId)
        return Number(insert.lastInsertRowid)
      })
      const user = loadUser(db, result)
      writeAudit(db, req, { action: 'CREATE', entityType: 'user', entityId: result, after: user })
      res.status(201).json(user)
    } catch (error) { next(error) }
  })
  app.patch('/api/users/:id', requirePermission('users.manage'), (req, res, next) => {
    try {
      const id = numberId(req)
      const before = loadUser(db, id)
      if (!before) throw httpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้งาน')
      const body = validate(z.object({ displayName: z.string().min(1).max(200).optional(), email: z.email().nullable().optional(), status: z.enum(['active','disabled']).optional(), roleIds: z.array(idSchema).optional() }), req.body)
      transaction(db, () => {
        db.prepare(`UPDATE users SET display_name=COALESCE(?,display_name),email=CASE WHEN ? THEN ? ELSE email END,status=COALESCE(?,status),updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(body.displayName || null, Object.hasOwn(body, 'email') ? 1 : 0, body.email || null, body.status || null, id)
        if (body.roleIds) {
          db.prepare(`DELETE FROM user_roles WHERE user_id=?`).run(id)
          for (const roleId of body.roleIds) db.prepare(`INSERT INTO user_roles(user_id,role_id) VALUES (?,?)`).run(id, roleId)
        }
      })
      const after = loadUser(db, id)
      writeAudit(db, req, { action: 'UPDATE', entityType: 'user', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })
  app.post('/api/users/:id/reset-password', requirePermission('users.manage'), async (req, res, next) => {
    try {
      const id = numberId(req); const user = getById(db, 'users', id, 'AND deleted_at IS NULL')
      if (!user) throw httpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้งาน')
      if (user.auth_source === 'ldap') throw httpError(409, 'LDAP_PASSWORD', 'ผู้ใช้ LDAP ต้องรีเซ็ตรหัสผ่านผ่านระบบกลาง')
      const { newPassword } = validate(z.object({ newPassword: passwordSchema }), req.body)
      db.prepare(`UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(await bcrypt.hash(newPassword, 12), id)
      writeAudit(db, req, { action: 'PASSWORD_RESET', entityType: 'user', entityId: id })
      res.status(204).end()
    } catch (error) { next(error) }
  })
  app.delete('/api/users/:id', requirePermission('users.manage'), (req, res, next) => {
    try {
      const id = numberId(req)
      if (id === req.user.id) throw httpError(409, 'SELF_DELETE', 'ไม่สามารถลบบัญชีที่กำลังใช้งาน')
      const before = loadUser(db, id); if (!before) throw httpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้งาน')
      const { reason } = validate(z.object({ reason: z.string().min(5).max(1000) }), req.body)
      db.prepare(`UPDATE users SET deleted_at=CURRENT_TIMESTAMP,status='disabled',cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,id)
      writeAudit(db, req, { action: 'CANCEL', entityType: 'user', entityId: id, before, after:{status:'disabled',reason} })
      res.status(204).end()
    } catch (error) { next(error) }
  })

  app.get('/api/roles', requirePermission('roles.read'), (_req, res) => {
    const roles = db.prepare(`SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY name`).all()
    res.json(roles.map(role => ({ ...role, permissions: db.prepare(`SELECT p.id,p.code,p.name FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=? ORDER BY p.code`).all(role.id) })))
  })
  app.post('/api/roles', requirePermission('roles.manage'), (req, res, next) => {
    try {
      const body = validate(z.object({ name: z.string().min(1).max(100), description: z.string().max(500).optional(), permissionIds: z.array(idSchema).default([]) }), req.body)
      const id = transaction(db, () => {
        const result = db.prepare(`INSERT INTO roles(name,description) VALUES (?,?)`).run(body.name, body.description || null)
        for (const permissionId of body.permissionIds) db.prepare(`INSERT INTO role_permissions(role_id,permission_id) VALUES (?,?)`).run(result.lastInsertRowid, permissionId)
        return Number(result.lastInsertRowid)
      })
      const after = getById(db, 'roles', id)
      writeAudit(db, req, { action: 'CREATE', entityType: 'role', entityId: id, after })
      res.status(201).json(after)
    } catch (error) { next(error) }
  })
  app.patch('/api/roles/:id', requirePermission('roles.manage'), (req, res, next) => {
    try {
      const id = numberId(req); const before = getById(db, 'roles', id, 'AND deleted_at IS NULL')
      if (!before) throw httpError(404, 'NOT_FOUND', 'ไม่พบกลุ่มผู้ใช้งาน')
      const body = validate(z.object({ name: z.string().min(1).max(100).optional(), description: z.string().max(500).nullable().optional(), permissionIds: z.array(idSchema).optional() }), req.body)
      transaction(db, () => {
        db.prepare(`UPDATE roles SET name=COALESCE(?,name),description=CASE WHEN ? THEN ? ELSE description END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(body.name || null, Object.hasOwn(body, 'description') ? 1 : 0, body.description || null, id)
        if (body.permissionIds) { db.prepare(`DELETE FROM role_permissions WHERE role_id=?`).run(id); for (const permissionId of body.permissionIds) db.prepare(`INSERT INTO role_permissions(role_id,permission_id) VALUES (?,?)`).run(id, permissionId) }
      })
      const after = getById(db, 'roles', id)
      writeAudit(db, req, { action: 'UPDATE', entityType: 'role', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })
  app.delete('/api/roles/:id', requirePermission('roles.manage'), (req, res, next) => {
    try {
      const id = numberId(req); const before = getById(db, 'roles', id, 'AND deleted_at IS NULL')
      if (!before) throw httpError(404, 'NOT_FOUND', 'ไม่พบกลุ่มผู้ใช้งาน')
      const { reason } = validate(z.object({ reason: z.string().min(5).max(1000) }), req.body)
      const members = db.prepare(`SELECT COUNT(*) count FROM user_roles WHERE role_id=?`).get(id).count
      db.prepare(`UPDATE roles SET deleted_at=CURRENT_TIMESTAMP,status='disabled',cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,id)
      writeAudit(db, req, { action: 'CANCEL', entityType: 'role', entityId: id, before, after:{status:'disabled',reason,members} })
      res.status(204).end()
    } catch (error) { next(error) }
  })
  app.get('/api/permissions', requirePermission('roles.read'), (_req, res) => res.json(db.prepare(`SELECT * FROM permissions ORDER BY code`).all()))
  app.patch('/api/permissions/:id', requirePermission('roles.manage'), (req, res, next) => {
    try {
      const id = numberId(req); const before = getById(db, 'permissions', id); if (!before) throw httpError(404, 'NOT_FOUND', 'ไม่พบสิทธิ์')
      const body = validate(z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(500).nullable().optional() }), req.body)
      db.prepare(`UPDATE permissions SET name=COALESCE(?,name),description=CASE WHEN ? THEN ? ELSE description END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(body.name || null, Object.hasOwn(body, 'description') ? 1 : 0, body.description || null, id)
      const after = getById(db, 'permissions', id)
      writeAudit(db, req, { action: 'UPDATE', entityType: 'permission', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })

  app.get('/api/audit-logs', requirePermission('audit.read'), (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100))
    const filters = []; const params = []
    if (req.query.actor) { filters.push('actor_username LIKE ?'); params.push(`%${req.query.actor}%`) }
    if (req.query.action) { filters.push('action=?'); params.push(req.query.action) }
    if (req.query.entityType) { filters.push('entity_type=?'); params.push(req.query.entityType) }
    if (req.query.from) { filters.push('created_at>=?'); params.push(req.query.from) }
    if (req.query.to) { filters.push('created_at<=?'); params.push(req.query.to) }
    res.json(db.prepare(`SELECT * FROM audit_logs ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`).all(...params, limit))
  })

  app.post('/api/master-data/sync-space', requirePermission('master.manage'), (req,res,next)=>{
    try{const result=syncSpaceMasterData(db);writeAudit(db,req,{action:'SYNC',entityType:'master.space',after:result});res.json(result)}catch(error){next(error)}
  })

  app.get('/api/master-data/:category', requirePermission('master.read'), (req,res,next)=>{
    try{if(!masterCategories.has(req.params.category))throw httpError(404,'UNKNOWN_CATEGORY','ไม่พบหมวดข้อมูลพื้นฐาน');const rows=db.prepare(`SELECT m.*,p.name parent_name FROM master_data m LEFT JOIN master_data p ON p.id=m.parent_id WHERE m.category=? ORDER BY m.active DESC,m.name`).all(req.params.category).map(x=>({...x,details:x.details_json?JSON.parse(x.details_json):null}));res.json(rows)}catch(error){next(error)}
  })
  app.post('/api/master-data/:category', requirePermission('master.manage'), (req,res,next)=>{
    try{if(!masterCategories.has(req.params.category))throw httpError(404,'UNKNOWN_CATEGORY','ไม่พบหมวดข้อมูลพื้นฐาน');const b=validate(z.object({code:z.string().min(1).max(50),name:z.string().min(1).max(300),parentId:idSchema.nullable().optional(),details:z.record(z.string(),z.unknown()).nullable().optional()}),req.body);const result=db.prepare(`INSERT INTO master_data(category,code,name,parent_id,details_json) VALUES (?,?,?,?,?)`).run(req.params.category,b.code,b.name,b.parentId||null,b.details?JSON.stringify(b.details):null);const after=getById(db,'master_data',Number(result.lastInsertRowid));writeAudit(db,req,{action:'CREATE',entityType:`master.${req.params.category}`,entityId:after.id,after});res.status(201).json(after)}catch(error){next(error)}
  })
  app.post('/api/master-data/:category/import', requirePermission('master.manage'), (req,res,next)=>{
    try{if(!masterCategories.has(req.params.category))throw httpError(404,'UNKNOWN_CATEGORY','ไม่พบหมวดข้อมูลพื้นฐาน');const{rows}=validate(z.object({rows:z.array(z.object({code:z.string().min(1).max(50),name:z.string().min(1).max(300),parentCode:z.string().max(50).nullable().optional(),details:z.record(z.string(),z.unknown()).nullable().optional()})).min(1).max(10000)}),req.body);const result=transaction(db,()=>{let imported=0;for(const row of rows){let parentId=null;if(row.parentCode){const parent=db.prepare(`SELECT id FROM master_data WHERE code=? AND active=1 ORDER BY id DESC LIMIT 1`).get(row.parentCode);if(!parent)throw httpError(400,'PARENT_NOT_FOUND',`ไม่พบข้อมูลแม่รหัส ${row.parentCode}`);parentId=parent.id}db.prepare(`INSERT INTO master_data(category,code,name,parent_id,details_json) VALUES (?,?,?,?,?) ON CONFLICT(category,code) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,details_json=excluded.details_json,active=1,updated_at=CURRENT_TIMESTAMP`).run(req.params.category,row.code,row.name,parentId,row.details?JSON.stringify(row.details):null);imported++}return imported});writeAudit(db,req,{action:'BULK_IMPORT',entityType:`master.${req.params.category}`,after:{rowCount:result}});res.status(201).json({imported:result})}catch(error){next(error)}
  })
  app.patch('/api/master-data/:category/:id', requirePermission('master.manage'), (req,res,next)=>{
    try{const id=numberId(req),before=getById(db,'master_data',id);if(!before||before.category!==req.params.category)throw httpError(404,'NOT_FOUND','ไม่พบข้อมูลพื้นฐาน');const b=validate(z.object({name:z.string().min(1).max(300).optional(),parentId:idSchema.nullable().optional(),details:z.record(z.string(),z.unknown()).nullable().optional(),active:z.boolean().optional(),reason:z.string().min(5).max(1000).optional()}),req.body);if(b.active===false&&!b.reason)throw httpError(400,'REASON_REQUIRED','ต้องระบุเหตุผลการยกเลิกใช้งาน');db.prepare(`UPDATE master_data SET name=COALESCE(?,name),parent_id=CASE WHEN ? THEN ? ELSE parent_id END,details_json=CASE WHEN ? THEN ? ELSE details_json END,active=COALESCE(?,active),cancellation_reason=CASE WHEN ?=0 THEN ? ELSE cancellation_reason END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.name||null,Object.hasOwn(b,'parentId')?1:0,b.parentId||null,Object.hasOwn(b,'details')?1:0,b.details?JSON.stringify(b.details):null,Object.hasOwn(b,'active')?(b.active?1:0):null,b.active===false?0:1,b.reason||null,id);const after=getById(db,'master_data',id);writeAudit(db,req,{action:'UPDATE',entityType:`master.${req.params.category}`,entityId:id,before,after});res.json(after)}catch(error){next(error)}
  })
  app.delete('/api/master-data/:category/:id', requirePermission('master.manage'), (req,res,next)=>{
    try{const id=numberId(req),before=getById(db,'master_data',id);if(!before||before.category!==req.params.category)throw httpError(404,'NOT_FOUND','ไม่พบข้อมูลพื้นฐาน');const{reason}=validate(z.object({reason:z.string().min(5).max(1000)}),req.body);const children=db.prepare(`SELECT COUNT(*) count FROM master_data WHERE parent_id=? AND active=1`).get(id).count;if(children)throw httpError(409,'DATA_IN_USE',`ข้อมูลนี้มีรายการย่อยใช้งานอยู่ ${children} รายการ`);db.prepare(`UPDATE master_data SET active=0,cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,id);writeAudit(db,req,{action:'CANCEL',entityType:`master.${req.params.category}`,entityId:id,before,after:{active:0,reason}});res.status(204).end()}catch(error){next(error)}
  })

  app.get('/api/rate-policies', requirePermission('master.read'), (_req,res)=>res.json(db.prepare(`SELECT * FROM rate_policies ORDER BY active DESC,tenant_cohort,rental_period`).all()))
  app.post('/api/rate-policies', requirePermission('master.manage'), (req,res,next)=>{try{const schema=z.object({code:z.string().min(1),name:z.string().min(1),tenantCohort:z.string().min(1),rentalPeriod:z.enum(['daily','monthly','term','yearly']),rateScope:z.enum(['person','room']),amount:z.number().nonnegative(),occupancyLimit:z.number().int().positive().default(2),utilitySplitDivisor:z.number().int().positive().default(1),waterRate:z.number().nonnegative().default(23),electricityRate:z.number().nonnegative().default(7),depositAmount:z.number().nonnegative().default(2000),dueDay:z.number().int().min(1).max(31).default(5),lateFee:z.number().nonnegative().default(100),delinquencyMonths:z.number().int().positive().default(1),terminationAction:z.string().optional(),startsAt:z.iso.date(),endsAt:z.iso.date().nullable().optional()});const b=validate(schema,req.body);const result=db.prepare(`INSERT INTO rate_policies(code,name,tenant_cohort,rental_period,rate_scope,amount,occupancy_limit,utility_split_divisor,water_rate,electricity_rate,deposit_amount,due_day,late_fee,delinquency_months,termination_action,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.code,b.name,b.tenantCohort,b.rentalPeriod,b.rateScope,b.amount,b.occupancyLimit,b.utilitySplitDivisor,b.waterRate,b.electricityRate,b.depositAmount,b.dueDay,b.lateFee,b.delinquencyMonths,b.terminationAction||null,b.startsAt,b.endsAt||null);const after=getById(db,'rate_policies',Number(result.lastInsertRowid));writeAudit(db,req,{action:'CREATE',entityType:'rate_policy',entityId:after.id,after});res.status(201).json(after)}catch(error){next(error)}})
  app.patch('/api/rate-policies/:id', requirePermission('master.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'rate_policies',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบนโยบายค่าเช่า');const b=validate(z.object({amount:z.number().nonnegative().optional(),waterRate:z.number().nonnegative().optional(),electricityRate:z.number().nonnegative().optional(),depositAmount:z.number().nonnegative().optional(),dueDay:z.number().int().min(1).max(31).optional(),lateFee:z.number().nonnegative().optional(),endsAt:z.iso.date().nullable().optional(),active:z.boolean().optional(),reason:z.string().min(5).optional()}).refine(x=>x.active!==false||x.reason,{message:'ต้องระบุเหตุผลการยกเลิก',path:['reason']}),req.body);const map={amount:'amount',waterRate:'water_rate',electricityRate:'electricity_rate',depositAmount:'deposit_amount',dueDay:'due_day',lateFee:'late_fee',endsAt:'ends_at',active:'active',reason:'cancellation_reason'};const entries=Object.entries(b);if(entries.length){const set=entries.map(([k])=>`${map[k]}=?`).join(',');db.prepare(`UPDATE rate_policies SET ${set},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([k,v])=>k==='active'?(v?1:0):v),id)}const after=getById(db,'rate_policies',id);writeAudit(db,req,{action:'UPDATE',entityType:'rate_policy',entityId:id,before,after});res.json(after)}catch(error){next(error)}})

  // Tenants and accommodation
  const tenantBody = z.object({ tenantCode: z.string().min(1).max(50), tenantType: z.enum(['student','staff','external']), tenantTypeCode:z.string().min(1).max(50).optional(), title: z.string().max(30).optional(), firstName: z.string().min(1), lastName: z.string().min(1), nationalId: z.string().max(30).optional(), email: z.email().optional(), phone: z.string().max(30).optional(), currentAddress: z.string().max(1000).optional(), faculty: z.string().max(200).optional(), department: z.string().max(200).optional(), program:z.string().max(200).optional(),major:z.string().max(200).optional(),organization:z.string().max(300).optional(),lineId:z.string().max(100).optional(),guardianName:z.string().max(200).optional(),guardianPhone:z.string().max(30).optional(),guardianEmail:z.email().optional(),guardianLineId:z.string().max(100).optional(),emergencyContactName:z.string().max(200).optional(),emergencyContactPhone:z.string().max(30).optional(),emergencyContactRelation:z.string().max(100).optional() })
  app.get('/api/tenants', requirePermission('tenants.read'), (_req, res) => res.json(db.prepare(`SELECT t.*,COALESCE(mt.name,CASE t.tenant_type WHEN 'student' THEN 'นักศึกษา' WHEN 'staff' THEN 'บุคลากร' ELSE 'บุคคลภายนอก' END) tenant_type_name,r.room_no,b.bed_no,bu.name building_name,l.id lease_id,l.contract_no,l.starts_at contract_starts_at,l.ends_at contract_ends_at,l.document_status contract_document_status FROM tenants t LEFT JOIN master_data mt ON mt.category='tenant_type' AND mt.code=t.tenant_type_code LEFT JOIN beds b ON b.tenant_id=t.id AND b.status IN ('reserved','occupied') LEFT JOIN rooms r ON r.id=b.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings bu ON bu.id=f.building_id LEFT JOIN leases l ON l.tenant_id=t.id AND l.status='active' WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY t.id DESC`).all()))
  app.get('/api/tenants/options', requirePermission('tenants.read'), (_req,res)=>{const rows=category=>db.prepare(`SELECT id,code,name,parent_id FROM master_data WHERE category=? AND active=1 ORDER BY name`).all(category);res.json({tenantTypes:rows('tenant_type').map(item=>({...item,system_type:tenantTypeSystemValue(item.code)})),titles:rows('title'),faculties:rows('faculty'),majors:rows('major')})})
  app.get('/api/tenant-portal/summary', (req,res,next)=>{try{if(!req.user.tenant_id)throw httpError(403,'TENANT_ONLY','หน้านี้สำหรับบัญชีผู้พักเท่านั้น');const tenant=db.prepare(`SELECT t.*,r.id room_id,r.room_no,b.bed_no,bu.name building_name,l.id lease_id,l.contract_no,l.contract_type,l.rental_period,l.starts_at contract_starts_at,l.ends_at contract_ends_at,l.document_status contract_document_status FROM tenants t LEFT JOIN beds b ON b.tenant_id=t.id AND b.status IN ('reserved','occupied') LEFT JOIN rooms r ON r.id=b.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings bu ON bu.id=f.building_id LEFT JOIN leases l ON l.tenant_id=t.id AND l.status='active' WHERE t.id=? ORDER BY l.id DESC LIMIT 1`).get(req.user.tenant_id);if(!tenant)throw httpError(404,'NOT_FOUND','ไม่พบข้อมูลผู้พัก');const finance=db.prepare(`SELECT COALESCE(SUM(balance),0) outstanding_balance,COUNT(CASE WHEN balance>0 AND status!='cancelled' THEN 1 END) outstanding_invoices FROM invoices WHERE tenant_id=?`).get(req.user.tenant_id);const pendingProofs=db.prepare(`SELECT COUNT(*) count FROM payment_proofs WHERE tenant_id=? AND status='pending'`).get(req.user.tenant_id).count;const openRepairs=db.prepare(`SELECT COUNT(*) count FROM repairs WHERE tenant_id=? AND workflow_status NOT IN ('completed','closed')`).get(req.user.tenant_id).count;res.json({...tenant,...finance,pending_proofs:pendingProofs,open_repairs:openRepairs})}catch(error){next(error)}})
  app.post('/api/tenants', requirePermission('tenants.manage'), (req, res, next) => {
    try {
      const b = validate(tenantBody, req.body)
      const tenantTypeCode=b.tenantTypeCode||b.tenantType.toUpperCase(),masterType=db.prepare(`SELECT code FROM master_data WHERE category='tenant_type' AND code=? AND active=1`).get(tenantTypeCode);if(!masterType)throw httpError(400,'INVALID_TENANT_TYPE','ไม่พบประเภทผู้เช่าที่ใช้งานในข้อมูลพื้นฐาน')
      const result = db.prepare(`INSERT INTO tenants(tenant_code,tenant_type,tenant_type_code,title,first_name,last_name,national_id,email,phone,current_address,faculty,department,program,major,organization,line_id,guardian_name,guardian_phone,guardian_email,guardian_line_id,emergency_contact_name,emergency_contact_phone,emergency_contact_relation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.tenantCode,tenantTypeSystemValue(tenantTypeCode),tenantTypeCode,b.title||null,b.firstName,b.lastName,b.nationalId||null,b.email||null,b.phone||null,b.currentAddress||null,b.faculty||null,b.department||null,b.program||null,b.major||null,b.organization||null,b.lineId||null,b.guardianName||null,b.guardianPhone||null,b.guardianEmail||null,b.guardianLineId||null,b.emergencyContactName||null,b.emergencyContactPhone||null,b.emergencyContactRelation||null)
      const after = getById(db, 'tenants', Number(result.lastInsertRowid)); writeAudit(db, req, { action:'CREATE',entityType:'tenant',entityId:after.id,after }); res.status(201).json(after)
    } catch (error) { next(error) }
  })
  app.patch('/api/tenants/:id', requirePermission('tenants.manage'), (req, res, next) => {
    try {
      const id=numberId(req), before=getById(db,'tenants',id,'AND deleted_at IS NULL'); if(!before) throw httpError(404,'NOT_FOUND','ไม่พบผู้เช่า')
      const b=validate(tenantBody.partial(),req.body)
      if(b.tenantTypeCode){const masterType=db.prepare(`SELECT code FROM master_data WHERE category='tenant_type' AND code=? AND active=1`).get(b.tenantTypeCode);if(!masterType)throw httpError(400,'INVALID_TENANT_TYPE','ไม่พบประเภทผู้เช่าที่ใช้งานในข้อมูลพื้นฐาน');b.tenantType=tenantTypeSystemValue(b.tenantTypeCode)}
      const map={tenantCode:'tenant_code',tenantType:'tenant_type',tenantTypeCode:'tenant_type_code',title:'title',firstName:'first_name',lastName:'last_name',nationalId:'national_id',email:'email',phone:'phone',currentAddress:'current_address',faculty:'faculty',department:'department',program:'program',major:'major',organization:'organization',lineId:'line_id',guardianName:'guardian_name',guardianPhone:'guardian_phone',guardianEmail:'guardian_email',guardianLineId:'guardian_line_id',emergencyContactName:'emergency_contact_name',emergencyContactPhone:'emergency_contact_phone',emergencyContactRelation:'emergency_contact_relation'}
      const entries=Object.entries(b); if(entries.length){const set=entries.map(([key])=>`${map[key]}=?`).join(',');db.prepare(`UPDATE tenants SET ${set},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([,v])=>v??null),id)}
      const after=getById(db,'tenants',id);writeAudit(db,req,{action:'UPDATE',entityType:'tenant',entityId:id,before,after});res.json(after)
    } catch(error){next(error)}
  })
  app.post('/api/tenants/:id/portal-account', requirePermission('users.manage'), async (req,res,next)=>{
    try{
      const tenantId=numberId(req), tenant=getById(db,'tenants',tenantId,'AND deleted_at IS NULL');if(!tenant)throw httpError(404,'NOT_FOUND','ไม่พบผู้เช่า')
      const b=validate(z.object({username:z.string().min(3),password:passwordSchema}),req.body)
      const result=db.prepare(`INSERT INTO users(username,password_hash,display_name,email,tenant_id) VALUES (?,?,?,?,?)`).run(b.username,await bcrypt.hash(b.password,12),`${tenant.first_name} ${tenant.last_name}`,tenant.email,tenantId)
      const role=db.prepare(`SELECT id FROM roles WHERE name='ผู้เช่า' AND deleted_at IS NULL`).get() || (()=>{const r=db.prepare(`INSERT INTO roles(name,description) VALUES ('ผู้เช่า','เข้าถึงข้อมูลของตนเองผ่าน Portal')`).run();return{id:Number(r.lastInsertRowid)}})()
      db.prepare(`INSERT INTO user_roles(user_id,role_id) VALUES (?,?)`).run(result.lastInsertRowid,role.id)
      db.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code IN ('repairs.read','repairs.create','contracts.read','contracts.sign','finance.read','announcements.read','announcements.comment','checkouts.read','checkouts.create')`).run(role.id)
      writeAudit(db,req,{action:'CREATE_PORTAL_ACCOUNT',entityType:'tenant',entityId:tenantId,after:{username:b.username}});res.status(201).json(loadUser(db,Number(result.lastInsertRowid)))
    }catch(error){next(error)}
  })
  app.get('/api/integrations/students/:studentId', requirePermission('tenants.manage'), (_req,res)=>res.status(501).json({error:'INTEGRATION_NOT_CONFIGURED',message:'ยังไม่ได้กำหนด Student Service URL และ credentials ของมหาวิทยาลัย'}))
  app.post('/api/tenants/:id/documents', requirePermission('tenants.manage'), (req,res,next)=>{try{const tenantId=numberId(req);if(!getById(db,'tenants',tenantId,'AND deleted_at IS NULL'))throw httpError(404,'NOT_FOUND','ไม่พบผู้เช่า');const b=validate(z.object({documentType:z.enum(['company_certificate','identity','other']),filename:z.string().min(1).max(255),mimeType:z.enum(['application/pdf','image/jpeg','image/png']),base64:z.string().min(1)}),req.body);const data=Buffer.from(b.base64,'base64');if(!data.length||data.length>1_500_000)throw httpError(400,'FILE_SIZE','ไฟล์ต้องมีขนาดไม่เกิน 1.5 MB');const result=db.prepare(`INSERT INTO tenant_documents(tenant_id,document_type,filename,mime_type,file_data,sha256,uploaded_by) VALUES (?,?,?,?,?,?,?)`).run(tenantId,b.documentType,b.filename,b.mimeType,data,sha256(data),req.user.id);writeAudit(db,req,{action:'UPLOAD_DOCUMENT',entityType:'tenant',entityId:tenantId,after:{documentId:Number(result.lastInsertRowid),type:b.documentType,filename:b.filename}});res.status(201).json({id:Number(result.lastInsertRowid),filename:b.filename,sha256:sha256(data)})}catch(error){next(error)}})
  app.get('/api/tenants/:id/documents', requirePermission('tenants.read'), (req,res)=>res.json(db.prepare(`SELECT id,tenant_id,document_type,filename,mime_type,sha256,created_at FROM tenant_documents WHERE tenant_id=? ORDER BY id DESC`).all(numberId(req))))

  app.get('/api/contracts', (req,res,next)=>{try{if(!req.user.permissions.some(x=>['tenants.read','contracts.read'].includes(x)))throw httpError(403,'FORBIDDEN','ไม่มีสิทธิ์ดูสัญญา');const filter=req.user.tenant_id?'WHERE l.tenant_id=?':'';res.json(db.prepare(`${contractDetailSql} ${filter} ORDER BY l.id DESC`).all(...(req.user.tenant_id?[req.user.tenant_id]:[])))}catch(error){next(error)}})
  app.get('/api/contracts/missing', requirePermission('tenants.read'), (_req,res)=>res.json(db.prepare(`SELECT DISTINCT t.*,b.id bed_id,r.room_no,b.bed_no,bu.name building_name FROM tenants t JOIN beds b ON b.tenant_id=t.id AND b.status IN ('reserved','occupied') JOIN rooms r ON r.id=b.room_id JOIN floors f ON f.id=r.floor_id JOIN buildings bu ON bu.id=f.building_id WHERE t.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM leases l WHERE l.tenant_id=t.id AND l.status='active') ORDER BY t.tenant_code`).all()))
  app.get('/api/contracts/pending-signatures', requirePermission('tenants.read'), (_req,res)=>res.json(db.prepare(`${contractDetailSql} WHERE l.document_status='sent' AND l.signed_at IS NULL ORDER BY l.sent_at`).all()))
  app.get('/api/contracts/alerts', requirePermission('tenants.read'), (req,res,next)=>{try{const asOf=validate(z.iso.date(),req.query.asOf||new Date().toISOString().slice(0,10)),today=new Date(`${asOf}T00:00:00Z`);const rows=db.prepare(`${contractDetailSql} WHERE l.status='active' AND l.document_status='signed' AND date(l.ends_at)>=date(?) AND NOT EXISTS(SELECT 1 FROM leases renewal WHERE renewal.previous_lease_id=l.id AND renewal.status='renewal_pending')`).all(asOf);const alerts=rows.map(row=>{const end=new Date(`${row.ends_at}T00:00:00Z`),alertAt=renewalAlertDate(row.ends_at,row.rental_period);return{...row,alert_at:alertAt?.toISOString().slice(0,10),days_remaining:Math.ceil((end-today)/86400000),should_alert:Boolean(alertAt&&today>=alertAt)}}).filter(row=>row.should_alert).map(({should_alert,...row})=>row);res.json(alerts)}catch(error){next(error)}})

  app.post('/api/contracts', requirePermission('tenants.manage'), async (req,res,next)=>{try{const b=validate(z.object({contractNo:z.string().min(1),tenantId:idSchema,bedId:idSchema.nullable().optional(),contractType:z.string().min(1),contractDate:z.iso.date(),rentalPeriod:z.enum(['daily','monthly','term','yearly']),startsAt:z.iso.date(),endsAt:z.iso.date(),advanceRent:z.number().nonnegative().default(0),minimumTermMonths:z.number().int().positive().default(1),depositAmount:z.number().nonnegative().default(0)}),req.body);const result=db.prepare(`INSERT INTO leases(contract_no,tenant_id,bed_id,contract_type,contract_date,rental_period,starts_at,ends_at,advance_rent,minimum_term_months,deposit_amount,document_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft')`).run(b.contractNo,b.tenantId,b.bedId||null,b.contractType,b.contractDate,b.rentalPeriod,b.startsAt,b.endsAt,b.advanceRent,b.minimumTermMonths,b.depositAmount);const id=Number(result.lastInsertRowid),contract=getContractDetails(db,id),pdf=await createContractPdf(contract),hash=sha256(pdf);db.prepare(`INSERT INTO contract_documents(lease_id,version,document_state,filename,pdf_data,sha256,created_by) VALUES (?,1,'draft',?,?,?,?)`).run(id,`${b.contractNo}.pdf`,pdf,hash,req.user.id);db.prepare(`UPDATE leases SET document_sha256=? WHERE id=?`).run(hash,id);writeContractEvent(db,req,id,'CREATED',{documentHash:hash});const after=getContractDetails(db,id);writeAudit(db,req,{action:'CREATE',entityType:'contract',entityId:id,after});res.status(201).json(after)}catch(error){next(error)}})
  app.patch('/api/contracts/:id', requirePermission('tenants.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'leases',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบสัญญา');if(before.document_status==='signed')throw httpError(409,'SIGNED_IMMUTABLE','สัญญาที่ลงนามแล้วแก้ไขไม่ได้ ต้องสร้างฉบับต่อสัญญา');const b=validate(z.object({endsAt:z.iso.date().optional(),status:z.enum(['active','expired','cancelled']).optional(),reason:z.string().min(5).optional()}).refine(x=>x.status!=='cancelled'||x.reason,{message:'ต้องระบุเหตุผลการยกเลิก',path:['reason']}),req.body);db.prepare(`UPDATE leases SET ends_at=COALESCE(?,ends_at),status=COALESCE(?,status) WHERE id=?`).run(b.endsAt||null,b.status||null,id);const after=getById(db,'leases',id);writeContractEvent(db,req,id,'UPDATED',{reason:b.reason||null});writeAudit(db,req,{action:'UPDATE',entityType:'contract',entityId:id,before,after:{...after,reason:b.reason}});res.json(after)}catch(error){next(error)}})
  app.post('/api/contracts/:id/send', requirePermission('tenants.manage'), async (req,res,next)=>{try{const id=numberId(req),contract=getContractDetails(db,id);if(!contract)throw httpError(404,'NOT_FOUND','ไม่พบสัญญา');if(contract.document_status==='signed')throw httpError(409,'ALREADY_SIGNED','สัญญาลงนามแล้ว');if(contract.document_status==='sent')throw httpError(409,'ALREADY_SENT','สัญญาถูกส่งให้ลงนามแล้ว');let emailNotificationId=null;transaction(db,()=>{db.prepare(`UPDATE leases SET document_status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);db.prepare(`UPDATE contract_documents SET document_state='sent' WHERE lease_id=? AND document_state='draft'`).run(id);const user=db.prepare(`SELECT id FROM users WHERE tenant_id=? AND deleted_at IS NULL AND status='active' LIMIT 1`).get(contract.tenant_id);db.prepare(`INSERT INTO notifications(recipient_user_id,tenant_id,notification_type,channel,title,message,entity_type,entity_id) VALUES (?,?,?,'system',?,?,?,?)`).run(user?.id||null,contract.tenant_id,'contract_signature','มีสัญญารอการลงนาม',`สัญญาเลขที่ ${contract.contract_no} กรุณาตรวจสอบและลงนาม`,'contract',id);if(contract.email){const result=db.prepare(`INSERT INTO notifications(recipient_user_id,tenant_id,notification_type,channel,title,message,entity_type,entity_id) VALUES (?,?,?,'email',?,?,?,?)`).run(user?.id||null,contract.tenant_id,'contract_signature','แจ้งลงนามสัญญาห้องพัก',`สัญญาเลขที่ ${contract.contract_no} ถูกจัดคิวส่งไปยัง ${contract.email}`,'contract',id);emailNotificationId=Number(result.lastInsertRowid)}});let emailResult={status:'not_requested'};if(contract.email){try{emailResult=await sendContractSignatureEmail({to:contract.email,contractNo:contract.contract_no});db.prepare(`UPDATE notifications SET delivery_status=? WHERE id=?`).run(emailResult.status,emailNotificationId)}catch(error){emailResult={status:'failed'};db.prepare(`UPDATE notifications SET delivery_status='failed' WHERE id=?`).run(emailNotificationId)}}writeContractEvent(db,req,id,'SENT',{channels:['system',...(contract.email?['email']:[])],emailStatus:emailResult.status});writeAudit(db,req,{action:'SEND_FOR_SIGNATURE',entityType:'contract',entityId:id,after:{email:contract.email,emailStatus:emailResult.status}});res.json({...getContractDetails(db,id),email_status:emailResult.status})}catch(error){next(error)}})
  app.post('/api/contracts/:id/sign', requirePermission('contracts.sign'), async (req,res,next)=>{try{const id=numberId(req),contract=getContractDetails(db,id);if(!contract||!canAccessContract(req.user,contract)||req.user.tenant_id!==contract.tenant_id)throw httpError(404,'NOT_FOUND','ไม่พบสัญญาที่ลงนามได้');if(contract.document_status!=='sent')throw httpError(409,'NOT_READY_TO_SIGN','สัญญายังไม่ได้ส่งให้ลงนามหรือถูกลงนามแล้ว');const b=validate(z.object({password:z.string().min(1),confirmed:z.literal(true)}),req.body);if(!await verifyCredentials(db,req.user.username,b.password))throw httpError(401,'SIGN_AUTH_FAILED','ยืนยันรหัสผ่านไม่สำเร็จ');const evidence={evidenceId:randomUUID(),displayName:req.user.display_name,username:req.user.username,method:req.user.auth_source==='ldap'?'LDAP username/password':'Local username/password',signedAt:new Date().toISOString(),ip:req.ip,userAgent:req.get('user-agent')||null,unsignedDocumentHash:contract.document_sha256};const pdf=await createContractPdf(contract,evidence),hash=sha256(pdf);const invoice=transaction(db,()=>{db.prepare(`INSERT INTO contract_documents(lease_id,version,document_state,filename,pdf_data,sha256,created_by) VALUES (?,?,'signed',?,?,?,?)`).run(id,contract.version,`${contract.contract_no}-signed.pdf`,pdf,hash,req.user.id);db.prepare(`UPDATE leases SET status=CASE WHEN previous_lease_id IS NULL THEN status ELSE 'active' END,document_status='signed',signed_at=?,signed_by=?,signature_method=?,signature_evidence_json=?,document_sha256=?,tenant_confirmed_at=? WHERE id=?`).run(evidence.signedAt,req.user.id,evidence.method,JSON.stringify(evidence),hash,evidence.signedAt,id);if(contract.previous_lease_id)db.prepare(`UPDATE leases SET status='expired' WHERE id=?`).run(contract.previous_lease_id);db.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP,delivery_status='completed' WHERE tenant_id=? AND entity_type='contract' AND entity_id=? AND channel='system'`).run(contract.tenant_id,id);return createContractInvoice(db,contract,req.user.id)});writeContractEvent(db,req,id,'SIGNED',{...evidence,signedDocumentHash:hash,invoiceId:invoice?.id||null,invoiceNo:invoice?.invoice_no||null});writeAudit(db,req,{action:'E_SIGN',entityType:'contract',entityId:id,after:{signedAt:evidence.signedAt,documentHash:hash,evidenceId:evidence.evidenceId,invoiceId:invoice?.id||null,invoiceNo:invoice?.invoice_no||null}});res.json({...getContractDetails(db,id),invoice_id:invoice?.id||null,invoice_no:invoice?.invoice_no||null})}catch(error){next(error)}})
  app.get('/api/contracts/:id/document', (req,res,next)=>{try{const id=numberId(req),contract=getContractDetails(db,id);if(!contract||!canAccessContract(req.user,contract))throw httpError(404,'NOT_FOUND','ไม่พบเอกสารสัญญา');const document=db.prepare(`SELECT * FROM contract_documents WHERE lease_id=? ORDER BY CASE document_state WHEN 'signed' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,id DESC LIMIT 1`).get(id);if(!document)throw httpError(404,'DOCUMENT_NOT_FOUND','ไม่พบไฟล์สัญญา');res.set({'content-type':'application/pdf','content-disposition':`inline; filename="${document.filename.replaceAll('"','')}"`,'x-document-sha256':document.sha256,'cache-control':'private, no-store'}).send(Buffer.from(document.pdf_data))}catch(error){next(error)}})
  app.get('/api/contracts/:id/history', (req,res,next)=>{try{const id=numberId(req),contract=getContractDetails(db,id);if(!contract||!canAccessContract(req.user,contract))throw httpError(404,'NOT_FOUND','ไม่พบสัญญา');res.json(db.prepare(`SELECT * FROM contract_events WHERE lease_id=? ORDER BY id`).all(id))}catch(error){next(error)}})
  app.post('/api/contracts/:id/renew', requirePermission('tenants.manage'), async (req,res,next)=>{try{const id=numberId(req),current=getById(db,'leases',id);if(!current)throw httpError(404,'NOT_FOUND','ไม่พบสัญญา');if(current.status!=='active'||current.document_status!=='signed')throw httpError(409,'CONTRACT_NOT_RENEWABLE','ต่อสัญญาได้เฉพาะสัญญาที่ใช้งานและลงนามแล้ว');if(db.prepare(`SELECT id FROM leases WHERE previous_lease_id=? AND status='renewal_pending'`).get(id))throw httpError(409,'RENEWAL_ALREADY_EXISTS','มีฉบับต่อสัญญาที่รอดำเนินการอยู่แล้ว');const b=validate(z.object({contractNo:z.string().min(1),contractDate:z.iso.date(),startsAt:z.iso.date(),endsAt:z.iso.date(),rentalPeriod:z.enum(['monthly','term','yearly']).optional()}),req.body);if(b.startsAt<=current.ends_at)throw httpError(400,'INVALID_RENEWAL_START','วันเริ่มฉบับต่อสัญญาต้องอยู่หลังวันสิ้นสุดสัญญาปัจจุบัน');if(b.endsAt<b.startsAt)throw httpError(400,'INVALID_DATE_RANGE','วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา');const result=transaction(db,()=>{db.prepare(`UPDATE leases SET renewal_requested_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);return db.prepare(`INSERT INTO leases(contract_no,tenant_id,bed_id,contract_type,contract_date,rental_period,starts_at,ends_at,advance_rent,minimum_term_months,deposit_amount,status,document_status,version,previous_lease_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,'renewal_pending','draft',?,?)`).run(b.contractNo,current.tenant_id,current.bed_id,current.contract_type,b.contractDate,b.rentalPeriod||current.rental_period,b.startsAt,b.endsAt,current.advance_rent,current.minimum_term_months,current.deposit_amount,current.version+1,id)});const newId=Number(result.lastInsertRowid),contract=getContractDetails(db,newId),pdf=await createContractPdf(contract),hash=sha256(pdf);db.prepare(`INSERT INTO contract_documents(lease_id,version,document_state,filename,pdf_data,sha256,created_by) VALUES (?,?,'draft',?,?,?,?)`).run(newId,contract.version,`${contract.contract_no}.pdf`,pdf,hash,req.user.id);db.prepare(`UPDATE leases SET document_sha256=? WHERE id=?`).run(hash,newId);writeContractEvent(db,req,id,'RENEWAL_CREATED',{newLeaseId:newId});writeContractEvent(db,req,newId,'CREATED_AS_RENEWAL',{previousLeaseId:id,documentHash:hash});writeAudit(db,req,{action:'RENEW',entityType:'contract',entityId:newId,before:current,after:contract});res.status(201).json(contract)}catch(error){next(error)}})
  app.get('/api/notifications', (req,res)=>{const where=req.user.tenant_id?'WHERE tenant_id=?':'WHERE recipient_user_id=? OR recipient_user_id IS NULL';res.json(db.prepare(`SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT 200`).all(req.user.tenant_id||req.user.id))})
  registerRoomRoutes(app, db)

  registerFinanceRoutes(app, db)
  registerSupportRoutes(app, db)
  registerAnnouncementRoutes(app, db)
  registerCheckoutRoutes(app, db)

  app.use((error, _req, res, _next) => {
    if (error?.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'CONFLICT', message: 'ข้อมูลซ้ำหรือมีข้อมูลอื่นอ้างอิงอยู่' })
    const status = error.status || 500
    if (status >= 500) console.error(error)
    res.status(status).json({ error: error.code || 'INTERNAL_ERROR', message: status >= 500 ? 'ระบบไม่สามารถดำเนินการได้' : error.message })
  })

  cleanupAuditLogs(db, process.env.AUDIT_RETENTION_DAYS)
  return app
}

function registerRoomRoutes(app, db) {
  const activeBedCount=`(SELECT COUNT(*) FROM beds bx JOIN master_data mdx ON mdx.category='bed' AND mdx.parent_id=mr.id AND mdx.active=1 AND COALESCE(json_extract(mdx.details_json,'$.bedNo'),REPLACE(mdx.name,'เตียง ',''),mdx.code)=bx.bed_no WHERE bx.room_id=r.id)`
  const vacantBedCount=`(SELECT COUNT(*) FROM beds bx JOIN master_data mdx ON mdx.category='bed' AND mdx.parent_id=mr.id AND mdx.active=1 AND COALESCE(json_extract(mdx.details_json,'$.bedNo'),REPLACE(mdx.name,'เตียง ',''),mdx.code)=bx.bed_no WHERE bx.room_id=r.id AND bx.status='vacant')`
  app.get('/api/rooms', requirePermission('rooms.read'), (req,res,next)=>{try{
    const q=validate(z.object({buildingId:idSchema.optional(),floor:z.coerce.number().int().positive().optional(),bedCount:z.coerce.number().int().positive().optional(),availability:z.enum(['all','available','vacant']).default('all')}),req.query)
    const where=[],params=[]
    if(q.buildingId){where.push('b.id=?');params.push(q.buildingId)}
    if(q.floor){where.push('f.floor_no=?');params.push(q.floor)}
    if(q.bedCount){where.push(`${activeBedCount}=?`);params.push(q.bedCount)}
    if(q.availability==='available')where.push("r.readiness_status='ready' AND r.status NOT IN ('unavailable','damaged') AND EXISTS(SELECT 1 FROM beds bx WHERE bx.room_id=r.id AND bx.status='vacant')")
    if(q.availability==='vacant')where.push("r.readiness_status='ready' AND r.status='vacant' AND NOT EXISTS(SELECT 1 FROM beds bx WHERE bx.room_id=r.id AND bx.status!='vacant')")
    const clause=where.length?`WHERE ${where.join(' AND ')}`:''
    res.json(db.prepare(`SELECT r.*,mr.name room_name,f.floor_no,b.id building_id,mb.code building_code,mb.name building_name,${activeBedCount} bed_count,${vacantBedCount} vacant_beds FROM rooms r JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id JOIN master_data mb ON mb.category='building' AND mb.code=b.code AND mb.active=1 JOIN master_data mf ON mf.category='floor' AND mf.parent_id=mb.id AND mf.active=1 AND CAST(json_extract(mf.details_json,'$.floorNo') AS INTEGER)=f.floor_no JOIN master_data mr ON mr.category='room' AND mr.parent_id=mf.id AND mr.code=r.room_no AND mr.active=1 ${clause} ORDER BY mb.code,f.floor_no,r.room_no`).all(...params))
  }catch(error){next(error)}})

  app.get('/api/beds', requirePermission('rooms.read'), (req,res,next)=>{try{
    const q=validate(z.object({buildingId:idSchema.optional(),floor:z.coerce.number().int().positive().optional(),bedCount:z.coerce.number().int().positive().optional(),availability:z.enum(['all','available']).default('all')}),req.query)
    const where=[],params=[]
    if(q.buildingId){where.push('bu.id=?');params.push(q.buildingId)}
    if(q.floor){where.push('f.floor_no=?');params.push(q.floor)}
    if(q.bedCount){where.push(`${activeBedCount}=?`);params.push(q.bedCount)}
    if(q.availability==='available')where.push("bd.status='vacant' AND r.readiness_status='ready' AND r.status NOT IN ('unavailable','damaged')")
    const clause=where.length?`WHERE ${where.join(' AND ')}`:''
    res.json(db.prepare(`SELECT bd.*,r.room_no,r.readiness_status,f.floor_no,bu.id building_id,mb.code building_code,mb.name building_name,${activeBedCount} room_bed_count FROM beds bd JOIN rooms r ON r.id=bd.room_id JOIN floors f ON f.id=r.floor_id JOIN buildings bu ON bu.id=f.building_id JOIN master_data mb ON mb.category='building' AND mb.code=bu.code AND mb.active=1 JOIN master_data mf ON mf.category='floor' AND mf.parent_id=mb.id AND mf.active=1 AND CAST(json_extract(mf.details_json,'$.floorNo') AS INTEGER)=f.floor_no JOIN master_data mr ON mr.category='room' AND mr.parent_id=mf.id AND mr.code=r.room_no AND mr.active=1 JOIN master_data md ON md.category='bed' AND md.parent_id=mr.id AND md.active=1 AND COALESCE(json_extract(md.details_json,'$.bedNo'),REPLACE(md.name,'เตียง ',''),md.code)=bd.bed_no ${clause} ORDER BY mb.code,f.floor_no,r.room_no,bd.bed_no`).all(...params))
  }catch(error){next(error)}})

  app.patch('/api/rooms/:id/status', requirePermission('rooms.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'rooms',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบห้อง');const b=validate(z.object({status:z.enum(['vacant','occupied','unavailable','damaged']),reason:z.string().min(1).max(500).nullable().optional()}),req.body);if(['unavailable','damaged'].includes(b.status)&&!b.reason)throw httpError(400,'REASON_REQUIRED','ต้องระบุเหตุผลเมื่อห้องไม่พร้อมหรือชำรุด');db.prepare(`UPDATE rooms SET status=?,reason=?,readiness_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.status,b.reason||null,['unavailable','damaged'].includes(b.status)?'not_ready':before.readiness_status,id);const after=getById(db,'rooms',id);writeAudit(db,req,{action:'STATUS_CHANGE',entityType:'room',entityId:id,before,after});res.json(after)}catch(error){next(error)}})
  app.patch('/api/beds/:id/status', requirePermission('rooms.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'beds',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบเตียง');const b=validate(z.object({status:z.enum(['vacant','reserved','occupied','unavailable','damaged']),tenantId:idSchema.nullable().optional()}),req.body);db.prepare(`UPDATE beds SET status=?,tenant_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.status,b.tenantId||null,id);const after=getById(db,'beds',id);writeAudit(db,req,{action:'STATUS_CHANGE',entityType:'bed',entityId:id,before,after});res.json(after)}catch(error){next(error)}})

  app.get('/api/reservations', requirePermission('rooms.read'), (_req,res)=>res.json(db.prepare(`SELECT rv.*,t.tenant_code,t.first_name,t.last_name,r.room_no,b.bed_no FROM reservations rv JOIN tenants t ON t.id=rv.tenant_id JOIN rooms r ON r.id=rv.room_id LEFT JOIN beds b ON b.id=rv.bed_id ORDER BY rv.id DESC`).all()))
  app.post('/api/reservations', requirePermission('rooms.manage'), (req,res,next)=>{try{
    const b=validate(z.object({tenantId:idSchema,scope:z.enum(['bed','room']),rentalPeriod:z.enum(['daily','monthly','term','yearly']),roomId:idSchema,bedId:idSchema.nullable().optional(),startsAt:z.iso.date(),endsAt:z.iso.date().nullable().optional()}),req.body)
    const tenant=getById(db,'tenants',b.tenantId,'AND deleted_at IS NULL');if(!tenant)throw httpError(404,'TENANT_NOT_FOUND','ไม่พบผู้เช่า')
    const room=getById(db,'rooms',b.roomId);if(!room||room.readiness_status!=='ready'||['unavailable','damaged'].includes(room.status))throw httpError(409,'ROOM_NOT_READY','ห้องยังไม่พร้อมให้จอง')
    const targets=b.scope==='room'?db.prepare(`SELECT * FROM beds WHERE room_id=?`).all(b.roomId):[getById(db,'beds',b.bedId)]
    if(!targets.length||targets.some(x=>!x||x.room_id!==b.roomId||x.status!=='vacant'))throw httpError(409,'BED_UNAVAILABLE','ห้องหรือเตียงไม่ว่าง')
    const cohort=tenantRateCohort(tenant),rateScope=b.scope==='room'?'room':'person'
    const policy=db.prepare(`SELECT * FROM rate_policies WHERE tenant_cohort=? AND rental_period=? AND rate_scope=? AND active=1 AND starts_at<=? AND (ends_at IS NULL OR ends_at>=?) ORDER BY starts_at DESC LIMIT 1`).get(cohort,b.rentalPeriod,rateScope,b.startsAt,b.startsAt)
    if(!policy)throw httpError(409,'RATE_POLICY_NOT_CONFIGURED','ไม่พบนโยบายค่าเช่าที่ตรงกับประเภทผู้เช่า รอบเช่า และรูปแบบการจอง')
    const committed=db.prepare(`SELECT COUNT(*) count FROM beds WHERE room_id=? AND status IN ('reserved','occupied')`).get(b.roomId).count
    const projectedOccupancy=b.scope==='room'?targets.length:committed+1
    if(projectedOccupancy>policy.occupancy_limit)throw httpError(409,'OCCUPANCY_LIMIT','จำนวนผู้พักเกินเงื่อนไขของประเภทผู้เช่า')
    const conditions={tenantType:tenant.tenant_type,cohort,rentalPeriod:b.rentalPeriod,rateScope,ratePolicyCode:policy.code,amount:policy.amount,occupancyLimit:policy.occupancy_limit,utilitySplitDivisor:policy.utility_split_divisor,depositAmount:policy.deposit_amount,dueDay:policy.due_day,lateFee:policy.late_fee}
    const id=transaction(db,()=>{const reservationNo=nextDocumentNo(db,'reservations','reservation_no','RSV');const result=db.prepare(`INSERT INTO reservations(reservation_no,tenant_id,room_id,bed_id,reservation_scope,starts_at,ends_at,condition_snapshot,created_by) VALUES (?,?,?,?,?,?,?,?,?)`).run(reservationNo,b.tenantId,b.roomId,b.scope==='bed'?b.bedId:null,b.scope,b.startsAt,b.endsAt||null,JSON.stringify(conditions),req.user.id);for(const bed of targets)db.prepare(`UPDATE beds SET status='reserved',tenant_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.tenantId,bed.id);return Number(result.lastInsertRowid)})
    const after=getById(db,'reservations',id);writeAudit(db,req,{action:'RESERVE',entityType:'reservation',entityId:id,after});res.status(201).json(after)
  }catch(error){next(error)}})

  app.post('/api/room-transfers', requirePermission('rooms.manage'), (req,res,next)=>{try{
    const b=validate(z.object({tenantId:idSchema,toBedId:idSchema,transferDate:z.iso.date(),reason:z.string().min(5).max(1000)}),req.body)
    const from=db.prepare(`SELECT * FROM beds WHERE tenant_id=? AND status='occupied' LIMIT 1`).get(b.tenantId),to=getById(db,'beds',b.toBedId)
    if(!from)throw httpError(409,'NO_ACTIVE_BED','ผู้เช่าไม่มีเตียงที่กำลังพัก');if(!to||to.status!=='vacant')throw httpError(409,'BED_UNAVAILABLE','เตียงปลายทางไม่ว่าง')
    const targetRoom=getById(db,'rooms',to.room_id);if(targetRoom.readiness_status!=='ready'||['unavailable','damaged'].includes(targetRoom.status))throw httpError(409,'ROOM_NOT_READY','ห้องปลายทางยังไม่พร้อม')
    const id=transaction(db,()=>{const result=db.prepare(`INSERT INTO room_transfers(tenant_id,from_bed_id,to_bed_id,transfer_date,reason,created_by) VALUES (?,?,?,?,?,?)`).run(b.tenantId,from.id,to.id,b.transferDate,b.reason,req.user.id);db.prepare(`UPDATE beds SET status='vacant',tenant_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(from.id);db.prepare(`UPDATE beds SET status='occupied',tenant_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.tenantId,to.id);db.prepare(`UPDATE leases SET bed_id=? WHERE tenant_id=? AND status='active'`).run(to.id,b.tenantId);return Number(result.lastInsertRowid)})
    const after=getById(db,'room_transfers',id);writeAudit(db,req,{action:'TRANSFER',entityType:'room_transfer',entityId:id,after});res.status(201).json(after)
  }catch(error){next(error)}})

  app.post('/api/checkouts', requirePermission('rooms.manage'), (req,res,next)=>{try{
    const b=validate(z.object({tenantId:idSchema,checkoutDate:z.iso.date(),damageDetail:z.string().max(2000).nullable().optional(),damageAmount:z.number().nonnegative().default(0)}),req.body)
    const lease=db.prepare(`SELECT * FROM leases WHERE tenant_id=? AND status='active' ORDER BY id DESC LIMIT 1`).get(b.tenantId),bed=db.prepare(`SELECT * FROM beds WHERE tenant_id=? AND status IN ('occupied','reserved') LIMIT 1`).get(b.tenantId)
    if(!bed)throw httpError(409,'NO_ACTIVE_STAY','ไม่พบการเข้าพักที่ย้ายออกได้')
    const debt=db.prepare(`SELECT COALESCE(SUM(balance),0) total FROM invoices WHERE tenant_id=? AND status NOT IN ('paid','cancelled')`).get(b.tenantId).total
    const deposit=lease?.deposit_amount||0,refund=Math.max(0,deposit-b.damageAmount)
    const id=transaction(db,()=>{const result=db.prepare(`INSERT INTO checkouts(tenant_id,lease_id,bed_id,checkout_date,damage_detail,damage_amount,outstanding_debt,deposit_amount,refund_amount,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(b.tenantId,lease?.id||null,bed.id,b.checkoutDate,b.damageDetail||null,b.damageAmount,debt,deposit,refund,req.user.id);db.prepare(`UPDATE beds SET status='vacant',tenant_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(bed.id);if(lease)db.prepare(`UPDATE leases SET status='expired',ends_at=? WHERE id=?`).run(b.checkoutDate,lease.id);db.prepare(`UPDATE rooms SET readiness_status='not_ready',readiness_confirmed_at=NULL,readiness_confirmed_by=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(bed.room_id);return Number(result.lastInsertRowid)})
    const after=getById(db,'checkouts',id);writeAudit(db,req,{action:'CHECKOUT',entityType:'checkout',entityId:id,after});res.status(201).json(after)
  }catch(error){next(error)}})

  app.post('/api/rooms/:id/readiness', requirePermission('rooms.manage'), (req,res,next)=>{try{
    const id=numberId(req),room=getById(db,'rooms',id);if(!room)throw httpError(404,'NOT_FOUND','ไม่พบห้อง')
    const b=validate(z.object({ready:z.boolean(),checklist:z.object({cleanliness:z.boolean(),electricity:z.boolean(),water:z.boolean(),furniture:z.boolean()}),note:z.string().max(1000).nullable().optional()}),req.body)
    if(b.ready&&Object.values(b.checklist).some(value=>!value))throw httpError(400,'CHECKLIST_INCOMPLETE','ต้องยืนยันรายการตรวจความพร้อมให้ครบก่อนเปิดจอง')
    if(b.ready&&db.prepare(`SELECT COUNT(*) count FROM beds WHERE room_id=? AND status IN ('damaged','unavailable')`).get(id).count)throw httpError(409,'BED_NOT_READY','ยังมีเตียงชำรุดหรือไม่พร้อม')
    if(b.ready&&db.prepare(`SELECT COUNT(*) count FROM repairs WHERE room_id=? AND workflow_status NOT IN ('completed','closed')`).get(id).count)throw httpError(409,'OPEN_REPAIR','ยังมีงานซ่อมที่ไม่เสร็จ')
    const status=b.ready?'ready':'not_ready';transaction(db,()=>{db.prepare(`INSERT INTO room_inspections(room_id,readiness_status,checklist_json,note,confirmed_by) VALUES (?,?,?,?,?)`).run(id,status,JSON.stringify(b.checklist),b.note||null,req.user.id);db.prepare(`UPDATE rooms SET readiness_status=?,readiness_confirmed_at=CURRENT_TIMESTAMP,readiness_confirmed_by=?,status=CASE WHEN ?='ready' AND NOT EXISTS(SELECT 1 FROM beds WHERE room_id=? AND status='occupied') THEN 'vacant' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,req.user.id,status,id,id)})
    const after=getById(db,'rooms',id);writeAudit(db,req,{action:'READINESS_CONFIRMED',entityType:'room',entityId:id,after:{...after,checklist:b.checklist,note:b.note}});res.json(after)
  }catch(error){next(error)}})

  app.get('/api/meter-readings', requirePermission('finance.read'), (req,res)=>{const params=[],where=[];if(req.query.roomId){where.push('m.room_id=?');params.push(validate(idSchema,req.query.roomId))}if(req.query.month){where.push('m.billing_month=?');params.push(req.query.month)}res.json(db.prepare(`SELECT m.*,r.room_no,f.floor_no,b.name building_name FROM meter_readings m JOIN rooms r ON r.id=m.room_id JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY m.billing_month DESC,b.code,f.floor_no,r.room_no`).all(...params))})
  app.post('/api/meter-readings', requirePermission('finance.manage'), (req,res,next)=>{try{
    const b=validate(z.object({roomId:idSchema,utilityType:z.enum(['water','electricity']),billingMonth:z.string().regex(/^\d{4}-\d{2}$/),previousReading:z.number().nonnegative(),currentReading:z.number().nonnegative(),unitRate:z.number().nonnegative(),dueDate:z.iso.date(),issueInvoices:z.boolean().default(true)}).refine(x=>x.currentReading>=x.previousReading,{message:'เลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่าเลขครั้งก่อน',path:['currentReading']}),req.body)
    const beds=db.prepare(`SELECT * FROM beds WHERE room_id=?`).all(b.roomId);if(!beds.length)throw httpError(404,'ROOM_NOT_FOUND','ไม่พบห้องหรือเตียง')
    const consumption=b.currentReading-b.previousReading,total=Number((consumption*b.unitRate).toFixed(2)),perBed=Number((total/beds.length).toFixed(2))
    const created=transaction(db,()=>{const result=db.prepare(`INSERT INTO meter_readings(room_id,utility_type,billing_month,previous_reading,current_reading,consumption,unit_rate,total_amount,divisor,amount_per_bed,due_date,invoice_issued_at,recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP END,?)`).run(b.roomId,b.utilityType,b.billingMonth,b.previousReading,b.currentReading,consumption,b.unitRate,total,beds.length,perBed,b.dueDate,b.issueInvoices?1:0,req.user.id);const invoiceIds=[];if(b.issueInvoices){const shares=db.prepare(`SELECT tenant_id,COUNT(*) bed_units FROM beds WHERE room_id=? AND status='occupied' AND tenant_id IS NOT NULL GROUP BY tenant_id`).all(b.roomId);for(const share of shares){const amount=Number((perBed*share.bed_units).toFixed(2)),invoiceNo=nextDocumentNo(db,'invoices','invoice_no','INV');const invoice=db.prepare(`INSERT INTO invoices(invoice_no,tenant_id,due_date,total,balance,created_by) VALUES (?,?,?,?,?,?)`).run(invoiceNo,share.tenant_id,b.dueDate,amount,amount,req.user.id);db.prepare(`INSERT INTO invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) VALUES (?,?,?,?,?,?)`).run(invoice.lastInsertRowid,b.utilityType,`${b.utilityType==='water'?'ค่าน้ำประปา':'ค่าไฟฟ้า'} ${b.billingMonth}`,share.bed_units,perBed,amount);invoiceIds.push(Number(invoice.lastInsertRowid))}}return{readingId:Number(result.lastInsertRowid),invoiceIds}})
    const after={...getById(db,'meter_readings',created.readingId),invoice_ids:created.invoiceIds};writeAudit(db,req,{action:'METER_RECORDED',entityType:'meter_reading',entityId:created.readingId,after});res.status(201).json(after)
  }catch(error){next(error)}})
}

function registerFinanceRoutes(app, db) {
  const masters = {
    'rate-plans': { table:'rate_plans', permission:'finance.manage', schema:z.object({name:z.string().min(1),rentalPeriod:z.enum(['daily','monthly','term','yearly']),amount:z.number().nonnegative(),startsAt:z.iso.date(),endsAt:z.iso.date().nullable().optional(),tenantType:z.enum(['student','staff','external']).nullable().optional()}), columns:['name','rental_period','amount','starts_at','ends_at','tenant_type'], keys:['name','rentalPeriod','amount','startsAt','endsAt','tenantType'] },
    'utility-rates': { table:'utility_rates', permission:'finance.manage', schema:z.object({utilityType:z.enum(['water','electricity']),unitRate:z.number().nonnegative(),minimumCharge:z.number().nonnegative().default(0),startsAt:z.iso.date(),endsAt:z.iso.date().nullable().optional()}), columns:['utility_type','unit_rate','minimum_charge','starts_at','ends_at'], keys:['utilityType','unitRate','minimumCharge','startsAt','endsAt'] },
    'fee-types': { table:'fee_types', permission:'finance.manage', schema:z.object({code:z.string().min(1),name:z.string().min(1),defaultAmount:z.number().nonnegative().default(0)}), columns:['code','name','default_amount'], keys:['code','name','defaultAmount'] },
  }
  for (const [path, config] of Object.entries(masters)) {
    app.get(`/api/${path}`, requirePermission('finance.read'), (_req,res)=>res.json(db.prepare(`SELECT * FROM ${config.table} ORDER BY id DESC`).all()))
    app.post(`/api/${path}`, requirePermission(config.permission), (req,res,next)=>{try{const b=validate(config.schema,req.body);const placeholders=config.columns.map(()=>'?').join(',');const result=db.prepare(`INSERT INTO ${config.table}(${config.columns.join(',')}) VALUES (${placeholders})`).run(...config.keys.map(k=>b[k]??null));const after=getById(db,config.table,Number(result.lastInsertRowid));writeAudit(db,req,{action:'CREATE',entityType:config.table,entityId:after.id,after});res.status(201).json(after)}catch(error){next(error)}})
  }

  app.get('/api/invoices', requirePermission('finance.read'), (req,res)=>{
    const tenantFilter=req.user.tenant_id?'WHERE i.tenant_id=?':'';const rows=db.prepare(`SELECT i.*,t.tenant_code,t.tenant_type,t.first_name,t.last_name,t.email,(SELECT GROUP_CONCAT(ii.description, ' + ') FROM invoice_items ii WHERE ii.invoice_id=i.id) item_summary FROM invoices i JOIN tenants t ON t.id=i.tenant_id ${tenantFilter} ORDER BY i.id DESC`).all(...(req.user.tenant_id?[req.user.tenant_id]:[]));res.json(rows)
  })
  app.post('/api/invoices', requirePermission('finance.manage'), (req,res,next)=>{
    try{
      const b=validate(z.object({tenantId:idSchema,dueDate:z.iso.date(),items:z.array(z.object({itemType:z.string().min(1),description:z.string().min(1),quantity:z.number().positive().default(1),unitPrice:z.number().nonnegative()})).min(1)}),req.body)
      const id=transaction(db,()=>{const invoiceNo=nextDocumentNo(db,'invoices','invoice_no','INV');const total=b.items.reduce((sum,x)=>sum+x.quantity*x.unitPrice,0);const result=db.prepare(`INSERT INTO invoices(invoice_no,tenant_id,due_date,total,balance,created_by) VALUES (?,?,?,?,?,?)`).run(invoiceNo,b.tenantId,b.dueDate,total,total,req.user.id);for(const item of b.items)db.prepare(`INSERT INTO invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) VALUES (?,?,?,?,?,?)`).run(result.lastInsertRowid,item.itemType,item.description,item.quantity,item.unitPrice,item.quantity*item.unitPrice);return Number(result.lastInsertRowid)});const after=getById(db,'invoices',id);writeAudit(db,req,{action:'CREATE',entityType:'invoice',entityId:id,after});res.status(201).json({...after,items:db.prepare(`SELECT * FROM invoice_items WHERE invoice_id=?`).all(id)})
    }catch(error){next(error)}
  })
  app.post('/api/invoices/:id/cancel', requirePermission('finance.cancel'), (req,res,next)=>{
    try{const id=numberId(req),before=getById(db,'invoices',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบใบแจ้งหนี้');if(before.status==='cancelled')throw httpError(409,'ALREADY_CANCELLED','ใบแจ้งหนี้ถูกยกเลิกแล้ว');if(before.balance!==before.total)throw httpError(409,'HAS_PAYMENT','ใบแจ้งหนี้มีรายการชำระแล้ว ต้องยกเลิกใบเสร็จก่อน');const {reason}=validate(z.object({reason:z.string().min(5).max(1000)}),req.body);db.prepare(`UPDATE invoices SET status='cancelled',cancelled_reason=?,cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,req.user.id,id);const after=getById(db,'invoices',id);writeAudit(db,req,{action:'CANCEL',entityType:'invoice',entityId:id,before,after});res.json(after)}catch(error){next(error)}
  })
  app.post('/api/invoices/:id/send', requirePermission('finance.manage'), async (req,res,next)=>{
    try{const id=numberId(req),invoice=db.prepare(`SELECT i.*,t.email FROM invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.id=?`).get(id);if(!invoice)throw httpError(404,'NOT_FOUND','ไม่พบใบแจ้งหนี้');if(invoice.status==='cancelled')throw httpError(409,'CANCELLED','ไม่สามารถส่งใบแจ้งหนี้ที่ยกเลิกแล้ว');const delivery=await sendInvoiceEmail({to:invoice.email,invoiceNo:invoice.invoice_no,dueDate:invoice.due_date,total:invoice.total});db.prepare(`UPDATE invoices SET email_sent_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);writeAudit(db,req,{action:'SEND',entityType:'invoice',entityId:id,after:{delivery:delivery.status,email:invoice.email}});res.json({...delivery,email:invoice.email})}catch(error){next(error)}
  })
  app.get('/api/invoices/:id/document', requirePermission('finance.read'), async (req,res,next)=>{
    try{const id=numberId(req),invoice=db.prepare(`SELECT i.*,t.tenant_code,t.first_name,t.last_name FROM invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.id=?`).get(id);if(!invoice||(req.user.tenant_id&&invoice.tenant_id!==req.user.tenant_id))throw httpError(404,'NOT_FOUND','ไม่พบใบแจ้งหนี้');const items=db.prepare(`SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id`).all(id);const pdf=await createInvoicePdf(invoice,items);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${invoice.invoice_no}.pdf"`);res.send(pdf)}catch(error){next(error)}
  })
  app.post('/api/payments', requirePermission('finance.manage'), (req,res,next)=>{
    try{
      const b=validate(z.object({invoiceId:idSchema,amount:z.number().positive(),method:z.enum(['cash','transfer','bank_file','online_account']),referenceNo:z.string().max(200).optional(),paidAt:z.iso.datetime().optional()}),req.body)
      const invoice=getById(db,'invoices',b.invoiceId);if(!invoice||invoice.status==='cancelled')throw httpError(404,'INVOICE_UNAVAILABLE','ไม่พบใบแจ้งหนี้ที่รับชำระได้');if(b.amount>invoice.balance)throw httpError(400,'OVERPAYMENT','ยอดชำระมากกว่ายอดคงเหลือ')
      const ids=transaction(db,()=>{const payment=db.prepare(`INSERT INTO payments(invoice_id,amount,method,reference_no,paid_at,received_by) VALUES (?,?,?,?,?,?)`).run(b.invoiceId,b.amount,b.method,b.referenceNo||null,b.paidAt||new Date().toISOString(),req.user.id);const receiptNo=nextDocumentNo(db,'receipts','receipt_no','RC');const receipt=db.prepare(`INSERT INTO receipts(receipt_no,payment_id,issued_by) VALUES (?,?,?)`).run(receiptNo,payment.lastInsertRowid,req.user.id);const balance=invoice.balance-b.amount;db.prepare(`UPDATE invoices SET balance=?,status=? WHERE id=?`).run(balance,balance===0?'paid':'partial',invoice.id);return{paymentId:Number(payment.lastInsertRowid),receiptId:Number(receipt.lastInsertRowid)}})
      const receipt=getById(db,'receipts',ids.receiptId);writeAudit(db,req,{action:'PAYMENT_RECEIVED',entityType:'invoice',entityId:invoice.id,after:{...b,...ids,receiptNo:receipt.receipt_no}});res.status(201).json({payment:getById(db,'payments',ids.paymentId),receipt})
    }catch(error){next(error)}
  })
  app.get('/api/receipts', requirePermission('finance.read'), (req,res)=>{const filter=req.user.tenant_id?'WHERE i.tenant_id=?':'';res.json(db.prepare(`SELECT r.*,p.amount,p.method,p.reference_no,p.paid_at,i.invoice_no,i.tenant_id,t.tenant_code,t.first_name,t.last_name,u.display_name issued_by_name FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN tenants t ON t.id=i.tenant_id JOIN users u ON u.id=r.issued_by ${filter} ORDER BY r.id DESC`).all(...(req.user.tenant_id?[req.user.tenant_id]:[])))})
  app.post('/api/receipts/:id/cancel', requirePermission('finance.cancel'), (req,res,next)=>{
    try{const id=numberId(req),before=getById(db,'receipts',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบใบเสร็จ');if(before.status==='cancelled')throw httpError(409,'ALREADY_CANCELLED','ใบเสร็จถูกยกเลิกแล้ว');const{reason}=validate(z.object({reason:z.string().min(5).max(1000)}),req.body);transaction(db,()=>{const payment=getById(db,'payments',before.payment_id),invoice=getById(db,'invoices',payment.invoice_id);db.prepare(`UPDATE receipts SET status='cancelled',cancelled_reason=?,cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,req.user.id,id);const balance=invoice.balance+payment.amount;db.prepare(`UPDATE invoices SET balance=?,status='issued' WHERE id=?`).run(balance,invoice.id)});const after=getById(db,'receipts',id);writeAudit(db,req,{action:'CANCEL',entityType:'receipt',entityId:id,before,after});res.json(after)}catch(error){next(error)}
  })
  app.get('/api/receipts/:id/document', requirePermission('finance.read'), async (req,res,next)=>{
    try{const id=numberId(req),receipt=db.prepare(`SELECT r.*,p.amount,p.method,p.reference_no,p.paid_at,i.id invoice_id,i.total invoice_total,i.tenant_id,t.tenant_code,t.first_name,t.last_name FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN tenants t ON t.id=i.tenant_id WHERE r.id=?`).get(id);if(!receipt||(req.user.tenant_id&&receipt.tenant_id!==req.user.tenant_id))throw httpError(404,'NOT_FOUND','ไม่พบใบเสร็จ');const items=db.prepare(`SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id`).all(receipt.invoice_id);const pdf=await createReceiptPdf(receipt,items);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${receipt.receipt_no}.pdf"`);res.send(pdf)}catch(error){next(error)}
  })

  app.get('/api/payment-proofs', requirePermission('finance.read'), (req,res)=>{const filter=req.user.tenant_id?'WHERE pp.tenant_id=?':'';res.json(db.prepare(`SELECT pp.id,pp.invoice_id,pp.tenant_id,pp.amount,pp.reference_no,pp.paid_at,pp.filename,pp.mime_type,pp.status,pp.review_note,pp.reviewed_by,pp.reviewed_at,pp.payment_id,pp.created_at,i.invoice_no,t.tenant_code,t.first_name,t.last_name,u.display_name reviewed_by_name FROM payment_proofs pp JOIN invoices i ON i.id=pp.invoice_id JOIN tenants t ON t.id=pp.tenant_id LEFT JOIN users u ON u.id=pp.reviewed_by ${filter} ORDER BY pp.id DESC`).all(...(req.user.tenant_id?[req.user.tenant_id]:[])))})
  app.post('/api/payment-proofs', (req,res,next)=>{try{if(!req.user.tenant_id&&!req.user.permissions.includes('finance.manage'))throw httpError(403,'FORBIDDEN','ไม่มีสิทธิ์แนบหลักฐาน');const b=validate(z.object({invoiceId:idSchema,amount:z.number().positive(),referenceNo:z.string().max(200).optional(),paidAt:z.iso.datetime(),filename:z.string().min(1).max(255),mimeType:z.enum(['image/jpeg','image/png','application/pdf']),fileBase64:z.string().min(20).max(4_200_000)}),req.body);const invoice=getById(db,'invoices',b.invoiceId);if(!invoice||invoice.status==='cancelled'||invoice.balance<=0)throw httpError(404,'INVOICE_UNAVAILABLE','ไม่พบใบแจ้งหนี้ที่รับหลักฐานได้');if(req.user.tenant_id&&invoice.tenant_id!==req.user.tenant_id)throw httpError(403,'FORBIDDEN','แนบหลักฐานได้เฉพาะใบแจ้งหนี้ของตนเอง');if(b.amount>invoice.balance)throw httpError(400,'OVERPAYMENT','ยอดหลักฐานมากกว่ายอดคงเหลือ');const result=db.prepare(`INSERT INTO payment_proofs(invoice_id,tenant_id,amount,reference_no,paid_at,filename,mime_type,file_base64,submitted_by) VALUES (?,?,?,?,?,?,?,?,?)`).run(invoice.id,invoice.tenant_id,b.amount,b.referenceNo||null,b.paidAt,b.filename,b.mimeType,b.fileBase64,req.user.id);const after=getById(db,'payment_proofs',Number(result.lastInsertRowid));writeAudit(db,req,{action:'PROOF_SUBMITTED',entityType:'payment_proof',entityId:after.id,after:{...after,file_base64:'[REDACTED]'}});res.status(201).json({...after,file_base64:undefined})}catch(error){next(error)}})
  app.get('/api/payment-proofs/:id/file', requirePermission('finance.read'), (req,res,next)=>{try{const proof=getById(db,'payment_proofs',numberId(req));if(!proof||(req.user.tenant_id&&proof.tenant_id!==req.user.tenant_id))throw httpError(404,'NOT_FOUND','ไม่พบหลักฐาน');const buffer=Buffer.from(proof.file_base64,'base64');res.setHeader('Content-Type',proof.mime_type);res.setHeader('Content-Disposition',`inline; filename="${proof.filename.replace(/["\r\n]/g,'_')}"`);res.send(buffer)}catch(error){next(error)}})
  app.post('/api/payment-proofs/:id/review', requirePermission('finance.approve'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'payment_proofs',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบหลักฐาน');if(before.status!=='pending')throw httpError(409,'ALREADY_REVIEWED','หลักฐานนี้ได้รับการตรวจแล้ว');const b=validate(z.object({decision:z.enum(['approved','rejected']),note:z.string().min(5).max(1000)}),req.body);let receipt=null;transaction(db,()=>{if(b.decision==='approved'){const invoice=getById(db,'invoices',before.invoice_id);if(!invoice||invoice.status==='cancelled'||before.amount>invoice.balance)throw httpError(409,'INVOICE_UNAVAILABLE','ยอดใบแจ้งหนี้เปลี่ยนแปลง กรุณาตรวจสอบใหม่');const payment=db.prepare(`INSERT INTO payments(invoice_id,amount,method,reference_no,paid_at,received_by) VALUES (?,?,'transfer',?,?,?)`).run(invoice.id,before.amount,before.reference_no,before.paid_at,req.user.id);const receiptRow=db.prepare(`INSERT INTO receipts(receipt_no,payment_id,issued_by) VALUES (?,?,?)`).run(nextDocumentNo(db,'receipts','receipt_no','RC'),payment.lastInsertRowid,req.user.id);const balance=invoice.balance-before.amount;db.prepare(`UPDATE invoices SET balance=?,status=? WHERE id=?`).run(balance,balance===0?'paid':'partial',invoice.id);db.prepare(`UPDATE payment_proofs SET status='approved',review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,payment_id=? WHERE id=?`).run(b.note,req.user.id,payment.lastInsertRowid,id);receipt=getById(db,'receipts',Number(receiptRow.lastInsertRowid))}else db.prepare(`UPDATE payment_proofs SET status='rejected',review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.note,req.user.id,id)});const after=getById(db,'payment_proofs',id);writeAudit(db,req,{action:b.decision==='approved'?'PROOF_APPROVED':'PROOF_REJECTED',entityType:'payment_proof',entityId:id,before:{...before,file_base64:'[REDACTED]'},after:{...after,file_base64:'[REDACTED]'}});res.json({proof:{...after,file_base64:undefined},receipt})}catch(error){next(error)}})

  app.post('/api/bank-imports', requirePermission('finance.manage'), (req,res,next)=>{
    try{
      const b=validate(z.object({bankCode:z.string().min(1),filename:z.string().min(1),csv:z.string().min(1)}),req.body)
      const lines=b.csv.trim().split(/\r?\n/);const headers=lines.shift().split(',').map(x=>x.trim());const required=['invoice_no','amount','reference_no','paid_at'];if(required.some(x=>!headers.includes(x)))throw httpError(400,'INVALID_BANK_FILE',`ไฟล์ต้องมีคอลัมน์ ${required.join(', ')}`)
      let success=0;const errors=[]
      for(let index=0;index<lines.length;index++){const values=lines[index].split(',').map(x=>x.trim());const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));try{const invoice=db.prepare(`SELECT * FROM invoices WHERE invoice_no=?`).get(row.invoice_no);if(!invoice||invoice.status==='cancelled')throw new Error('ไม่พบใบแจ้งหนี้');const amount=Number(row.amount);if(!Number.isFinite(amount)||amount<=0||amount>invoice.balance)throw new Error('ยอดเงินไม่ถูกต้อง');transaction(db,()=>{const p=db.prepare(`INSERT INTO payments(invoice_id,amount,method,reference_no,paid_at,received_by) VALUES (?,?,'bank_file',?,?,?)`).run(invoice.id,amount,row.reference_no,row.paid_at,req.user.id);db.prepare(`INSERT INTO receipts(receipt_no,payment_id,issued_by) VALUES (?,?,?)`).run(nextDocumentNo(db,'receipts','receipt_no','RC'),p.lastInsertRowid,req.user.id);const balance=invoice.balance-amount;db.prepare(`UPDATE invoices SET balance=?,status=? WHERE id=?`).run(balance,balance===0?'paid':'partial',invoice.id)});success++}catch(error){errors.push({line:index+2,message:error.message})}}
      const result=db.prepare(`INSERT INTO bank_imports(bank_code,filename,row_count,success_count,error_count,imported_by) VALUES (?,?,?,?,?,?)`).run(b.bankCode,b.filename,lines.length,success,errors.length,req.user.id);writeAudit(db,req,{action:'BANK_IMPORT',entityType:'bank_import',entityId:result.lastInsertRowid,after:{filename:b.filename,rowCount:lines.length,success,errorCount:errors.length}});res.status(201).json({id:Number(result.lastInsertRowid),rowCount:lines.length,successCount:success,errorCount:errors.length,errors})
    }catch(error){next(error)}
  })

  app.get('/api/financial-accounts', requirePermission('finance.read'), (req,res)=>{if(req.user.tenant_id)return res.status(403).json({code:'FORBIDDEN',message:'ข้อมูลบัญชีสำหรับเจ้าหน้าที่การเงินเท่านั้น'});res.json([
    financialAccount('พักรับเงิน','KASIKORN',process.env.HOLDING_ACCOUNT_NAME,process.env.HOLDING_ACCOUNT_NO,process.env.HOLDING_ACCOUNT_BRANCH),
    financialAccount('นำส่งรายได้มหาวิทยาลัย','BANGKOK',process.env.UNIVERSITY_ACCOUNT_NAME,process.env.UNIVERSITY_ACCOUNT_NO,process.env.UNIVERSITY_ACCOUNT_BRANCH),
    financialAccount('เงินประกันห้องพัก','BANGKOK',process.env.DEPOSIT_ACCOUNT_NAME,process.env.DEPOSIT_ACCOUNT_NO,process.env.DEPOSIT_ACCOUNT_BRANCH),
  ])})
  app.get('/api/remittances', requirePermission('finance.read'), (req,res)=>{if(req.user.tenant_id)return res.status(403).json({code:'FORBIDDEN',message:'ข้อมูลนำส่งเงินสำหรับเจ้าหน้าที่เท่านั้น'});res.json(db.prepare(`SELECT rm.*,creator.display_name created_by_name,submitter.display_name submitted_by_name,approver.display_name approved_by_name FROM remittances rm JOIN users creator ON creator.id=rm.created_by LEFT JOIN users submitter ON submitter.id=rm.submitted_by LEFT JOIN users approver ON approver.id=rm.approved_by ORDER BY rm.remittance_date DESC,rm.id DESC`).all())})
  app.post('/api/remittances', requirePermission('finance.manage'), (req,res,next)=>{try{const {date}=validate(z.object({date:z.iso.date()}),req.body);const duplicate=db.prepare(`SELECT id FROM remittances WHERE remittance_date=? AND status!='cancelled'`).get(date);if(duplicate)throw httpError(409,'DUPLICATE_REMITTANCE','มีรายการนำส่งของวันนี้แล้ว');const methodRows=db.prepare(`SELECT p.method,SUM(p.amount) amount FROM payments p JOIN receipts r ON r.payment_id=p.id WHERE r.status='issued' AND date(p.paid_at)=? GROUP BY p.method`).all(date);const total=methodRows.reduce((sum,row)=>sum+row.amount,0);const deposit=db.prepare(`SELECT COALESCE(SUM(ii.amount*p.amount/i.total),0) amount FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id WHERE r.status='issued' AND date(p.paid_at)=? AND ii.item_type='deposit'`).get(date).amount;const cash=methodRows.find(x=>x.method==='cash')?.amount||0;const transfer=total-cash;const no=nextDocumentNo(db,'remittances','remittance_no','REM');const result=db.prepare(`INSERT INTO remittances(remittance_no,remittance_date,revenue_amount,deposit_amount,cash_amount,transfer_amount,created_by) VALUES (?,?,?,?,?,?,?)`).run(no,date,Number((total-deposit).toFixed(2)),Number(deposit.toFixed(2)),cash,transfer,req.user.id);const after=getById(db,'remittances',Number(result.lastInsertRowid));writeAudit(db,req,{action:'CREATE',entityType:'remittance',entityId:after.id,after});res.status(201).json(after)}catch(error){next(error)}})
  app.post('/api/remittances/:id/submit', requirePermission('finance.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'remittances',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบรายการนำส่งเงิน');if(before.status!=='draft')throw httpError(409,'INVALID_STATUS','ส่งอนุมัติได้เฉพาะรายการฉบับร่าง');db.prepare(`UPDATE remittances SET status='submitted',submitted_by=?,submitted_at=CURRENT_TIMESTAMP WHERE id=?`).run(req.user.id,id);const after=getById(db,'remittances',id);writeAudit(db,req,{action:'SUBMIT',entityType:'remittance',entityId:id,before,after});res.json(after)}catch(error){next(error)}})
  app.post('/api/remittances/:id/approve', requirePermission('finance.approve'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'remittances',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบรายการนำส่งเงิน');if(before.status!=='submitted')throw httpError(409,'INVALID_STATUS','อนุมัติได้เฉพาะรายการที่ส่งอนุมัติแล้ว');const b=validate(z.object({revenueTransferReference:z.string().max(200).optional(),depositTransferReference:z.string().max(200).optional(),universityReceiptNo:z.string().min(1).max(200)}),req.body);if(before.revenue_amount>0&&!b.revenueTransferReference)throw httpError(400,'REVENUE_REFERENCE_REQUIRED','กรุณาระบุเลขอ้างอิงการโอนรายได้');if(before.deposit_amount>0&&!b.depositTransferReference)throw httpError(400,'DEPOSIT_REFERENCE_REQUIRED','กรุณาระบุเลขอ้างอิงการโอนเงินประกัน');db.prepare(`UPDATE remittances SET status='approved',revenue_transfer_reference=?,deposit_transfer_reference=?,university_receipt_no=?,approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.revenueTransferReference||null,b.depositTransferReference||null,b.universityReceiptNo,req.user.id,id);const after=getById(db,'remittances',id);writeAudit(db,req,{action:'APPROVE',entityType:'remittance',entityId:id,before,after});res.json(after)}catch(error){next(error)}})
  app.post('/api/remittances/:id/cancel', requirePermission('finance.cancel'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'remittances',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบรายการนำส่งเงิน');if(before.status==='cancelled')throw httpError(409,'ALREADY_CANCELLED','รายการนี้ถูกยกเลิกแล้ว');const {reason}=validate(z.object({reason:z.string().min(5).max(1000)}),req.body);db.prepare(`UPDATE remittances SET status='cancelled',cancelled_reason=?,cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason,req.user.id,id);const after=getById(db,'remittances',id);writeAudit(db,req,{action:'CANCEL',entityType:'remittance',entityId:id,before,after});res.json(after)}catch(error){next(error)}})

  app.get('/api/reports/daily-receipts', requirePermission('reports.read'), (req,res)=>{const date=req.query.date||new Date().toISOString().slice(0,10);res.json(db.prepare(`SELECT u.display_name issuer,COUNT(*) receipt_count,SUM(p.amount) total FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN users u ON u.id=r.issued_by WHERE r.status='issued' AND date(r.created_at)=? GROUP BY r.issued_by ORDER BY issuer`).all(date))})
  app.get('/api/reports/daily-summary', requirePermission('reports.read'), (req,res)=>{const date=req.query.date||new Date().toISOString().slice(0,10);res.json(db.prepare(`SELECT ii.item_type,SUM(ii.amount*(p.amount/i.total)) amount FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN invoice_items ii ON ii.invoice_id=i.id JOIN receipts r ON r.payment_id=p.id WHERE r.status='issued' AND date(p.paid_at)=? GROUP BY ii.item_type ORDER BY ii.item_type`).all(date))})
  app.get('/api/reports/remittance', requirePermission('reports.read'), (req,res)=>{const date=req.query.date||new Date().toISOString().slice(0,10);res.json({date,byMethod:db.prepare(`SELECT p.method,COUNT(*) transactions,SUM(p.amount) total FROM payments p JOIN receipts r ON r.payment_id=p.id WHERE r.status='issued' AND date(p.paid_at)=? GROUP BY p.method`).all(date)})})
  app.get('/api/reports/receipt-register', requirePermission('reports.read'), (req,res)=>{const from=req.query.from||'0000-01-01',to=req.query.to||'9999-12-31';res.json(db.prepare(`SELECT r.receipt_no,r.status,p.amount,p.method,p.reference_no,p.paid_at,i.invoice_no,t.tenant_code,t.first_name,t.last_name,u.display_name issuer FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN tenants t ON t.id=i.tenant_id JOIN users u ON u.id=r.issued_by WHERE date(p.paid_at) BETWEEN ? AND ? ORDER BY r.receipt_no`).all(from,to))})
  app.get('/api/reports/debtors', requirePermission('reports.read'), (req,res)=>res.json(db.prepare(`SELECT i.invoice_no,i.due_date,i.total,i.balance,CAST(julianday('now')-julianday(i.due_date) AS INTEGER) age_days,t.tenant_code,t.tenant_type,t.first_name,t.last_name FROM invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.balance>0 AND i.status!='cancelled' ORDER BY age_days DESC`).all()))
  app.get('/api/reports/deposits', requirePermission('reports.read'), (_req,res)=>res.json(db.prepare(`SELECT t.tenant_code,t.first_name,t.last_name,SUM(ii.amount) deposit_amount FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN tenants t ON t.id=i.tenant_id WHERE ii.item_type='deposit' AND i.status='paid' GROUP BY t.id ORDER BY t.tenant_code`).all()))
  app.get('/api/reports/contracts', requirePermission('reports.read'), (_req,res)=>res.json(db.prepare(`SELECT l.contract_no,l.contract_type,l.starts_at,l.ends_at,l.deposit_amount,l.status,t.tenant_code,t.tenant_type,t.first_name,t.last_name,r.room_no,b.bed_no FROM leases l JOIN tenants t ON t.id=l.tenant_id LEFT JOIN beds b ON b.id=l.bed_id LEFT JOIN rooms r ON r.id=b.room_id ORDER BY l.starts_at DESC,l.contract_no`).all()))
  app.get('/api/reports/catalog', requirePermission('reports.read'), (_req,res)=>res.json(reportCatalog))
  app.get('/api/reports/general', requirePermission('reports.read'), (req,res,next)=>{try{res.json(buildReport(db,req.query))}catch(error){next(error)}})
  app.get('/api/reports/general/export.xlsx', requirePermission('reports.read'), async (req,res,next)=>{try{const report=buildReport(db,req.query),buffer=await createReportXlsx(report);const filename=`dormitory-${report.type}-${new Date().toISOString().slice(0,10)}.xlsx`;res.set({'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, no-store'}).send(Buffer.from(buffer))}catch(error){next(error)}})
}

function financialAccount(purpose, bank, name, number, branch) {
  const digits=(number||'').replace(/\D/g,'')
  return { purpose,bank,name:name||'ยังไม่ได้กำหนด',accountNoMasked:digits?`•••-${digits.slice(-4)}`:'ยังไม่ได้กำหนด',branch:branch||'ยังไม่ได้กำหนด',configured:Boolean(name&&number) }
}

function registerSupportRoutes(app, db) {
  app.get('/api/repairs', requirePermission('repairs.read'), (req,res)=>{const filter=req.user.tenant_id?'WHERE rp.tenant_id=?':'';res.json(db.prepare(`SELECT rp.*,r.room_no,f.floor_no,b.name building_name,u.display_name reporter_account FROM repairs rp LEFT JOIN rooms r ON r.id=rp.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=f.building_id LEFT JOIN users u ON u.id=rp.reported_by ${filter} ORDER BY rp.id DESC`).all(...(req.user.tenant_id?[req.user.tenant_id]:[])))})
  app.get('/api/repairs/:id', requirePermission('repairs.read'), (req,res,next)=>{try{const id=numberId(req),repair=db.prepare(`SELECT rp.*,r.room_no,f.floor_no,b.name building_name FROM repairs rp LEFT JOIN rooms r ON r.id=rp.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=f.building_id WHERE rp.id=?`).get(id);if(!repair||(req.user.tenant_id&&repair.tenant_id!==req.user.tenant_id))throw httpError(404,'NOT_FOUND','ไม่พบงานซ่อม');res.json({...repair,updates:db.prepare(`SELECT ru.*,u.display_name performed_by_name FROM repair_updates ru JOIN users u ON u.id=ru.performed_by WHERE ru.repair_id=? ORDER BY ru.id`).all(id),inventoryUsage:db.prepare(`SELECT x.*,i.sku,i.name,i.unit,u.display_name performed_by_name FROM repair_inventory_usage x JOIN inventory_items i ON i.id=x.item_id JOIN users u ON u.id=x.performed_by WHERE x.repair_id=? ORDER BY x.id`).all(id)})}catch(error){next(error)}})
  app.post('/api/repairs', (req,res,next)=>{try{if(!req.user.permissions.some(x=>['repairs.create','repairs.manage'].includes(x)))throw httpError(403,'FORBIDDEN','ไม่มีสิทธิ์แจ้งซ่อม');const b=validate(z.object({roomId:idSchema.nullable().optional(),title:z.string().min(1),detail:z.string().max(2000).optional(),priority:z.enum(['low','normal','high','urgent']).default('normal'),source:z.enum(['staff','tenant']).optional(),reporterName:z.string().max(200).optional(),tenantId:idSchema.nullable().optional()}),req.body);const tenantId=req.user.tenant_id||b.tenantId||null,source=req.user.tenant_id?'tenant':(b.source||'staff');const ownRoom=req.user.tenant_id?db.prepare(`SELECT room_id FROM beds WHERE tenant_id=? AND status IN ('reserved','occupied') LIMIT 1`).get(req.user.tenant_id)?.room_id:null;const roomId=req.user.tenant_id?(ownRoom||null):(b.roomId||null);const result=transaction(db,()=>{const created=db.prepare(`INSERT INTO repairs(room_id,title,detail,priority,reported_by,source,tenant_id,reporter_name,workflow_status) VALUES (?,?,?,?,?,?,?,?,?)`).run(roomId,b.title,b.detail||null,b.priority,req.user.id,source,tenantId,b.reporterName||req.user.display_name,'waiting');db.prepare(`INSERT INTO repair_updates(repair_id,status,detail,performed_by) VALUES (?,'waiting',?,?)`).run(created.lastInsertRowid,'รับเรื่องแจ้งซ่อม',req.user.id);return created});const after=getById(db,'repairs',Number(result.lastInsertRowid));writeAudit(db,req,{action:'CREATE',entityType:'repair',entityId:after.id,after});res.status(201).json(after)}catch(error){next(error)}})
  app.patch('/api/repairs/:id', requirePermission('repairs.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'repairs',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบงานซ่อม');const b=validate(z.object({assignedTo:z.string().max(200).nullable().optional(),detail:z.string().max(2000).optional(),priority:z.enum(['low','normal','high','urgent']).optional()}),req.body);db.prepare(`UPDATE repairs SET assigned_to=CASE WHEN ? THEN ? ELSE assigned_to END,detail=COALESCE(?,detail),priority=COALESCE(?,priority),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(Object.hasOwn(b,'assignedTo')?1:0,b.assignedTo||null,b.detail||null,b.priority||null,id);const after=getById(db,'repairs',id);writeAudit(db,req,{action:'UPDATE',entityType:'repair',entityId:id,before,after});res.json(after)}catch(error){next(error)}})
  app.post('/api/repairs/:id/updates', requirePermission('repairs.manage'), async (req,res,next)=>{try{const id=numberId(req),before=getById(db,'repairs',id);if(!before)throw httpError(404,'NOT_FOUND','ไม่พบงานซ่อม');const b=validate(z.object({status:z.enum(['waiting','repairing','waiting_parts','completed','closed']),detail:z.string().min(1).max(2000)}),req.body);if(b.status==='closed'&&before.workflow_status!=='completed')throw httpError(409,'NOT_COMPLETED','ต้องบันทึกว่าซ่อมเรียบร้อยก่อนปิดงาน');const legacy={waiting:'reported',repairing:'repairing',waiting_parts:'assigned',completed:'completed',closed:'completed'}[b.status];transaction(db,()=>{db.prepare(`INSERT INTO repair_updates(repair_id,status,detail,performed_by) VALUES (?,?,?,?)`).run(id,b.status,b.detail,req.user.id);db.prepare(`UPDATE repairs SET workflow_status=?,status=?,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,closed_at=CASE WHEN ?='closed' THEN CURRENT_TIMESTAMP ELSE closed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.status,legacy,b.status,b.status,id)});const after=getById(db,'repairs',id);if(after.tenant_id)await notifyTenant(db,{tenantId:after.tenant_id,type:'repair_update',title:`อัปเดตงานซ่อม: ${after.title}`,message:b.detail,entityType:'repair',entityId:id});writeAudit(db,req,{action:b.status==='closed'?'CLOSE':'STATUS_CHANGE',entityType:'repair',entityId:id,before,after:{...after,detail:b.detail}});res.json(after)}catch(error){next(error)}})
  app.post('/api/repairs/:id/inventory-usage', requirePermission('repairs.manage'), (req,res,next)=>{try{const id=numberId(req),repair=getById(db,'repairs',id);if(!repair)throw httpError(404,'NOT_FOUND','ไม่พบงานซ่อม');const b=validate(z.object({itemId:idSchema,quantity:z.number().positive()}),req.body),item=getById(db,'inventory_items',b.itemId,'AND deleted_at IS NULL');if(!item)throw httpError(404,'ITEM_NOT_FOUND','ไม่พบอุปกรณ์');if(item.quantity<b.quantity)throw httpError(400,'INSUFFICIENT_STOCK','จำนวนคงเหลือไม่เพียงพอ');const usageId=transaction(db,()=>{const usage=db.prepare(`INSERT INTO repair_inventory_usage(repair_id,item_id,quantity,performed_by) VALUES (?,?,?,?)`).run(id,b.itemId,b.quantity,req.user.id);db.prepare(`INSERT INTO inventory_movements(item_id,movement_type,quantity,reference,performed_by) VALUES (?,'out',?,?,?)`).run(b.itemId,b.quantity,`งานซ่อม #${id}`,req.user.id);db.prepare(`UPDATE inventory_items SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.quantity,b.itemId);return Number(usage.lastInsertRowid)});const after=getById(db,'repair_inventory_usage',usageId);writeAudit(db,req,{action:'USE_INVENTORY',entityType:'repair',entityId:id,after});res.status(201).json(after)}catch(error){next(error)}})
  app.get('/api/inventory', requirePermission('inventory.read'), (_req,res)=>res.json(db.prepare(`SELECT * FROM inventory_items WHERE deleted_at IS NULL ORDER BY category,name`).all()))
  app.post('/api/inventory', requirePermission('inventory.manage'), (req,res,next)=>{try{const b=validate(z.object({sku:z.string().min(1),name:z.string().min(1),category:z.enum(['dormitory','maintenance','cleaning','other']),unit:z.string().min(1),quantity:z.number().nonnegative().default(0),reorderLevel:z.number().nonnegative().default(0)}),req.body);const result=db.prepare(`INSERT INTO inventory_items(sku,name,category,unit,quantity,reorder_level) VALUES (?,?,?,?,?,?)`).run(b.sku,b.name,b.category,b.unit,b.quantity,b.reorderLevel);const after=getById(db,'inventory_items',Number(result.lastInsertRowid));writeAudit(db,req,{action:'CREATE',entityType:'inventory',entityId:after.id,after});res.status(201).json(after)}catch(error){next(error)}})
  app.post('/api/inventory/:id/movements', requirePermission('inventory.manage'), (req,res,next)=>{try{const id=numberId(req),before=getById(db,'inventory_items',id,'AND deleted_at IS NULL');if(!before)throw httpError(404,'NOT_FOUND','ไม่พบรายการสต็อก');const b=validate(z.object({type:z.enum(['in','out','adjust']),quantity:z.number(),reference:z.string().max(500).optional()}).refine(x=>x.type==='adjust'||x.quantity>0,{message:'จำนวนรับเข้า/เบิกออกต้องมากกว่า 0'}),req.body);const newQuantity=b.type==='adjust'?b.quantity:before.quantity+(b.type==='in'?b.quantity:-b.quantity);if(newQuantity<0)throw httpError(400,'INSUFFICIENT_STOCK','จำนวนคงเหลือไม่เพียงพอ');transaction(db,()=>{db.prepare(`INSERT INTO inventory_movements(item_id,movement_type,quantity,reference,performed_by) VALUES (?,?,?,?,?)`).run(id,b.type,b.quantity,b.reference||null,req.user.id);db.prepare(`UPDATE inventory_items SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(newQuantity,id)});const after=getById(db,'inventory_items',id);writeAudit(db,req,{action:'STOCK_MOVEMENT',entityType:'inventory',entityId:id,before,after:{...after,movement:b}});res.json(after)}catch(error){next(error)}})
}
