import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const defaultDbFile = fileURLToPath(new URL('../../../data/dormitory.db', import.meta.url))

export const permissions = [
  ['users.read', 'ดูผู้ใช้งาน'], ['users.manage', 'เพิ่ม แก้ไข และลบผู้ใช้งาน'],
  ['roles.read', 'ดูกลุ่มและสิทธิ์'], ['roles.manage', 'จัดการกลุ่มและสิทธิ์'],
  ['audit.read', 'ตรวจสอบประวัติการใช้งาน'],
  ['tenants.read', 'ดูข้อมูลผู้เช่า'], ['tenants.manage', 'จัดการข้อมูลผู้เช่า'],
  ['contracts.read', 'ดูสัญญาของตนเอง'], ['contracts.sign', 'ยืนยันและลงนามสัญญาของตนเอง'],
  ['rooms.read', 'ดูอาคาร ห้อง และเตียง'], ['rooms.manage', 'จัดการสถานะห้องและเตียง'],
  ['finance.read', 'ดูข้อมูลการเงิน'], ['finance.manage', 'ตั้งหนี้และรับชำระเงิน'],
  ['finance.cancel', 'ยกเลิกใบแจ้งหนี้ ใบเสร็จ และรายการนำส่ง'],
  ['finance.approve', 'ตรวจหลักฐานและอนุมัติการนำส่งเงิน'], ['reports.read', 'ดูและส่งออกรายงาน'],
  ['repairs.read', 'ดูงานซ่อม'], ['repairs.manage', 'จัดการงานซ่อม'],
  ['repairs.create', 'แจ้งซ่อมผ่านระบบ'],
  ['announcements.read', 'ดูข่าวสาร'], ['announcements.manage', 'จัดการและส่งข่าวสาร'],
  ['announcements.comment', 'แสดงความคิดเห็นในข่าวสาร'],
  ['inventory.read', 'ดูสต็อก'], ['inventory.manage', 'จัดการสต็อก'],
  ['master.read', 'ดูข้อมูลพื้นฐานและนโยบายค่าเช่า'], ['master.manage', 'จัดการข้อมูลพื้นฐานและนโยบายค่าเช่า'],
]

export function createDb(filename = process.env.DB_FILE || defaultDbFile) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT,
      display_name TEXT NOT NULL, email TEXT, auth_source TEXT NOT NULL DEFAULT 'local',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      tenant_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, cancellation_reason TEXT, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active', cancellation_reason TEXT, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      description TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id), role_id INTEGER NOT NULL REFERENCES roles(id),
      PRIMARY KEY(user_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id), permission_id INTEGER NOT NULL REFERENCES permissions(id),
      PRIMARY KEY(role_id, permission_id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY, actor_id INTEGER, actor_username TEXT, action TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT, before_data TEXT, after_data TEXT,
      ip_address TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS master_data (
      id INTEGER PRIMARY KEY, category TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
      parent_id INTEGER REFERENCES master_data(id), details_json TEXT,
      active INTEGER NOT NULL DEFAULT 1, cancellation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, code)
    );
    CREATE INDEX IF NOT EXISTS idx_master_category ON master_data(category, active);

    CREATE TABLE IF NOT EXISTS rate_policies (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      tenant_cohort TEXT NOT NULL, rental_period TEXT NOT NULL,
      rate_scope TEXT NOT NULL CHECK(rate_scope IN ('person','room')),
      amount REAL NOT NULL DEFAULT 0, occupancy_limit INTEGER NOT NULL DEFAULT 2,
      utility_split_divisor INTEGER NOT NULL DEFAULT 1,
      water_rate REAL NOT NULL DEFAULT 23, electricity_rate REAL NOT NULL DEFAULT 7,
      deposit_amount REAL NOT NULL DEFAULT 2000, due_day INTEGER NOT NULL DEFAULT 5,
      late_fee REAL NOT NULL DEFAULT 100, delinquency_months INTEGER NOT NULL DEFAULT 1,
      termination_action TEXT, starts_at TEXT NOT NULL, ends_at TEXT,
      active INTEGER NOT NULL DEFAULT 1, cancellation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academic_terms (
      id INTEGER PRIMARY KEY, academic_year TEXT NOT NULL, term TEXT NOT NULL,
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY, tenant_code TEXT NOT NULL UNIQUE,
      tenant_type TEXT NOT NULL CHECK(tenant_type IN ('student','staff','external')),
      title TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, national_id TEXT,
      email TEXT, phone TEXT, current_address TEXT, faculty TEXT, department TEXT,
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, gender_policy TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS floors (
      id INTEGER PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES buildings(id), floor_no INTEGER NOT NULL,
      UNIQUE(building_id, floor_no)
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY, floor_id INTEGER NOT NULL REFERENCES floors(id), room_no TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'vacant' CHECK(status IN ('vacant','occupied','unavailable','damaged')),
      reason TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(floor_id, room_no)
    );
    CREATE TABLE IF NOT EXISTS beds (
      id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id), bed_no TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'vacant' CHECK(status IN ('vacant','reserved','occupied','unavailable','damaged')),
      tenant_id INTEGER REFERENCES tenants(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, bed_no)
    );
    CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY, contract_no TEXT NOT NULL UNIQUE,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id), bed_id INTEGER REFERENCES beds(id),
      contract_type TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      deposit_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contract_documents (
      id INTEGER PRIMARY KEY, lease_id INTEGER NOT NULL REFERENCES leases(id), version INTEGER NOT NULL,
      document_state TEXT NOT NULL CHECK(document_state IN ('draft','sent','signed','superseded')),
      filename TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf', pdf_data BLOB NOT NULL,
      sha256 TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(lease_id, version, document_state)
    );
    CREATE TABLE IF NOT EXISTS contract_events (
      id INTEGER PRIMARY KEY, lease_id INTEGER NOT NULL REFERENCES leases(id), event_type TEXT NOT NULL,
      actor_id INTEGER, actor_username TEXT, detail_json TEXT, ip_address TEXT, user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY, recipient_user_id INTEGER REFERENCES users(id), tenant_id INTEGER REFERENCES tenants(id),
      notification_type TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('system','email')),
      title TEXT NOT NULL, message TEXT NOT NULL, entity_type TEXT, entity_id INTEGER,
      delivery_status TEXT NOT NULL DEFAULT 'queued', read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      audience_type TEXT NOT NULL CHECK(audience_type IN ('all','room')),
      room_id INTEGER REFERENCES rooms(id), comments_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
      published_at TEXT, created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(audience_type='all' OR room_id IS NOT NULL)
    );
    CREATE TABLE IF NOT EXISTS announcement_comments (
      id INTEGER PRIMARY KEY, announcement_id INTEGER NOT NULL REFERENCES announcements(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id), user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(status,audience_type,room_id,published_at);
    CREATE INDEX IF NOT EXISTS idx_announcement_comments ON announcement_comments(announcement_id,status,created_at);
    CREATE TABLE IF NOT EXISTS tenant_documents (
      id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), document_type TEXT NOT NULL,
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, file_data BLOB NOT NULL, sha256 TEXT NOT NULL,
      uploaded_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY, reservation_no TEXT NOT NULL UNIQUE,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id), room_id INTEGER NOT NULL REFERENCES rooms(id),
      bed_id INTEGER REFERENCES beds(id), reservation_scope TEXT NOT NULL CHECK(reservation_scope IN ('bed','room')),
      starts_at TEXT NOT NULL, ends_at TEXT, status TEXT NOT NULL DEFAULT 'reserved'
        CHECK(status IN ('reserved','checked_in','cancelled','expired')),
      condition_snapshot TEXT, created_by INTEGER NOT NULL, cancellation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS room_transfers (
      id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      from_bed_id INTEGER NOT NULL REFERENCES beds(id), to_bed_id INTEGER NOT NULL REFERENCES beds(id),
      transfer_date TEXT NOT NULL, reason TEXT NOT NULL, created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS checkouts (
      id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id), lease_id INTEGER REFERENCES leases(id),
      bed_id INTEGER REFERENCES beds(id), checkout_date TEXT NOT NULL, damage_detail TEXT,
      damage_amount REAL NOT NULL DEFAULT 0, outstanding_debt REAL NOT NULL DEFAULT 0,
      deposit_amount REAL NOT NULL DEFAULT 0, refund_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed', created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS room_inspections (
      id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id),
      readiness_status TEXT NOT NULL CHECK(readiness_status IN ('ready','not_ready')),
      checklist_json TEXT, note TEXT, confirmed_by INTEGER NOT NULL,
      confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS meter_readings (
      id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id),
      utility_type TEXT NOT NULL CHECK(utility_type IN ('water','electricity')),
      billing_month TEXT NOT NULL, previous_reading REAL NOT NULL, current_reading REAL NOT NULL,
      consumption REAL NOT NULL, unit_rate REAL NOT NULL, total_amount REAL NOT NULL,
      divisor INTEGER NOT NULL, amount_per_bed REAL NOT NULL, due_date TEXT NOT NULL,
      invoice_issued_at TEXT, recorded_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, utility_type, billing_month)
    );

    CREATE TABLE IF NOT EXISTS rate_plans (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, rental_period TEXT NOT NULL CHECK(rental_period IN ('daily','monthly','term','yearly')),
      amount REAL NOT NULL CHECK(amount >= 0), starts_at TEXT NOT NULL, ends_at TEXT,
      tenant_type TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS utility_rates (
      id INTEGER PRIMARY KEY, utility_type TEXT NOT NULL CHECK(utility_type IN ('water','electricity')),
      unit_rate REAL NOT NULL CHECK(unit_rate >= 0), minimum_charge REAL NOT NULL DEFAULT 0,
      starts_at TEXT NOT NULL, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS fee_types (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, default_amount REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY, invoice_no TEXT NOT NULL UNIQUE, tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','partial','paid','cancelled')),
      total REAL NOT NULL DEFAULT 0, balance REAL NOT NULL DEFAULT 0, cancelled_reason TEXT,
      cancelled_by INTEGER, cancelled_at TEXT, created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      item_type TEXT NOT NULL, description TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL, amount REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id), amount REAL NOT NULL CHECK(amount > 0),
      method TEXT NOT NULL CHECK(method IN ('cash','transfer','bank_file','online_account')),
      reference_no TEXT, paid_at TEXT NOT NULL, received_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY, receipt_no TEXT NOT NULL UNIQUE, payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id),
      status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','cancelled')),
      cancelled_reason TEXT, cancelled_by INTEGER, cancelled_at TEXT, issued_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bank_imports (
      id INTEGER PRIMARY KEY, bank_code TEXT NOT NULL, filename TEXT NOT NULL, row_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL, error_count INTEGER NOT NULL, imported_by INTEGER NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payment_proofs (
      id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id), amount REAL NOT NULL CHECK(amount > 0),
      reference_no TEXT, paid_at TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL,
      file_base64 TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','cancelled')),
      review_note TEXT, reviewed_by INTEGER, reviewed_at TEXT, payment_id INTEGER REFERENCES payments(id),
      submitted_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS remittances (
      id INTEGER PRIMARY KEY, remittance_no TEXT NOT NULL UNIQUE, remittance_date TEXT NOT NULL,
      revenue_amount REAL NOT NULL DEFAULT 0, deposit_amount REAL NOT NULL DEFAULT 0,
      cash_amount REAL NOT NULL DEFAULT 0, transfer_amount REAL NOT NULL DEFAULT 0,
      revenue_transfer_reference TEXT, deposit_transfer_reference TEXT, university_receipt_no TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','cancelled')),
      submitted_by INTEGER, submitted_at TEXT, approved_by INTEGER, approved_at TEXT,
      cancelled_reason TEXT, cancelled_by INTEGER, cancelled_at TEXT,
      created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repairs (
      id INTEGER PRIMARY KEY, room_id INTEGER REFERENCES rooms(id), title TEXT NOT NULL, detail TEXT,
      priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'reported'
        CHECK(status IN ('reported','assigned','repairing','completed','cancelled')),
      reported_by INTEGER, assigned_to TEXT, completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS repair_updates (
      id INTEGER PRIMARY KEY, repair_id INTEGER NOT NULL REFERENCES repairs(id),
      status TEXT NOT NULL CHECK(status IN ('waiting','repairing','waiting_parts','completed','closed')),
      detail TEXT, performed_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS repair_inventory_usage (
      id INTEGER PRIMARY KEY, repair_id INTEGER NOT NULL REFERENCES repairs(id),
      item_id INTEGER NOT NULL REFERENCES inventory_items(id), quantity REAL NOT NULL CHECK(quantity > 0),
      performed_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('dormitory','maintenance','cleaning','other')),
      unit TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, reorder_level REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      movement_type TEXT NOT NULL CHECK(movement_type IN ('in','out','adjust')),
      quantity REAL NOT NULL, reference TEXT, performed_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  ensureColumn(db, 'users', 'cancellation_reason', 'TEXT')
  ensureColumn(db, 'roles', 'status', "TEXT NOT NULL DEFAULT 'active'")
  ensureColumn(db, 'roles', 'cancellation_reason', 'TEXT')
  ensureColumn(db, 'rooms', 'readiness_status', "TEXT NOT NULL DEFAULT 'ready'")
  ensureColumn(db, 'rooms', 'readiness_confirmed_at', 'TEXT')
  ensureColumn(db, 'rooms', 'readiness_confirmed_by', 'INTEGER')
  ensureColumn(db, 'repairs', 'source', "TEXT NOT NULL DEFAULT 'staff'")
  ensureColumn(db, 'repairs', 'tenant_id', 'INTEGER')
  ensureColumn(db, 'repairs', 'reporter_name', 'TEXT')
  ensureColumn(db, 'repairs', 'workflow_status', "TEXT NOT NULL DEFAULT 'waiting'")
  ensureColumn(db, 'repairs', 'closed_at', 'TEXT')
  ensureColumn(db, 'tenants', 'line_id', 'TEXT')
  ensureColumn(db, 'tenants', 'program', 'TEXT')
  ensureColumn(db, 'tenants', 'major', 'TEXT')
  ensureColumn(db, 'tenants', 'organization', 'TEXT')
  ensureColumn(db, 'tenants', 'guardian_name', 'TEXT')
  ensureColumn(db, 'tenants', 'guardian_phone', 'TEXT')
  ensureColumn(db, 'tenants', 'guardian_email', 'TEXT')
  ensureColumn(db, 'tenants', 'guardian_line_id', 'TEXT')
  ensureColumn(db, 'tenants', 'emergency_contact_name', 'TEXT')
  ensureColumn(db, 'tenants', 'emergency_contact_phone', 'TEXT')
  ensureColumn(db, 'tenants', 'emergency_contact_relation', 'TEXT')
  ensureColumn(db, 'leases', 'contract_date', 'TEXT')
  ensureColumn(db, 'leases', 'rental_period', "TEXT NOT NULL DEFAULT 'monthly'")
  ensureColumn(db, 'leases', 'advance_rent', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'leases', 'minimum_term_months', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'leases', 'document_status', "TEXT NOT NULL DEFAULT 'draft'")
  ensureColumn(db, 'leases', 'version', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'leases', 'previous_lease_id', 'INTEGER')
  ensureColumn(db, 'leases', 'sent_at', 'TEXT')
  ensureColumn(db, 'leases', 'signed_at', 'TEXT')
  ensureColumn(db, 'leases', 'signed_by', 'INTEGER')
  ensureColumn(db, 'leases', 'signature_method', 'TEXT')
  ensureColumn(db, 'leases', 'signature_evidence_json', 'TEXT')
  ensureColumn(db, 'leases', 'document_sha256', 'TEXT')
  ensureColumn(db, 'leases', 'renewal_requested_at', 'TEXT')
  ensureColumn(db, 'leases', 'tenant_confirmed_at', 'TEXT')
  ensureColumn(db, 'invoices', 'email_sent_at', 'TEXT')
  seed(db)
  return db
}

function seed(db) {
  const addPermission = db.prepare(`INSERT OR IGNORE INTO permissions(code,name) VALUES (?,?)`)
  for (const permission of permissions) addPermission.run(...permission)

  db.prepare(`INSERT OR IGNORE INTO roles(name,description) VALUES ('ผู้ดูแลระบบ','เข้าถึงและบริหารจัดการทุกโมดูล')`).run()
  const adminRole = db.prepare(`SELECT id FROM roles WHERE name='ผู้ดูแลระบบ'`).get()
  db.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions`).run(adminRole.id)
  const tenantRole = db.prepare(`SELECT id FROM roles WHERE name='ผู้เช่า' AND deleted_at IS NULL`).get()
  if (tenantRole) db.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code IN ('repairs.read','repairs.create','contracts.read','contracts.sign','finance.read','announcements.read','announcements.comment')`).run(tenantRole.id)

  const adminExists = db.prepare(`SELECT id FROM users WHERE username='admin'`).get()
  if (!adminExists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_INITIAL_PASSWORD || 'Admin@1234', 12)
    const result = db.prepare(`INSERT INTO users(username,password_hash,display_name,email) VALUES (?,?,?,?)`)
      .run('admin', hash, 'ผู้ดูแลระบบ', 'admin@university.local')
    db.prepare(`INSERT INTO user_roles(user_id,role_id) VALUES (?,?)`).run(result.lastInsertRowid, adminRole.id)
  }

  db.prepare(`INSERT OR IGNORE INTO academic_terms(id,academic_year,term,starts_at,ends_at) VALUES (1,'2569','1','2026-06-01','2026-10-31')`).run()
  db.prepare(`INSERT OR IGNORE INTO buildings(id,code,name,gender_policy) VALUES (1,'B01','อาคาร 1 · หอพักหญิง','female')`).run()
  for (let floorNo = 1; floorNo <= 4; floorNo++) {
    db.prepare(`INSERT OR IGNORE INTO floors(id,building_id,floor_no) VALUES (?,?,?)`).run(floorNo, 1, floorNo)
    for (let room = 1; room <= 8; room++) {
      const roomNo = `${floorNo}${String(room).padStart(2, '0')}`
      db.prepare(`INSERT OR IGNORE INTO rooms(floor_id,room_no) VALUES (?,?)`).run(floorNo, roomNo)
      const roomRow = db.prepare(`SELECT id FROM rooms WHERE floor_id=? AND room_no=?`).get(floorNo, roomNo)
      db.prepare(`INSERT OR IGNORE INTO beds(room_id,bed_no) VALUES (?,'A')`).run(roomRow.id)
      db.prepare(`INSERT OR IGNORE INTO beds(room_id,bed_no) VALUES (?,'B')`).run(roomRow.id)
    }
  }
  db.prepare(`INSERT OR IGNORE INTO fee_types(code,name,default_amount) VALUES ('ROOM','ค่าห้องพัก',0)`).run()
  db.prepare(`INSERT OR IGNORE INTO fee_types(code,name,default_amount) VALUES ('DEPOSIT','เงินประกัน',3000)`).run()
  db.prepare(`INSERT OR IGNORE INTO fee_types(code,name,default_amount) VALUES ('LATE_FEE','ค่าปรับชำระล่าช้า',0)`).run()
  seedMasterData(db)
  seedRatePolicies(db)
}

function ensureColumn(db, table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function seedMasterData(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO master_data(category,code,name,parent_id,details_json) VALUES (?,?,?,?,?)`)
  const rows = [
    ['title','MR','นาย'],['title','MRS','นาง'],['title','MISS','นางสาว'],
    ['country','TH','ประเทศไทย'],
    ['tenant_type','STUDENT','นักศึกษา'],['tenant_type','STAFF','บุคลากร มหาวิทยาลัยสวนดุสิต'],
    ['tenant_type','ALUMNI_DAILY','ศิษย์เก่า มสด. (รายวัน)'],['tenant_type','EXTERNAL','บุคคลภายนอก (รายวัน / รายเดือน)'],['tenant_type','OTHER','อื่นๆ'],
    ['room_type','STANDARD','ห้องพักธรรมดา'],['room_type','CENTRAL','ห้องพักโซนกลาง'],['room_type','SUITE','ห้องชุด'],
    ['room_type','ELECTRICAL','ห้องไฟ'],['room_type','PUMP','ห้องปั๊มน้ำ'],['room_type','OFFICE','ห้องสำนักงาน'],
    ['room_type','RECREATION','ห้องสันทนาการสำหรับนักศึกษา'],['room_type','SHARED_BATH','ห้องน้ำรวมประจำอาคาร'],
    ['building','PRAMOTE1','อาคารปราโมทย์ 1'],['building','PRAMOTE2','อาคารปราโมทย์ 2'],['building','PRAMOTE3','อาคารปราโมทย์ 3'],
    ['rental_type','DAILY','รายวัน'],['rental_type','MONTHLY','รายเดือน'],['rental_type','TERM','รายภาคเรียน'],['rental_type','YEARLY','รายปี'],
    ['contract_type','STUDENT_TERM','สัญญานักศึกษา ต่อรายภาคเรียน'],['contract_type','STUDENT_MONTH','สัญญานักศึกษา ต่อรายเดือน'],
    ['contract_type','STAFF_MONTH','สัญญาบุคลากร ต่อรายเดือน'],['contract_type','EXTERNAL_MONTH','สัญญาบุคคลภายนอก ต่อรายเดือน'],
    ['fee_type','ROOM','ค่าเช่าห้องพัก'],['fee_type','WATER','ค่าน้ำประปา'],['fee_type','ELECTRIC','ค่าไฟฟ้า'],
    ['fee_type','LATE','ค่าปรับชำระล่าช้า'],['fee_type','DAMAGE','ค่าปรับทำสินทรัพย์เสียหาย'],['fee_type','OTHER','ค่าอื่นๆ'],
    ['faculty','EDU','คณะครุศาสตร์'],['faculty','CULINARY','โรงเรียนการเรือน'],['faculty','TOURISM','โรงเรียนการท่องเที่ยวและบริการ'],['faculty','SCI','คณะวิทยาศาสตร์และเทคโนโลยี'],
  ]
  for (const [category,code,name] of rows) insert.run(category,code,name,null,null)
  const faculties = Object.fromEntries(db.prepare(`SELECT code,id FROM master_data WHERE category='faculty'`).all().map(x=>[x.code,x.id]))
  for (const [code,name,parent] of [['ECE','การศึกษาปฐมวัย','EDU'],['PRIMARY','การประถมศึกษา','EDU'],['HOME_ECON','คหกรรมศาสตร์','CULINARY'],['FOOD_TECH','เทคโนโลยีการประกอบอาหารและบริการ','CULINARY'],['AVIATION','ธุรกิจการบิน','TOURISM'],['COSMETIC','วิทยาศาสตร์เครื่องสำอาง','SCI']]) insert.run('major',code,name,faculties[parent],null)
}

function seedRatePolicies(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO rate_policies(code,name,tenant_cohort,rental_period,rate_scope,amount,occupancy_limit,utility_split_divisor,water_rate,electricity_rate,deposit_amount,due_day,late_fee,delinquency_months,termination_action,starts_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const base = [23,7,2000,5,100]
  const rows = [
    ['ST68_TERM','นักศึกษา รหัส 68+ รายภาคเรียน','STUDENT_68_PLUS','term','person',8000,2,2,2,'ค้างค่าสาธารณูปโภค 2 เดือน ยุติการเช่า'],
    ['ST68_YEAR','นักศึกษา รหัส 68+ รายปี','STUDENT_68_PLUS','yearly','person',16000,2,2,2,'ค้างค่าสาธารณูปโภค 2 เดือน ยุติการเช่า'],
    ['ST68_SUMMER','นักศึกษา รหัส 68+ ภาคฤดูร้อน','STUDENT_68_PLUS','term','person',6000,2,2,2,'ค้างค่าสาธารณูปโภค 2 เดือน ยุติการเช่า'],
    ['ST68_ROOM_TERM','นักศึกษา รหัส 68+ เหมาห้องรายภาคเรียน','STUDENT_68_PLUS','term','room',14000,2,1,2,'ค้างค่าสาธารณูปโภค 2 เดือน ยุติการเช่า'],
    ['ST68_ROOM_YEAR','นักศึกษา รหัส 68+ เหมาห้องรายปี','STUDENT_68_PLUS','yearly','room',28000,2,1,2,'ค้างค่าสาธารณูปโภค 2 เดือน ยุติการเช่า'],
    ['ST64_MONTH','นักศึกษา รหัส 64–67 รายเดือน','STUDENT_64_67','monthly','person',2000,2,2,2,'ค้าง 2 เดือน ยุติการเช่า'],
    ['ST64_TERM','นักศึกษา รหัส 64–67 รายภาคเรียน','STUDENT_64_67','term','person',8000,2,2,2,'ค้าง 2 เดือน ยุติการเช่า'],
    ['STAFF_MONTH','บุคลากรรายเดือน','STAFF','monthly','person',2000,2,2,1,'ค้างเกิน 1 เดือน มีสิทธิ์บอกเลิกสัญญา'],
    ['EXTERNAL_MONTH','บุคคลภายนอกรายเดือน','EXTERNAL','monthly','room',5000,2,1,1,'ค้างเกิน 1 เดือน มีสิทธิ์บอกเลิกสัญญา'],
  ]
  for (const [code,name,cohort,period,scope,amount,occupancy,split,delinquency,action] of rows) insert.run(code,name,cohort,period,scope,amount,occupancy,split,...base,delinquency,action,'2026-06-01')
}

export function cleanupAuditLogs(db, retentionDays = 90) {
  const safeDays = Math.max(90, Number(retentionDays) || 90)
  return db.prepare(`DELETE FROM audit_logs WHERE created_at < datetime('now', ?)`).run(`-${safeDays} days`)
}
