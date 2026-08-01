import assert from 'node:assert/strict'
import test from 'node:test'

import { bangkokDate } from '../src/businessDate.js'

test('uses the Bangkok calendar date across the UTC day boundary', () => {
  assert.equal(bangkokDate(new Date('2026-08-01T18:30:00.000Z')), '2026-08-02')
})
