const secretKeys = new Set(['password', 'password_hash', 'token', 'authorization'])

function sanitize(value) {
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    secretKeys.has(key.toLowerCase()) ? '[REDACTED]' : (item && typeof item === 'object' ? sanitize(item) : item),
  ]))
}

export function writeAudit(db, req, { action, entityType, entityId = null, before = null, after = null }) {
  db.prepare(`INSERT INTO audit_logs(
    actor_id,actor_username,action,entity_type,entity_id,before_data,after_data,ip_address,user_agent
  ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    req.user?.id ?? null,
    req.user?.username ?? req.body?.username ?? 'anonymous',
    action, entityType, entityId == null ? null : String(entityId),
    before ? JSON.stringify(sanitize(before)) : null,
    after ? JSON.stringify(sanitize(after)) : null,
    req.ip, req.get('user-agent') || null,
  )
}
