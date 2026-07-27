import { sendNotificationEmail } from './email.js'

export async function notifyTenant(db, { tenantId, type, title, message, entityType, entityId }) {
  const recipient = db.prepare(`SELECT t.email,u.id user_id FROM tenants t LEFT JOIN users u ON u.tenant_id=t.id AND u.status='active' AND u.deleted_at IS NULL WHERE t.id=? ORDER BY u.id LIMIT 1`).get(tenantId)
  const system = db.prepare(`INSERT INTO notifications(recipient_user_id,tenant_id,notification_type,channel,title,message,entity_type,entity_id,delivery_status) VALUES (?,?,?,'system',?,?,?,?,'delivered')`)
    .run(recipient?.user_id || null, tenantId, type, title, message, entityType, entityId)
  let emailStatus = 'not_requested'
  if (recipient?.email) {
    const email = db.prepare(`INSERT INTO notifications(recipient_user_id,tenant_id,notification_type,channel,title,message,entity_type,entity_id) VALUES (?,?,?,'email',?,?,?,?)`)
      .run(recipient.user_id || null, tenantId, type, title, message, entityType, entityId)
    try { emailStatus = (await sendNotificationEmail({ to: recipient.email, title, message })).status }
    catch { emailStatus = 'failed' }
    db.prepare(`UPDATE notifications SET delivery_status=? WHERE id=?`).run(emailStatus, email.lastInsertRowid)
  }
  return { systemNotificationId: Number(system.lastInsertRowid), emailStatus }
}
