import assert from 'node:assert/strict'
import test from 'node:test'

import { activeUtilityRate } from '../src/containers/MeterOperations/utilityRates.js'

test('selects the latest active utility rate for the billing month', () => {
  const rates = [
    { id: 1, utility_type: 'electricity', unit_rate: 7, starts_at: '2026-01-01', ends_at: null, active: 1 },
    { id: 2, utility_type: 'electricity', unit_rate: 9, starts_at: '2026-08-01', ends_at: null, active: 1 },
    { id: 3, utility_type: 'water', unit_rate: 23, starts_at: '2026-01-01', ends_at: null, active: 1 },
  ]

  assert.equal(activeUtilityRate(rates, 'electricity', '2026-07').unit_rate, 7)
  assert.equal(activeUtilityRate(rates, 'electricity', '2026-08').unit_rate, 9)
  assert.equal(activeUtilityRate(rates, 'water', '2026-08').unit_rate, 23)
  assert.equal(activeUtilityRate(rates, 'water', ''), null)
})
