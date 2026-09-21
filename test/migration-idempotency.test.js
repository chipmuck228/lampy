const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter.js')
const { KEYS } = require('../repositories/keys.js')
const { migrateLightsToMomentsV1 } = require('../migrations/migrate-lights-to-moments-v1.js')
const { fingerprintOf } = require('../repositories/record-partition.js')

function lights() {
  return [
    {
      id: 'light-a',
      text: '今天阳光很好',
      createdAt: Date.parse('2026-09-01T10:00:00.000Z'),
      isPublic: false,
      isPassed: true,
      imagePath: 'wxfile://tmp/a.jpg',
    },
    { text: 'no-id', createdAt: 1 },
  ]
}

describe('migration idempotency', () => {
  it('marks the same source set as alreadyDone and does not duplicate entities', () => {
    const storage = createMemoryStorage({ [KEYS.lights]: lights() })
    const first = migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    const second = migrateLightsToMomentsV1({ storage, now: '2026-09-20T03:00:00.000Z' })
    assert.equal(first.alreadyDone, false)
    assert.equal(second.alreadyDone, true)
    assert.equal(second.migrated, 0)
    assert.equal(storage.get(KEYS.moments).filter((item) => item.id === 'light-a').length, 1)
    assert.equal(storage.get(KEYS.assets).filter((item) => item.id === 'asset:light-a:image').length, 1)
    assert.equal(storage.get(KEYS.transmissions).filter((item) => item.id === 'tx:legacy:passed:light-a').length, 1)
    assert.equal(storage.get(KEYS.quarantine).length, 1)
    assert.equal(storage.get(KEYS.quarantine).length, first.quarantined)
  })

  it('migrates a newly added legacy light when the marker fingerprint changes', () => {
    const storage = createMemoryStorage({ [KEYS.lights]: lights() })
    migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    const nextLights = lights().concat([{
      id: 'light-b',
      text: '新的一条',
      createdAt: Date.parse('2026-09-02T10:00:00.000Z'),
    }])
    storage.set(KEYS.lights, nextLights)
    const result = migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    assert.equal(result.alreadyDone, false)
    assert.equal(result.migrated, 1)
    assert.equal(storage.get(KEYS.moments).some((item) => item.id === 'light-a'), true)
    assert.equal(storage.get(KEYS.moments).some((item) => item.id === 'light-b'), true)
    assert.equal(storage.get(KEYS.moments).filter((item) => item.id === 'light-a').length, 1)
  })

  it('does not duplicate quarantine for the same bad light', () => {
    const storage = createMemoryStorage({ [KEYS.lights]: lights() })
    migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    storage.set(KEYS.migration, null)
    migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    assert.equal(storage.get(KEYS.quarantine).length, 1)
    assert.equal(storage.get(KEYS.quarantine)[0].entityType, 'legacy-light')
  })

  it('creates a new fingerprint when the bad record content changes', () => {
    const first = fingerprintOf('legacy-light', { text: 'no-id', createdAt: 1 })
    const second = fingerprintOf('legacy-light', { text: 'no-id-changed', createdAt: 1 })
    assert.notEqual(first, second)
  })

  it('uses the same ownerId on moment, asset, and transmissions', () => {
    const storage = createMemoryStorage({
      [KEYS.lights]: [{
        id: 'owned',
        text: '有主人',
        createdAt: Date.parse('2026-09-01T10:00:00.000Z'),
        source: 'nearby',
        isPassed: true,
        imagePath: 'wxfile://tmp/a.jpg',
      }],
    })
    migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z', ownerId: 'user-42' })
    assert.equal(storage.get(KEYS.moments)[0].ownerId, 'user-42')
    assert.equal(storage.get(KEYS.assets)[0].ownerId, 'user-42')
    const passed = storage.get(KEYS.transmissions).find((item) => item.id === 'tx:legacy:passed:owned')
    const received = storage.get(KEYS.transmissions).find((item) => item.id === 'tx:legacy:received:owned')
    assert.equal(passed.senderId, 'user-42')
    assert.equal(received.recipientId, 'user-42')
  })

  it('does not write a success marker when legacy storage is not an array', () => {
    const storage = createMemoryStorage({ [KEYS.lights]: { nope: true } })
    const result = migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    assert.equal(result.alreadyDone, false)
    assert.equal(storage.get(KEYS.migration, null), null)
    assert.equal(storage.get(KEYS.moments, []).length || 0, 0)
  })

  it('keeps valid records when one light fails', () => {
    const storage = createMemoryStorage({
      [KEYS.lights]: [
        { id: 'good', text: 'ok', createdAt: Date.parse('2026-09-01T00:00:00.000Z') },
        null,
      ],
    })
    const result = migrateLightsToMomentsV1({ storage, now: '2026-09-20T02:00:00.000Z' })
    assert.equal(result.migrated, 1)
    assert.equal(storage.get(KEYS.moments)[0].id, 'good')
    assert.equal(Object.prototype.hasOwnProperty.call(storage.get(KEYS.moments)[0], 'position'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(storage.get(KEYS.moments)[0], 'isPassed'), false)
  })
})
