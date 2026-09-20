const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter')
const { resetRuntime } = require('../services/runtime')
const { bootstrapCatalog, listActiveMoments } = require('../services/catalog')
const { submitRecord, passLatestMoment } = require('../services/record-service')
const { receiveNearbyLight } = require('../services/nearby-service')
const { KEYS } = require('../repositories/keys')

afterEach(() => {
  resetRuntime()
})

describe('repository and page use cases', () => {
  it('saves a record and lists it as a new active moment', () => {
    const storage = createMemoryStorage({
      [KEYS.lights]: [],
      [KEYS.moments]: [],
    })
    bootstrapCatalog(storage)
    const moment = submitRecord({
      text: '喝到一杯刚好的咖啡',
      emotion: '温暖',
    }, storage)
    assert.equal(moment.lifecycle.status, 'active')
    assert.equal(moment.origin.type, 'created')
    const listed = listActiveMoments(storage)
    assert.equal(listed.some((item) => item.id === moment.id && item.content.note === '喝到一杯刚好的咖啡'), true)
    const transmission = passLatestMoment(moment.id, storage)
    assert.equal(transmission.sourceMomentId, moment.id)
    assert.equal(transmission.status, 'sent')
    assert.equal(Object.prototype.hasOwnProperty.call(listed.find((item) => item.id === moment.id), 'isPassed'), false)
  })

  it('receives a nearby light as a received moment', () => {
    const storage = createMemoryStorage({
      [KEYS.lights]: [],
      [KEYS.moments]: [],
    })
    bootstrapCatalog(storage)
    const before = listActiveMoments(storage).length
    const moment = receiveNearbyLight({
      id: 'nearby_demo',
      text: '地铁上有个小孩对我笑了一下',
      emotion: '喜悦',
      createdAt: Date.parse('2026-09-19T12:00:00.000Z'),
    }, storage)
    assert.equal(moment.origin.type, 'received')
    assert.equal(moment.ownerId, 'local-user')
    assert.equal(moment.origin.originalMomentId, 'nearby_demo')
    assert.equal(moment.origin.legacy, true)
    assert.equal(listActiveMoments(storage).length, before + 1)
  })

  it('does not treat a single bad stored moment as a total loss', () => {
    const storage = createMemoryStorage({
      [KEYS.moments]: [
        { id: 'broken' },
        null,
      ],
      [KEYS.lights]: [{
        id: 'keep-me',
        text: '雨后的空气很干净',
        createdAt: Date.parse('2026-09-10T00:00:00.000Z'),
      }],
    })
    bootstrapCatalog(storage)
    const listed = listActiveMoments(storage)
    assert.equal(listed.some((item) => item.id === 'keep-me'), true)
    assert.equal(listed.some((item) => item.id === 'broken'), false)
  })
})
