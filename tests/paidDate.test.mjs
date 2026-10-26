import test from 'node:test'
import assert from 'node:assert/strict'
import { paidDateError, isRealDate, localToday } from '../src/utils/paidDate.js'

test('paid date validation', () => {
  assert.equal(paidDateError('2026-10-25', '2026-10-26'), '')
  assert.equal(paidDateError('2026-10-26', '2026-10-26'), '')
  assert.match(paidDateError('2026-10-27', '2026-10-26'), /future/)
  assert.match(paidDateError('', '2026-10-26'), /required/)
  assert.match(paidDateError('2026-02-30', '2026-10-26'), /valid/)
  assert.equal(isRealDate('25/10/2026'), false)
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/)
})
