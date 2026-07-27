import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateLdap } from './ldap.js'

const jwtSecret = () => process.env.JWT_SECRET || 'development-only-change-this-secret'

export function loadUser(db, userId) {
  const user = db.prepare(`SELECT id,username,display_name,email,auth_source,status,tenant_id FROM users WHERE id=? AND deleted_at IS NULL`).get(userId)
  if (!user) return null
  const roles = db.prepare(`SELECT r.id,r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.deleted_at IS NULL`).all(userId)
  const permissions = db.prepare(`SELECT DISTINCT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?`).all(userId).map(x => x.code)
  return { ...user, roles, permissions }
}

export async function verifyCredentials(db, username, password) {
  const existing = db.prepare(`SELECT * FROM users WHERE username=? AND deleted_at IS NULL`).get(username)
  if (existing?.status === 'disabled') return null
  if (existing?.auth_source === 'local' && existing.password_hash && await bcrypt.compare(password, existing.password_hash)) return loadUser(db, existing.id)

  const ldapUser = await authenticateLdap(username, password)
  if (!ldapUser) return null
  let user = existing
  if (!user) {
    const result = db.prepare(`INSERT INTO users(username,display_name,email,auth_source) VALUES (?,?,?,'ldap')`)
      .run(username, ldapUser.displayName, ldapUser.email)
    user = { id: Number(result.lastInsertRowid) }
  } else {
    db.prepare(`UPDATE users SET display_name=?,email=?,auth_source='ldap',updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(ldapUser.displayName, ldapUser.email, user.id)
  }
  return loadUser(db, user.id)
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, jwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '8h' })
}

export function authRequired(db) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'กรุณาเข้าสู่ระบบ' })
    try {
      const payload = jwt.verify(token, jwtSecret())
      const user = loadUser(db, Number(payload.sub))
      if (!user || user.status !== 'active') return res.status(401).json({ error: 'INVALID_USER', message: 'ผู้ใช้งานไม่พร้อมใช้งาน' })
      req.user = user
      next()
    } catch {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token ไม่ถูกต้องหรือหมดอายุ' })
    }
  }
}

export function requirePermission(code) {
  return (req, res, next) => req.user.permissions.includes(code)
    ? next()
    : res.status(403).json({ error: 'FORBIDDEN', message: `ไม่มีสิทธิ์ ${code}` })
}
