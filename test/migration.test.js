const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter')
const { KEYS } = require('../repositories/keys')
const { migrateLightsToMomentsV1, buildMigratedMoment } = require('../migrations/migrate-lights-to-moments-v1')
const { createMomentRepository } = require('../repositories/moment-repository')

const NOW = '2026-09-20T02:00:00.000Z'

function sampleLights() {
  return [
    {
      id: 'light-text',
      text: '下班路上看到晚霞',
      emotion: '平静',
      createdAt: Date.parse('2026-09-01T10:00:00.000Z'),
      isPublic: false,
      isPassed: true,
      source: '',
      imagePath: '',
      voicePath: '',
      position: { x: 0.2, y: 0.3 },
    },
    {
      id: 'collected_nearby_1',
      text: '楼下的桂花开了',
      emotion: '喜悦',
      createdAt: Date.parse('2026-09-02T10:00:00.000Z'),
      isPublic: true,
      isPassed: false,
      source: 'nearby',
      imagePath: 'wxfile://tmp/a.jpg',
      voicePath: 'wxfile://tmp/a.mp3',
      position: { x: 0.8, y: 0.1 },
    },
    { text: 'no id', createdAt: 1 },
  ]
}

describe('light to moment migration', () => {
  it('maps fields and drops position and isPassed', () => {
    const storage = createMemoryStorage({ [KEYS.lights]: sampleLights() })
    const result = migrateLightsToMomentsV1({ storage, now: NOW })
    assert.equal(result.migrated, 2)
    assert.equal(result.quarantined, 1)

    const moments = storage.get(KEYS.moments)
    const text = moments.find((item) => item.id === 'light-text')
    assert.equal(text.content.note, '下班路上看到晚霞')
    assert.equal(text.content.emotion, '平静')
    assert.equal(text.time.occurredAt, '2026-09-01T10:00:00.000Z')
    assert.equal(text.time.recordedAt, '2026-09-01T10:00:00.000Z')
    assert.equal(text.origin.type, 'created')
    assert.equal(text.accessSummary.visibility, 'private')
    assert.equal(Object.prototype.hasOwnProperty.call(text, 'position'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(text, 'isPassed'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(text, 'imagePath'), false)

    const received = moments.find((item) => item.id === 'collected_nearby_1')
    assert.equal(received.origin.type, 'received')
    assert.equal(received.origin.legacy, true)
    assert.equal(received.origin.transmissionId, 'tx:legacy:received:collected_nearby_1')
    assert.equal(received.origin.originalMomentId, 'nearby_1')
    assert.equal(received.accessSummary.visibility, 'public')
    assert.deepEqual(received.assetIds, ['asset:collected_nearby_1:image', 'asset:collected_nearby_1:audio'])

    const assets = storage.get(KEYS.assets)
    assert.equal(assets.length, 2)
    assert.equal(assets.some((item) => item.type === 'image' && item.localUri === 'wxfile://tmp/a.jpg'), true)

    const transmissions = storage.get(KEYS.transmissions)
    assert.equal(transmissions.some((item) => item.id === 'tx:legacy:passed:light-text'), true)
    assert.equal(transmissions.some((item) => item.id === 'tx:legacy:received:collected_nearby_1' && item.legacy), true)

    assert.equal(storage.get(KEYS.lights).length, 3)
    assert.ok(storage.get(KEYS.migration).version === 1)
  })

  it('is idempotent and does not duplicate', () => {
    const storage = createMemoryStorage({ [KEYS.lights]: sampleLights() })
    migrateLightsToMomentsV1({ storage, now: NOW })
    const second = migrateLightsToMomentsV1({ storage, now: NOW })
    assert.equal(second.migrated, 0)
    assert.equal(second.skipped, 2)
    assert.equal(storage.get(KEYS.moments).filter((item) => item.id === 'light-text').length, 1)
    assert.equal(storage.get(KEYS.assets).filter((item) => item.id === 'asset:collected_nearby_1:image').length, 1)
  })

  it('quarantines a corrupt record without dropping valid ones', () => {
    const storage = createMemoryStorage({
      [KEYS.lights]: [
        { id: 'ok', text: 'ok', createdAt: Date.parse(NOW), isPublic: false },
        null,
        { id: 0 },
      ],
    })
    const result = migrateLightsToMomentsV1({ storage, now: NOW })
    assert.equal(result.migrated, 1)
    assert.ok(result.quarantined >= 1)
    const repo = createMomentRepository(storage)
    assert.equal(repo.list().length, 1)
    assert.equal(repo.list()[0].id, 'ok')
  })

  it('buildMigratedMoment never copies position', () => {
    const moment = buildMigratedMoment({
      id: 'x',
      text: 'n',
      createdAt: Date.parse(NOW),
      position: { x: 0.1, y: 0.2 },
      isPassed: true,
    }, NOW)
    assert.equal(moment.position, undefined)
    assert.equal(moment.isPassed, undefined)
  })
})
