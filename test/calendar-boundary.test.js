const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { projectMomentsToVault } = require('../projections/vault-projection.js')
const { ERROR_CODES } = require('../domain/moment/moment.errors.js')
const { makeActiveMoment } = require('./helpers.js')

function ids(result) {
  return result.arrangedLights.map((item) => item.id)
}

describe('vault calendar boundaries', () => {
  it('keeps same calendar day even when more than 24 hours apart in clock time if same date', () => {
    const now = Date.parse('2026-09-21T22:00:00.000Z')
    const morning = makeActiveMoment({ id: 'morning', occurredAt: '2026-09-21T01:00:00.000Z', recordedAt: '2026-09-21T01:00:00.000Z' })
    const result = projectMomentsToVault([morning], 'day', now, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(ids(result), ['morning'])
  })

  it('excludes yesterday 23:50 from today even if less than 24 hours ago', () => {
    const now = Date.parse('2026-09-21T00:10:00.000Z')
    const yesterday = makeActiveMoment({ id: 'yest', occurredAt: '2026-09-20T23:50:00.000Z', recordedAt: '2026-09-20T23:50:00.000Z' })
    const today = makeActiveMoment({ id: 'today', occurredAt: '2026-09-21T00:10:00.000Z', recordedAt: '2026-09-21T00:10:00.000Z' })
    const result = projectMomentsToVault([yesterday, today], 'day', now, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(ids(result), ['today'])
  })

  it('excludes August 31 from September month view', () => {
    const now = Date.parse('2026-09-01T02:00:00.000Z')
    const august = makeActiveMoment({ id: 'aug', occurredAt: '2026-08-31T12:00:00.000Z', recordedAt: '2026-08-31T12:00:00.000Z' })
    const sept = makeActiveMoment({ id: 'sep', occurredAt: '2026-09-01T01:00:00.000Z', recordedAt: '2026-09-01T01:00:00.000Z' })
    const result = projectMomentsToVault([august, sept], 'month', now, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(ids(result), ['sep'])
  })

  it('excludes December 31 from the next calendar year', () => {
    const now = Date.parse('2026-01-01T01:00:00.000Z')
    const dec = makeActiveMoment({ id: 'dec', occurredAt: '2025-12-31T23:00:00.000Z', recordedAt: '2025-12-31T23:00:00.000Z' })
    const jan = makeActiveMoment({ id: 'jan', occurredAt: '2026-01-01T00:30:00.000Z', recordedAt: '2026-01-01T00:30:00.000Z' })
    const result = projectMomentsToVault([dec, jan], 'year', now, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(ids(result), ['jan'])
  })

  it('excludes a day within the last 30 days if it is not this calendar month', () => {
    const now = Date.parse('2026-09-10T12:00:00.000Z')
    const lastMonth = makeActiveMoment({ id: 'aug20', occurredAt: '2026-08-20T12:00:00.000Z', recordedAt: '2026-08-20T12:00:00.000Z' })
    const result = projectMomentsToVault([lastMonth], 'month', now, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(ids(result), [])
  })

  it('excludes a day within the last 365 days if it is not this calendar year', () => {
    const now = Date.parse('2026-03-01T12:00:00.000Z')
    const lastYear = makeActiveMoment({ id: 'y2025', occurredAt: '2025-06-01T12:00:00.000Z', recordedAt: '2025-06-01T12:00:00.000Z' })
    const result = projectMomentsToVault([lastYear], 'year', now, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(ids(result), [])
  })

  it('applies UTC+8 calendar boundaries', () => {
    const now = Date.parse('2026-09-21T16:10:00.000Z')
    const stillSundayUtc = makeActiveMoment({
      id: 'edge',
      occurredAt: '2026-09-21T15:50:00.000Z',
      recordedAt: '2026-09-21T15:50:00.000Z',
    })
    const utc = projectMomentsToVault([stillSundayUtc], 'day', now, { timezoneOffsetMinutes: 0 })
    const plus8 = projectMomentsToVault([stillSundayUtc], 'day', now, { timezoneOffsetMinutes: 480 })
    assert.deepEqual(ids(utc), ['edge'])
    assert.deepEqual(ids(plus8), [])
  })

  it('applies UTC-5 calendar boundaries', () => {
    const now = Date.parse('2026-09-21T10:10:00.000Z')
    const moment = makeActiveMoment({
      id: 'west',
      occurredAt: '2026-09-21T03:50:00.000Z',
      recordedAt: '2026-09-21T03:50:00.000Z',
    })
    const utc = projectMomentsToVault([moment], 'day', now, { timezoneOffsetMinutes: 0 })
    const minus5 = projectMomentsToVault([moment], 'day', now, { timezoneOffsetMinutes: -300 })
    assert.deepEqual(ids(utc), ['west'])
    assert.deepEqual(ids(minus5), [])
  })

  it('is deterministic for the same timezone', () => {
    const now = Date.parse('2026-09-21T02:00:00.000Z')
    const moment = makeActiveMoment({ id: 'd', occurredAt: '2026-09-21T01:00:00.000Z', recordedAt: '2026-09-21T01:00:00.000Z' })
    const a = projectMomentsToVault([moment], 'day', now, { timezoneOffsetMinutes: 480 })
    const b = projectMomentsToVault([moment], 'day', now, { timezoneOffsetMinutes: 480 })
    assert.deepEqual(a, b)
  })

  it('rejects an illegal view instead of treating it as year', () => {
    const now = Date.parse('2026-03-01T00:00:00.000Z')
    const lastYear = makeActiveMoment({ id: 'old', occurredAt: '2025-03-01T00:00:00.000Z', recordedAt: '2025-03-01T00:00:00.000Z' })
    assert.throws(() => projectMomentsToVault([lastYear], 'decade', now, { timezoneOffsetMinutes: 0 }), (error) => {
      assert.equal(error.code, ERROR_CODES.VAULT_INVALID_VIEW)
      return true
    })
  })
})
