# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the four financial-reporting, visible-total, inventory-ledger, and future-policy cancellation defects identified in commit `03659d9`.

**Architecture:** Keep the existing API contracts and SQLite schema. Add one pure web helper for visible totals, make inventory creation atomic with its opening movement, allocate revenue in integer cents, and distinguish never-effective inactive policies from historical ended policies.

**Tech Stack:** Node.js test runner, Express, Zod, better-sqlite3, React, Vite

## Global Constraints

- Do not add dependencies.
- Preserve all endpoint paths and response shapes.
- Preserve historical revenue reports for policies that previously took effect.
- Do not modify or restore unrelated working-tree changes.

---

### Task 1: Visible report totals

**Files:**
- Create: `apps/web/src/containers/Reports/reportTotals.js`
- Create: `apps/web/test/report-totals.test.js`
- Modify: `apps/web/src/containers/Reports/Reports.jsx:32-71`

**Interfaces:**
- Produces: `calculateReportTotals(columns, rows) -> Record<string, number>`
- Consumes: report column definitions and the filtered/sorted rows already computed by `Reports`

- [ ] **Step 1: Write the failing unit test**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateReportTotals } from '../src/containers/Reports/reportTotals.js'

test('calculates totals from only the visible report rows', () => {
  const columns = [{ key: 'label' }, { key: 'amount', type: 'money' }, { key: 'count', type: 'number' }]
  assert.deepEqual(calculateReportTotals(columns, [{ label: 'matched', amount: 12.5, count: 2 }]), { amount: 12.5, count: 2 })
})
```

- [ ] **Step 2: Run the web test and confirm RED**

Run: `node --test apps/web/test/report-totals.test.js`
Expected: FAIL because `reportTotals.js` does not exist.

- [ ] **Step 3: Implement the helper and use visible totals**

```js
export function calculateReportTotals(columns, rows) {
  return Object.fromEntries(columns
    .filter(column => ['money', 'number'].includes(column.type))
    .map(column => [column.key, rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0)]))
}
```

Import the helper in `Reports.jsx`, compute `visibleTotals` with `useMemo`, and replace footer reads of `report.totals` with `visibleTotals`.

- [ ] **Step 4: Run the web test and confirm GREEN**

Run: `node --test apps/web/test/report-totals.test.js`
Expected: PASS.

### Task 2: Opening inventory movement

**Files:**
- Modify: `apps/api/test/app.test.js:507-515`
- Modify: `apps/api/src/app.js:643`

**Interfaces:**
- The existing `POST /api/inventory` response remains the created inventory item.
- A positive opening quantity produces one `inventory_movements` row with type `adjust`.

- [ ] **Step 1: Extend the inventory integration test**

After creating `LINEN-001`, query its movements and assert the literal opening state:

```js
const opening = db.prepare(`SELECT movement_type,quantity,reference FROM inventory_movements WHERE item_id=? ORDER BY id`).all(item.body.id)
assert.deepEqual(opening, [{ movement_type:'adjust', quantity:10, reference:'ยอดเริ่มต้น' }])
```

- [ ] **Step 2: Run the API test and confirm RED**

Run: `npm run test:api`
Expected: FAIL because inventory creation currently inserts no movement.

- [ ] **Step 3: Make item and opening movement atomic**

Wrap the item insert and conditional movement insert in the existing `transaction(db, fn)` helper. Insert the opening movement only when `quantity > 0`, using `req.user.id` and the reference `ยอดเริ่มต้น`.

- [ ] **Step 4: Run the API test and confirm GREEN**

Run: `npm run test:api`
Expected: PASS.

### Task 3: Exact revenue allocation

**Files:**
- Modify: `apps/api/test/app.test.js:653-704`
- Modify: `apps/api/src/reports.js:86-94`

**Interfaces:**
- `buildReport` retains the same row fields.
- Each row guarantees `reclaim_amount + university_amount === full_amount` at two-decimal precision.

- [ ] **Step 1: Add a one-satang 50/50 regression case**

Create a 50/50 room policy, issue and pay a 0.01-baht room invoice in its effective period, then assert:

```js
assert.equal(tinyRow.full_amount, 0.01)
assert.equal(Number((tinyRow.reclaim_amount + tinyRow.university_amount).toFixed(2)), 0.01)
```

- [ ] **Step 2: Run the API test and confirm RED**

Run: `npm run test:api`
Expected: FAIL because both halves currently round independently to 0.01.

- [ ] **Step 3: Allocate integer cents**

For every remittance row, compute `fullCents = Math.round(row.amount * 100)`, `reclaimCents = Math.round(fullCents * row.reclaim_rate)`, and `universityCents = fullCents - reclaimCents`; convert the three values back to baht for the response.

- [ ] **Step 4: Run the API test and confirm GREEN**

Run: `npm run test:api`
Expected: PASS.

### Task 4: Cancel never-effective policies

**Files:**
- Modify: `apps/api/test/app.test.js:670-681`
- Modify: `apps/api/src/app.js:534`
- Modify: `apps/api/src/reports.js:90`

**Interfaces:**
- `PATCH /api/revenue-share-policies/:id` still requires a reason for `active:false`.
- Never-effective cancelled policies return `active:0` and `ends_at:null`.
- Historical inactive policies with an `ends_at` remain eligible inside their effective range.

- [ ] **Step 1: Add the future-cancellation regression test**

Cancel a policy whose start date is later than the business date and assert status 200, `active === 0`, and `ends_at === null`. Query a report after that start date and assert the cancelled policy code is absent.

- [ ] **Step 2: Run the API test and confirm RED**

Run: `npm run test:api`
Expected: FAIL with `INVALID_DATE_RANGE` from the current cancellation handler.

- [ ] **Step 3: Implement cancellation and selection rules**

Calculate the Bangkok business date with `Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' })`. For a future policy cancelled without an explicit end date, retain `ends_at=null`; for a started policy, use the Bangkok date. Add this predicate to policy selection:

```sql
AND (policy.active=1 OR policy.ends_at IS NOT NULL)
```

This excludes never-effective cancellations while retaining ended historical policies.

- [ ] **Step 4: Run the API test and confirm GREEN**

Run: `npm run test:api`
Expected: PASS.

### Task 5: Full verification

**Files:**
- Verify all modified files

**Interfaces:**
- Consumes all deliverables from Tasks 1-4.
- Produces fresh evidence for completion.

- [ ] **Step 1: Run all tests and the production build**

Run: `npm run test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run build`
Expected: all API and web tests pass; Vite exits 0.

- [ ] **Step 2: Check patch integrity**

Run: `git diff --check; git status --short; git diff --stat`
Expected: no whitespace errors; only planned files plus the user's pre-existing changes appear.
