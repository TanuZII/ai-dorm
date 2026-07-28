# Integration Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มระบบจำลอง LDAP/AD, Bank settlement และ Online Payment ที่ทดสอบจากหน้าจอถึง Payment, Receipt, Report และ Audit Log ได้ครบวงจร โดยไม่มีทางเปิดใช้งานใน Production

**Architecture:** เพิ่ม Integration composition root ที่เลือก Real/Simulated Adapter เพียงจุดเดียว แล้วฉีด Adapter เข้า authentication และ route modules แทนการกระจาย flag ตาม business logic การลงบัญชีจากเงินสด หลักฐานธนาคาร ไฟล์ธนาคาร และ payment callback ใช้ payment service เดียวกันเพื่อคุม transaction กับ idempotency ส่วน UI อ่าน capability จาก health endpoint และแสดง Simulator เฉพาะผู้มี `integrations.simulate`

**Tech Stack:** Node.js 24, Express 5, `node:sqlite`, Zod 4, `node:crypto`, `node:test`, React 18, Vite 5, Tailwind CSS

## Global Constraints

- เปิดระบบจำลองได้ด้วย `INTEGRATION_SIMULATION=true` เฉพาะเมื่อ `NODE_ENV` ไม่ใช่ `production`
- หาก Production เปิด simulation โปรแกรมต้องหยุดก่อนเปิด HTTP listener
- Callback ใช้ HMAC-SHA256, timestamp อายุไม่เกิน 5 นาที และ event ID แบบ idempotent
- สกุลเงิน Online Payment คือ `THB`
- Endpoint จำลองตอบ `404` เมื่อ simulation ปิด และต้องใช้ `integrations.simulate` เมื่อเป็นคำสั่งของเจ้าหน้าที่
- ห้ามเก็บหรือ log password, signing secret, raw authorization header และ raw HMAC signature
- ใช้ข้อมูลบุคคลสมมติเท่านั้น
- ไม่เปลี่ยนกฎค่าเช่า ห้องพัก สัญญา และรายงานที่ไม่เกี่ยวข้อง
- Production code ใหม่ทุกพฤติกรรมต้องมี failing test ก่อนตาม TDD

---

## File Map

- `apps/api/src/integrations/config.js` — parse configuration และ production startup guard
- `apps/api/src/integrations/index.js` — composition root และ Adapter selection
- `apps/api/src/integrations/directory.js` — Real/Simulated Directory Adapter
- `apps/api/src/integrations/bank.js` — canonical bank parser และ simulated CSV generator
- `apps/api/src/integrations/paymentGateway.js` — session payload, HMAC signing และ callback verification
- `apps/api/src/integrations/routes.js` — simulation status, scenarios, timeline, reset, sessions และ callbacks
- `apps/api/src/finance/postPayment.js` — transaction กลางสำหรับ Payment/Receipt/Invoice
- `apps/api/src/app.js` — inject integrations และ register routes; route เดิมเรียก service กลาง
- `apps/api/src/auth.js` — รับ Directory Adapter ผ่าน dependency injection
- `apps/api/src/db.js` — permission, integration runs/events, payment sessions และ uniqueness constraints
- `apps/api/src/index.js` — validate configuration ก่อน listen
- `apps/api/test/helpers/apiHarness.js` — test server, login และ request helpers
- `apps/api/test/integration-config.test.js` — configuration guard tests
- `apps/api/test/payment-posting.test.js` — transaction และ idempotency tests
- `apps/api/test/directory-simulation.test.js` — Directory scenarios และ redaction tests
- `apps/api/test/bank-simulation.test.js` — CSV/import end-to-end tests
- `apps/api/test/payment-simulation.test.js` — session/callback/security end-to-end tests
- `apps/api/test/simulation-routes.test.js` — permission, timeline และ reset-scope tests
- `apps/web/src/containers/IntegrationSimulator/IntegrationSimulator.jsx` — หน้าศูนย์ทดสอบ
- `apps/web/src/containers/IntegrationSimulator/model.js` — pure UI mapping/filter helpers
- `apps/web/src/components/SimulationBadge/SimulationBadge.jsx` — ป้ายเตือน simulation
- `apps/web/src/components/Sidebar/Sidebar.jsx` — เมนูแบบ capability/permission-aware
- `apps/web/src/containers/Dashboard/Dashboard.jsx` — fetch status และ route ไป Simulator
- `apps/web/src/containers/Login/Login.jsx` — แสดง badge จาก public health
- `apps/web/test/integration-simulator.test.js` — pure model tests
- `apps/api/.env.example`, `docs/BACKEND.md`, `docs/REQUIREMENTS-3.11-3.22.md` — configuration และ coverage ที่แยก Simulation จาก Production

---

### Task 1: Configuration Guard and Test Harness

**Files:**
- Create: `apps/api/src/integrations/config.js`
- Create: `apps/api/test/helpers/apiHarness.js`
- Create: `apps/api/test/integration-config.test.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/app.js`

**Interfaces:**
- Produces: `readIntegrationConfig(env): { simulationEnabled: boolean, mode: 'real'|'simulated', callbackSecret: string|null, directoryPassword: string|null }`
- Produces: `assertSafeIntegrationConfig(config, env): void`
- Produces: `startApiHarness({ env?, integrations? }): Promise<{ db, base, api, login, close }>`
- `createApp({ db, integrations, integrationConfig })` remains backward-compatible for existing tests

- [ ] **Step 1: Write failing configuration tests**

```js
test('rejects integration simulation in production', () => {
  const config = readIntegrationConfig({ NODE_ENV: 'production', INTEGRATION_SIMULATION: 'true' })
  assert.throws(() => assertSafeIntegrationConfig(config, { NODE_ENV: 'production' }), {
    code: 'SIMULATION_FORBIDDEN_IN_PRODUCTION',
  })
})

test('enables simulation only for the exact true value', () => {
  assert.equal(readIntegrationConfig({ NODE_ENV: 'test', INTEGRATION_SIMULATION: 'true', PAYMENT_CALLBACK_SECRET: 'test-callback-secret', SIM_DIRECTORY_PASSWORD: 'Directory@123' }).simulationEnabled, true)
  assert.equal(readIntegrationConfig({ NODE_ENV: 'test', INTEGRATION_SIMULATION: 'false' }).simulationEnabled, false)
})

test('requires simulation-only secrets when simulation is enabled', () => {
  const config = readIntegrationConfig({ NODE_ENV: 'test', INTEGRATION_SIMULATION: 'true' })
  assert.throws(() => assertSafeIntegrationConfig(config, { NODE_ENV: 'test' }), { code: 'SIMULATION_CONFIG_INCOMPLETE' })
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run from `apps/api`:

```powershell
node --test test/integration-config.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/integrations/config.js`.

- [ ] **Step 3: Implement strict configuration parsing and startup guard**

```js
export function readIntegrationConfig(env = process.env) {
  const simulationEnabled = env.INTEGRATION_SIMULATION === 'true'
  return {
    simulationEnabled,
    mode: simulationEnabled ? 'simulated' : 'real',
    callbackSecret: env.PAYMENT_CALLBACK_SECRET || null,
    directoryPassword: env.SIM_DIRECTORY_PASSWORD || null,
  }
}

export function assertSafeIntegrationConfig(config, env = process.env) {
  if (env.NODE_ENV === 'production' && config.simulationEnabled) {
    const error = new Error('Integration simulation cannot run in production')
    error.code = 'SIMULATION_FORBIDDEN_IN_PRODUCTION'
    throw error
  }
  if (config.simulationEnabled && (!config.callbackSecret || !config.directoryPassword)) {
    const error = new Error('Simulation secrets are required')
    error.code = 'SIMULATION_CONFIG_INCOMPLETE'
    throw error
  }
}
```

Call both functions in `index.js` before `createApp()` and before `app.listen()`. Pass the parsed config into `createApp`. Add `apiHarness.js` using `createDb(':memory:')`, `createApp(options).listen(0, '127.0.0.1')`, a JSON-aware `api()` helper, and deterministic cleanup.

- [ ] **Step 4: Verify GREEN and regression**

```powershell
node --test test/integration-config.test.js
npm test
```

Expected: configuration tests pass; existing API suite reports zero failures.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/integrations/config.js apps/api/src/index.js apps/api/src/app.js apps/api/test/helpers/apiHarness.js apps/api/test/integration-config.test.js
git commit -m "feat: guard integration simulation configuration"
```

---

### Task 2: Persistence, Permission, and Shared Payment Posting

**Files:**
- Modify: `apps/api/src/db.js`
- Create: `apps/api/src/finance/postPayment.js`
- Create: `apps/api/test/payment-posting.test.js`
- Modify: `apps/api/src/app.js`

**Interfaces:**
- Produces: `postPayment(db, { invoiceId, amount, method, referenceNo, paidAt, receivedBy, idempotencyKey?, simulationId?, onPosted? }): { payment, receipt, duplicate }`
- Adds permission: `integrations.simulate`
- Adds tables: `integration_runs`, `integration_events`, `payment_sessions`
- Adds unique partial-safe application constraint through `payments.idempotency_key UNIQUE`

- [ ] **Step 1: Write failing payment service tests**

```js
test('posts payment, receipt and invoice balance atomically', () => {
  const result = postPayment(db, {
    invoiceId, amount: 8000, method: 'bank_file', referenceNo: 'BANK-001',
    paidAt: '2026-07-28T10:00:00.000Z', receivedBy: adminId,
    idempotencyKey: 'bank:BANK-001', simulationId: 'SIM-001',
  })
  assert.equal(result.duplicate, false)
  assert.equal(db.prepare('SELECT status FROM invoices WHERE id=?').get(invoiceId).status, 'paid')
  assert.equal(db.prepare('SELECT COUNT(*) count FROM receipts').get().count, 1)
})

test('returns the original receipt for an idempotency key', () => {
  const first = postPayment(db, paymentInput)
  const second = postPayment(db, paymentInput)
  assert.equal(second.duplicate, true)
  assert.equal(second.payment.id, first.payment.id)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM payments').get().count, 1)
})
```

- [ ] **Step 2: Verify RED**

```powershell
node --test test/payment-posting.test.js
```

Expected: FAIL because `postPayment.js` does not exist.

- [ ] **Step 3: Add exact schema and seed changes**

Add `['integrations.simulate', 'ใช้งานระบบจำลอง Integration']` to `permissions`. Add these persisted fields/tables with foreign keys and indexes:

```sql
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN simulation_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_idempotency ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS integration_runs (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('directory','bank','payment')),
  scenario TEXT NOT NULL, status TEXT NOT NULL, created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reset_at TEXT
);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES integration_runs(id), event_id TEXT,
  event_type TEXT NOT NULL, status TEXT NOT NULL, external_reference TEXT,
  detail_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id, event_id)
);

CREATE TABLE IF NOT EXISTS payment_sessions (
  id TEXT PRIMARY KEY, run_id TEXT REFERENCES integration_runs(id), invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id), amount REAL NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'THB' CHECK(currency='THB'), status TEXT NOT NULL,
  provider_reference TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, payment_id INTEGER REFERENCES payments(id),
  created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Use the existing `ensureColumn` migration style for the two payment columns so existing SQLite files upgrade safely.

- [ ] **Step 4: Implement `postPayment` and replace duplicate route logic**

The service must start `BEGIN IMMEDIATE`, return the existing joined Payment/Receipt when `idempotency_key` exists, reject cancelled/fully-paid invoices, reject amount above balance, insert Payment and Receipt, update Invoice status, call optional `onPosted({ payment, receipt })` inside the same transaction, then commit. Roll back on every error. Change `/api/payments`, approved payment proof, and `/api/bank-imports` callers to use this service without changing their response contracts. Approved payment proof uses `onPosted` to update `payment_proofs`, avoiding a nested SQLite transaction.

- [ ] **Step 5: Verify GREEN and all finance regressions**

```powershell
node --test test/payment-posting.test.js
npm test
```

Expected: payment service tests and existing finance/cancellation/report tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/db.js apps/api/src/finance/postPayment.js apps/api/src/app.js apps/api/test/payment-posting.test.js
git commit -m "refactor: centralize atomic payment posting"
```

---

### Task 3: Directory Adapter and LDAP Scenarios

**Files:**
- Create: `apps/api/src/integrations/directory.js`
- Create: `apps/api/src/integrations/index.js`
- Modify: `apps/api/src/ldap.js`
- Modify: `apps/api/src/auth.js`
- Modify: `apps/api/src/app.js`
- Create: `apps/api/test/directory-simulation.test.js`

**Interfaces:**
- Produces: `createDirectoryAdapter(config): { configured: boolean, mode: string, authenticate(username, password): Promise<DirectoryIdentity|null> }`
- `DirectoryIdentity = { username, displayName, email }`
- Changes: `verifyCredentials(db, username, password, { directory })`
- Real adapter delegates to existing ldapts implementation; simulated adapter exposes no secret in responses

- [ ] **Step 1: Write failing scenario and redaction tests**

```js
test('logs in through the simulated directory using the normal login endpoint', async () => {
  const { api } = await startApiHarness({ env: { NODE_ENV: 'test', INTEGRATION_SIMULATION: 'true', PAYMENT_CALLBACK_SECRET: 'test-callback-secret', SIM_DIRECTORY_PASSWORD: 'Directory@123' } })
  const result = await api('/auth/login', { method: 'POST', body: { username: 'sim.student68', password: 'Directory@123' } })
  assert.equal(result.response.status, 200)
  assert.equal(result.body.user.auth_source, 'ldap')
  assert.equal(result.body.user.email, 'student68@example.test')
})

test('maps disabled and unavailable scenarios to stable error codes without logging a password', async () => {
  const disabled = await api('/auth/login', { method: 'POST', body: { username: 'sim.disabled', password: 'Directory@123' } })
  assert.equal(disabled.body.error, 'DIRECTORY_ACCOUNT_DISABLED')
  const logs = db.prepare("SELECT after_data FROM audit_logs WHERE entity_type='auth'").all()
  assert.ok(logs.every(row => !String(row.after_data).includes('Directory@123')))
})
```

- [ ] **Step 2: Verify RED**

```powershell
node --test test/directory-simulation.test.js
```

Expected: normal login returns `INVALID_CREDENTIALS` for the simulated user.

- [ ] **Step 3: Implement Directory adapters and dependency injection**

Use an immutable simulated account catalog:

```js
const simulatedAccounts = new Map([
  ['sim.student68', { displayName: 'นักศึกษาจำลอง รหัส 68', email: 'student68@example.test', scenario: 'success' }],
  ['sim.staff', { displayName: 'บุคลากรจำลอง', email: 'staff@example.test', scenario: 'success' }],
  ['sim.disabled', { displayName: 'บัญชีระงับจำลอง', email: 'disabled@example.test', scenario: 'disabled' }],
  ['sim.unavailable', { displayName: 'Directory ล่มจำลอง', email: 'unavailable@example.test', scenario: 'unavailable' }],
])
```

Compare the submitted password to `config.directoryPassword`; do not place it in the account catalog. Return typed errors `DIRECTORY_ACCOUNT_DISABLED` and `DIRECTORY_UNAVAILABLE`; return `null` for not-found/wrong password to preserve credential privacy. Inject the selected adapter into login and contract re-authentication. Do not add simulation checks inside `verifyCredentials`.
The login route must preserve these two safe typed codes while continuing to map not-found/wrong-password to `INVALID_CREDENTIALS`. Audit only username, outcome code and adapter mode.

- [ ] **Step 4: Verify GREEN and LDAP-compatible regression**

```powershell
node --test test/directory-simulation.test.js
npm test
```

Expected: all Directory scenarios pass; local login and existing contract signing remain green.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/integrations/directory.js apps/api/src/integrations/index.js apps/api/src/ldap.js apps/api/src/auth.js apps/api/src/app.js apps/api/test/directory-simulation.test.js
git commit -m "feat: add simulated directory adapter"
```

---

### Task 4: Canonical Bank Adapter and End-to-End Import

**Files:**
- Create: `apps/api/src/integrations/bank.js`
- Create: `apps/api/src/integrations/routes.js`
- Create: `apps/api/test/bank-simulation.test.js`
- Modify: `apps/api/src/app.js`
- Modify: `apps/api/src/integrations/index.js`

**Interfaces:**
- Produces: `parseSettlementCsv(csv): { records: SettlementRecord[], errors: SettlementError[] }`
- Produces: `generateSettlementCsv({ invoice, scenario, referenceNo, paidAt }): string`
- `SettlementRecord = { line, invoiceNo, amount, referenceNo, paidAt }`
- Import errors use codes: `MALFORMED_ROW`, `INVALID_TIMESTAMP`, `UNKNOWN_INVOICE`, `AMOUNT_MISMATCH`, `DUPLICATE_REFERENCE`

- [ ] **Step 1: Write failing parser and end-to-end tests**

```js
test('imports a generated success file once and exposes it in reports', async () => {
  const generated = await api('/integration-simulation/bank/files', { method: 'POST', body: { invoiceId, scenario: 'success' } })
  const first = await api('/bank-imports', { method: 'POST', body: generated.body.file })
  const second = await api('/bank-imports', { method: 'POST', body: generated.body.file })
  assert.equal(first.body.successCount, 1)
  assert.equal(second.body.successCount, 0)
  assert.equal(second.body.errors[0].code, 'DUPLICATE_REFERENCE')
  assert.equal(db.prepare('SELECT COUNT(*) count FROM payments WHERE method=?').get('bank_file').count, 1)
})

test('reports malformed, unknown, mismatch and invalid timestamp rows independently', async () => {
  assert.deepEqual(results.map(row => row.code), [
    'MALFORMED_ROW', 'UNKNOWN_INVOICE', 'AMOUNT_MISMATCH', 'INVALID_TIMESTAMP',
  ])
})
```

- [ ] **Step 2: Verify RED**

```powershell
node --test test/bank-simulation.test.js
```

Expected: FAIL with 404 for `/integration-simulation/bank/files` or missing bank adapter export.

- [ ] **Step 3: Implement the canonical parser and generator**

Parse the exact header `invoice_no,amount,reference_no,paid_at`, reject rows whose field count differs from four, validate ISO datetime with `Number.isNaN(Date.parse(value))`, and preserve source line numbers. The generator changes exactly one field for each failure scenario and returns `bankCode: 'SIMBANK'`, `filename: 'simbank-' + runId + '.csv'`, and the generated `csv`.

- [ ] **Step 4: Route imports through the adapter and shared payment service**

Replace inline CSV splitting in `/api/bank-imports` with `integrations.bank.parse`. For each valid record, resolve the invoice, require `amount === invoice.balance`, and call:

```js
postPayment(db, {
  invoiceId: invoice.id,
  amount: record.amount,
  method: 'bank_file',
  referenceNo: record.referenceNo,
  paidAt: record.paidAt,
  receivedBy: req.user.id,
  idempotencyKey: `bank:${b.bankCode}:${record.referenceNo}`,
  simulationId: req.integrationSimulationId || null,
})
```

Return `{ line, code, message }` for rejected rows and retain the existing import summary fields.

- [ ] **Step 5: Verify GREEN and reports**

```powershell
node --test test/bank-simulation.test.js
npm test
```

Expected: all six bank scenarios pass, duplicate import creates one receipt, and report regression tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/integrations/bank.js apps/api/src/integrations/routes.js apps/api/src/integrations/index.js apps/api/src/app.js apps/api/test/bank-simulation.test.js
git commit -m "feat: simulate bank settlement imports"
```

---

### Task 5: Online Payment Sessions, HMAC Callback, and Idempotency

**Files:**
- Create: `apps/api/src/integrations/paymentGateway.js`
- Modify: `apps/api/src/integrations/routes.js`
- Create: `apps/api/test/payment-simulation.test.js`
- Modify: `apps/api/src/integrations/index.js`
- Modify: `apps/api/src/app.js`

**Interfaces:**
- Produces: `canonicalCallbackBody(event): string`
- Produces: `signCallback({ body, timestamp, secret }): string`
- Produces: `verifyCallback({ rawBody, timestamp, signature, secret, now, maxAgeMs }): void`
- Adds: `POST /api/payment-sessions`
- Adds public signed callback before `app.use('/api', authRequired(db))`: `POST /api/payment-callbacks/simulated`
- Adds admin command: `POST /api/integration-simulation/payment/:sessionId/events`

- [ ] **Step 1: Write failing session, signature, ownership and duplicate tests**

```js
test('settles a tenant-owned session once after a valid success callback', async () => {
  const session = await tenantApi('/payment-sessions', { method: 'POST', body: { invoiceId, amount: 8000 } })
  const event = await adminApi(`/integration-simulation/payment/${session.body.id}/events`, { method: 'POST', body: { scenario: 'success' } })
  assert.equal(event.response.status, 200)
  const replay = await adminApi(`/integration-simulation/payment/${session.body.id}/events`, { method: 'POST', body: { scenario: 'duplicate' } })
  assert.equal(replay.body.paymentId, event.body.paymentId)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM payments WHERE method=?').get('online_account').count, 1)
})

test('rejects invalid signatures, stale timestamps, wrong amounts and cross-tenant invoices', async () => {
  assert.equal(invalidSignature.body.error, 'INVALID_CALLBACK_SIGNATURE')
  assert.equal(stale.body.error, 'EXPIRED_CALLBACK')
  assert.equal(mismatch.body.error, 'AMOUNT_MISMATCH')
  assert.equal(crossTenant.response.status, 403)
})
```

- [ ] **Step 2: Verify RED**

```powershell
node --test test/payment-simulation.test.js
```

Expected: FAIL with 404 for payment session/callback endpoints.

- [ ] **Step 3: Implement deterministic HMAC helpers**

Canonical input is `${timestamp}.${rawBody}`. Use `createHmac('sha256', secret).update(input).digest('hex')`; compare decoded equal-length buffers with `timingSafeEqual`. Reject a timestamp more than `300000` ms from injected `now`. Configure `express.json({ verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8') } })` so the callback verifies the exact received bytes before using the parsed body. Unit-test helpers through exported functions without an HTTP server.

- [ ] **Step 4: Implement tenant-owned sessions and callback state machine**

Session creation accepts only an issued/partial invoice owned by `req.user.tenant_id` unless the caller has `finance.manage`. Persist an expiry 15 minutes after creation and `provider_reference = SIMPAY-<uuid>`.

Map callbacks:

```js
const terminalStatus = {
  success: 'paid', declined: 'declined', cancelled: 'cancelled', expired: 'expired',
}
```

For success, require exact session amount/currency and call `postPayment` with `idempotencyKey: payment:<eventId>`, `simulationId: session.run_id`, and `onPosted` that stores `payment_id` plus session status `paid`. Duplicate event/provider reference returns the original payment and receipt. Other outcomes update only session/event state.

- [ ] **Step 5: Verify GREEN and security regression**

```powershell
node --test test/payment-simulation.test.js
npm test
```

Expected: success/declined/cancelled/expired/mismatch/invalid-signature/duplicate scenarios pass; all existing auth and finance tests stay green.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/integrations/paymentGateway.js apps/api/src/integrations/routes.js apps/api/src/integrations/index.js apps/api/src/app.js apps/api/test/payment-simulation.test.js
git commit -m "feat: simulate signed online payments"
```

---

### Task 6: Simulator Status, Timeline, Permissions, and Scoped Reset

**Files:**
- Modify: `apps/api/src/integrations/routes.js`
- Modify: `apps/api/src/app.js`
- Modify: `apps/api/src/audit.js`
- Create: `apps/api/test/simulation-routes.test.js`

**Interfaces:**
- Extends public `GET /api/health` with `{ integrationSimulation: { enabled, mode } }`
- Adds protected `GET /api/integration-simulation/status`
- Adds protected `GET /api/integration-simulation/runs/:id/timeline`
- Adds protected `DELETE /api/integration-simulation/runs/:id`
- Timeline item: `{ id, type, status, reference, detail, createdAt }`

- [ ] **Step 1: Write failing visibility, permission, timeline and reset tests**

```js
test('hides simulation endpoints when disabled and forbids users without permission', async () => {
  assert.equal((await disabledApi('/integration-simulation/status')).response.status, 404)
  assert.equal((await tenantApi('/integration-simulation/status')).response.status, 403)
})

test('resets only the selected run and records a redacted audit event', async () => {
  await adminApi(`/integration-simulation/runs/${runA}`, { method: 'DELETE' })
  assert.equal(db.prepare('SELECT reset_at FROM integration_runs WHERE id=?').get(runA).reset_at !== null, true)
  assert.equal(db.prepare('SELECT reset_at FROM integration_runs WHERE id=?').get(runB).reset_at, null)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM payments WHERE simulation_id=?').get(runB).count, 1)
})
```

- [ ] **Step 2: Verify RED**

```powershell
node --test test/simulation-routes.test.js
```

Expected: FAIL because status/timeline/reset contracts are incomplete.

- [ ] **Step 3: Implement route gating and normalized timeline**

Register simulation commands only when enabled; otherwise register a final `/api/integration-simulation/*` 404 handler. Apply `requirePermission('integrations.simulate')`. Status returns adapter modes and scenario catalogs but never passwords/secrets. Timeline joins `integration_runs`, `integration_events`, associated Payment/Receipt IDs and audit entries, parsing only validated `detail_json`.

- [ ] **Step 4: Implement recoverable scoped reset**

Because financial deletion is unsafe, reset must mark the run `reset_at`, cancel simulation receipts with reason built as `'รีเซ็ตข้อมูลจำลอง ' + runId`, restore invoice balances using the existing receipt-cancellation rule, and retain Payment/Event/Audit records as history. It must reject an already-reset run with `409 SIMULATION_ALREADY_RESET`. This replaces physical deletion while satisfying isolation and auditability.

- [ ] **Step 5: Expand audit redaction**

Redact case-insensitive keys matching `password`, `secret`, `signature`, `authorization`, `token`, and `fileBase64`. Test nested objects and arrays. Preserve non-sensitive `eventId`, scenario and reference fields.

- [ ] **Step 6: Verify GREEN**

```powershell
node --test test/simulation-routes.test.js
npm test
```

Expected: disabled/forbidden/timeline/reset/redaction tests pass; no production data is deleted.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/integrations/routes.js apps/api/src/app.js apps/api/src/audit.js apps/api/test/simulation-routes.test.js
git commit -m "feat: add audited integration simulator controls"
```

---

### Task 7: Integration Simulator UI and Simulation Warning

**Files:**
- Create: `apps/web/src/containers/IntegrationSimulator/IntegrationSimulator.jsx`
- Create: `apps/web/src/containers/IntegrationSimulator/model.js`
- Create: `apps/web/src/components/SimulationBadge/SimulationBadge.jsx`
- Modify: `apps/web/src/components/Sidebar/Sidebar.jsx`
- Modify: `apps/web/src/containers/Dashboard/Dashboard.jsx`
- Modify: `apps/web/src/containers/Login/Login.jsx`
- Create: `apps/web/test/integration-simulator.test.js`

**Interfaces:**
- Produces: `canShowSimulator(user, health): boolean`
- Produces: `scenarioLabel(code): string`
- Produces: `timelineTone(status): 'green'|'amber'|'red'|'blue'`
- `IntegrationSimulator({ notify })` loads status/runs and performs bank/payment scenario commands through existing `api()`

- [ ] **Step 1: Write failing pure UI model tests**

```js
test('shows simulator only when enabled and permitted', () => {
  const admin = { permissions: ['integrations.simulate'] }
  assert.equal(canShowSimulator(admin, { integrationSimulation: { enabled: true } }), true)
  assert.equal(canShowSimulator(admin, { integrationSimulation: { enabled: false } }), false)
  assert.equal(canShowSimulator({ permissions: [] }, { integrationSimulation: { enabled: true } }), false)
})

test('maps dangerous and successful outcomes to explicit labels and tones', () => {
  assert.deepEqual([scenarioLabel('invalid_signature'), timelineTone('rejected'), timelineTone('paid')], [
    'ลายเซ็นไม่ถูกต้อง', 'red', 'green',
  ])
})
```

- [ ] **Step 2: Verify RED**

```powershell
npm test --workspace @campus-nest/web
```

Expected: FAIL because `IntegrationSimulator/model.js` does not exist.

- [ ] **Step 3: Implement pure model and warning badge**

Use explicit scenario/status maps with Thai labels. `SimulationBadge` renders a high-contrast amber badge containing `ระบบจำลอง — ห้ามใช้รับเงินจริง`. It receives a boolean prop and renders `null` when disabled.

- [ ] **Step 4: Implement simulator workspace**

Build three focused panels:

- Directory: read-only account/scenario catalog without passwords
- Bank: invoice select, scenario select, generate file, import action, row results
- Online Payment: invoice/session select, scenario buttons, callback result

Add a Timeline list with type/status/reference/time and a reset confirmation requiring the user to type the run ID. Reuse existing form/button/card styling and `notify` conventions; do not introduce a UI dependency.

- [ ] **Step 5: Wire conditional navigation and badges**

Fetch `/health` before login for `Login` badge and again in `Dashboard`. Pass `showIntegrationSimulator` into `Sidebar`; append the menu only when true. Route `active === 'ศูนย์ทดสอบ Integration'` to the new container. Display the badge in the Dashboard header and Finance workspace when enabled.

- [ ] **Step 6: Verify GREEN and production build**

```powershell
npm test --workspace @campus-nest/web
npm run build
```

Expected: UI model tests pass and Vite production build exits 0 without missing imports.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/containers/IntegrationSimulator apps/web/src/components/SimulationBadge apps/web/src/components/Sidebar/Sidebar.jsx apps/web/src/containers/Dashboard/Dashboard.jsx apps/web/src/containers/Login/Login.jsx apps/web/test/integration-simulator.test.js
git commit -m "feat: add integration simulation workspace"
```

---

### Task 8: Documentation, Requirement Coverage, and Final Verification

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `docs/BACKEND.md`
- Modify: `docs/REQUIREMENTS-3.11-3.22.md`
- Modify: `README.md`
- Test: all API and Web test files

**Interfaces:**
- Documents exact variables: `INTEGRATION_SIMULATION`, `PAYMENT_CALLBACK_SECRET`, `NODE_ENV`
- Coverage keeps Production integrations as `Integration pending` and adds a separate `Simulation verified` note

- [ ] **Step 1: Add safe environment examples**

Add this disabled-by-default block:

```dotenv
# Integration simulation — ใช้เฉพาะ development/test; ห้ามเปิดใน production
INTEGRATION_SIMULATION=false
PAYMENT_CALLBACK_SECRET=replace-with-development-test-secret
SIM_DIRECTORY_PASSWORD=replace-with-development-test-password
```

Document the startup failure for `NODE_ENV=production` with simulation enabled. Do not include a working shared secret in committed files.

- [ ] **Step 2: Update operational and coverage documentation**

Document how to start Development simulation, simulated usernames without passwords, scenario names, bank file flow, online callback flow, reset semantics, and Audit Log inspection. Keep LDAP/Bank/Payment Production rows labeled `Integration pending`; add `Simulation verified` with links to automated tests so the distinction cannot be mistaken during acceptance.

- [ ] **Step 3: Run full fresh verification**

From repository root:

```powershell
npm run test
npm run build
git diff --check
git status --short
```

Expected: all API/Web tests report zero failures, Vite build exits 0, `git diff --check` has no output, and `git status --short` lists only the intended documentation changes before commit.

- [ ] **Step 4: Perform requirement-by-requirement acceptance check**

Verify and record evidence for:

```text
Directory: success, invalid credentials, not found, disabled, unavailable, contract re-authentication
Bank: success, duplicate reference, unknown invoice, mismatch, malformed row, invalid timestamp, report visibility
Payment: success, declined, cancelled, expired, mismatch, invalid signature, stale callback, duplicate delivery
Security: production guard, disabled-route 404, permission 403, tenant ownership, redacted audit, scoped reset
UI: conditional menu, warning badge, bank flow, payment flow, timeline, reset confirmation
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/.env.example docs/BACKEND.md docs/REQUIREMENTS-3.11-3.22.md README.md
git commit -m "docs: document integration simulation verification"
```

- [ ] **Step 6: Re-run final verification after commit**

```powershell
npm run test
npm run build
git diff --check
git status --short
```

Expected: tests and build exit 0, diff check has no output, and working tree is clean.
