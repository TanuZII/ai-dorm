import { z } from 'zod'
import { requirePermission } from './auth.js'
import { writeAudit } from './audit.js'

const idSchema = z.coerce.number().int().positive()
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  audienceType: z.enum(['all', 'room']),
  roomId: idSchema.nullable().optional(),
  commentsEnabled: z.boolean().default(false),
  publish: z.boolean().default(true),
  expiresAt: z.iso.datetime().nullable().optional(),
  messageType: z.enum(['general', 'contract', 'invoice', 'receipt', 'overdue']).default('general'),
  entityId: idSchema.nullable().optional(),
}).refine(value => value.audienceType !== 'room' || value.roomId, { message: 'กรุณาเลือกห้องที่ต้องการแจ้ง', path: ['roomId'] })

function validate(schema, value) {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw Object.assign(new Error(result.error.issues.map(item => item.message).join(', ')), { status: 400, code: 'VALIDATION_ERROR' })
}

function fail(status, code, message) { throw Object.assign(new Error(message), { status, code }) }
function getAnnouncement(db, id) { return db.prepare(`SELECT * FROM announcements WHERE id=?`).get(id) }
function getTenantRoomId(db, tenantId) { return db.prepare(`SELECT room_id FROM beds WHERE tenant_id=? AND status IN ('reserved','occupied') ORDER BY id LIMIT 1`).get(tenantId)?.room_id || null }
function canRead(user, announcement, roomId) { return !user.tenant_id || (announcement.status === 'published' && (!announcement.expires_at || new Date(announcement.expires_at) > new Date()) && (announcement.audience_type === 'all' || announcement.room_id === roomId)) }

export function registerAnnouncementRoutes(app, db) {
  app.get('/api/announcements', requirePermission('announcements.read'), (req, res) => {
    const roomId = req.user.tenant_id ? getTenantRoomId(db, req.user.tenant_id) : null
    const where = req.user.tenant_id ? `WHERE a.status='published' AND (a.expires_at IS NULL OR datetime(a.expires_at)>CURRENT_TIMESTAMP) AND (a.audience_type='all' OR a.room_id=?)` : ''
    const params = req.user.tenant_id ? [roomId || -1] : []
    res.json(db.prepare(`SELECT a.*,r.room_no,b.name building_name,u.display_name created_by_name,
      (SELECT COUNT(*) FROM announcement_comments c WHERE c.announcement_id=a.id AND c.status='visible') comment_count
      FROM announcements a LEFT JOIN rooms r ON r.id=a.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=f.building_id
      JOIN users u ON u.id=a.created_by ${where} ORDER BY CASE a.status WHEN 'published' THEN 0 ELSE 1 END,a.published_at DESC,a.id DESC`).all(...params))
  })

  app.post('/api/announcements', requirePermission('announcements.manage'), (req, res, next) => {
    try {
      const body = validate(announcementSchema, req.body)
      if (body.roomId && !db.prepare(`SELECT id FROM rooms WHERE id=?`).get(body.roomId)) fail(404, 'ROOM_NOT_FOUND', 'ไม่พบห้องที่เลือก')
      const status = body.publish ? 'published' : 'draft'
      const result = db.prepare(`INSERT INTO announcements(title,body,audience_type,room_id,comments_enabled,status,published_at,expires_at,message_type,entity_id,created_by) VALUES (?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP END,?,?,?,?)`)
        .run(body.title, body.body, body.audienceType, body.audienceType === 'room' ? body.roomId : null, body.commentsEnabled ? 1 : 0, status, status, body.expiresAt || null, body.messageType, body.entityId || null, req.user.id)
      const created = getAnnouncement(db, Number(result.lastInsertRowid))
      writeAudit(db, req, { action: body.publish ? 'PUBLISH' : 'CREATE', entityType: 'announcement', entityId: created.id, after: created })
      res.status(201).json(created)
    } catch (error) { next(error) }
  })

  app.patch('/api/announcements/:id', requirePermission('announcements.manage'), (req, res, next) => {
    try {
      const id = validate(idSchema, req.params.id), before = getAnnouncement(db, id)
      if (!before) fail(404, 'NOT_FOUND', 'ไม่พบประกาศ')
      const body = validate(z.object({ commentsEnabled: z.boolean().optional(), status: z.enum(['draft', 'published', 'closed']).optional() }), req.body)
      db.prepare(`UPDATE announcements SET comments_enabled=COALESCE(?,comments_enabled),status=COALESCE(?,status),published_at=CASE WHEN ?='published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(body.commentsEnabled === undefined ? null : body.commentsEnabled ? 1 : 0, body.status || null, body.status || null, id)
      const after = getAnnouncement(db, id)
      writeAudit(db, req, { action: 'UPDATE', entityType: 'announcement', entityId: id, before, after })
      res.json(after)
    } catch (error) { next(error) }
  })

  app.get('/api/announcements/:id/comments', requirePermission('announcements.read'), (req, res, next) => {
    try {
      const id = validate(idSchema, req.params.id), announcement = getAnnouncement(db, id), roomId = req.user.tenant_id ? getTenantRoomId(db, req.user.tenant_id) : null
      if (!announcement || !canRead(req.user, announcement, roomId)) fail(404, 'NOT_FOUND', 'ไม่พบประกาศ')
      const visibility = req.user.tenant_id ? `AND c.status='visible'` : ''
      res.json(db.prepare(`SELECT c.id,c.body,c.status,c.created_at,t.tenant_code,t.first_name||' '||t.last_name tenant_name FROM announcement_comments c JOIN tenants t ON t.id=c.tenant_id WHERE c.announcement_id=? ${visibility} ORDER BY c.id`).all(id))
    } catch (error) { next(error) }
  })

  app.post('/api/announcements/:id/comments', requirePermission('announcements.comment'), (req, res, next) => {
    try {
      if (!req.user.tenant_id) fail(403, 'TENANT_ONLY', 'เฉพาะผู้เช่าเท่านั้นที่แสดงความคิดเห็นได้')
      const id = validate(idSchema, req.params.id), announcement = getAnnouncement(db, id), roomId = getTenantRoomId(db, req.user.tenant_id)
      if (!announcement || !canRead(req.user, announcement, roomId)) fail(404, 'NOT_FOUND', 'ไม่พบประกาศ')
      if (!announcement.comments_enabled) fail(409, 'COMMENTS_DISABLED', 'ประกาศนี้ปิดการแสดงความคิดเห็น')
      const { body } = validate(z.object({ body: z.string().trim().min(1).max(1000) }), req.body)
      const result = db.prepare(`INSERT INTO announcement_comments(announcement_id,tenant_id,user_id,body) VALUES (?,?,?,?)`).run(id, req.user.tenant_id, req.user.id, body)
      const created = db.prepare(`SELECT * FROM announcement_comments WHERE id=?`).get(Number(result.lastInsertRowid))
      writeAudit(db, req, { action: 'COMMENT', entityType: 'announcement', entityId: id, after: { commentId: created.id } })
      res.status(201).json(created)
    } catch (error) { next(error) }
  })
}
