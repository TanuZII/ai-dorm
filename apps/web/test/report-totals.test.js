import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateReportTotals } from '../src/containers/Reports/reportTotals.js'

test('calculates totals from only the visible report rows', () => {
  const columns = [
    { key: 'label' },
    { key: 'amount', type: 'money' },
    { key: 'count', type: 'number' },
    { key: 'rate', type: 'percentage' },
  ]
  const visibleRows = [{ label: 'matched', amount: 12.5, count: 2, rate: 50 }]

  assert.deepEqual(calculateReportTotals(columns, visibleRows), { amount: 12.5, count: 2 })
})
