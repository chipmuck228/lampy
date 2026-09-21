const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter.js')
const { resetRuntime, getRuntime } = require('../services/runtime.js')
const { KEYS } = require('../repositories/keys.js')
const { passMoment } = require('../services/record-service.js')
const { ERROR_CODES } = require('../domain/moment/moment.errors.js')
const { makeActiveMoment } = require('./helpers.js')

afterEach(() => {
  resetRuntime()
})

function setup(moments) {
  const storage = createMemoryStorage({
    [KEYS.moments]: moments,
    [KEYS.transmissions]: [],
  })
  getRuntime(storage)
  return storage
}

describe('passMoment', () => {
  it('creates a transmission for the exact moment id', () => {
    const moment = makeActiveMoment({ id: 'pass-a', note: 'A' })
    const storage = setup([moment])
    const transmission = passMoment('pass-a', storage, 'local-user')
    assert.equal(transmission.sourceMomentId, 'pass-a')
    assert.equal(transmission.id, `tx:local:pass:pass-a:${moment.revision}`)
    assert.equal(transmission.status, 'sent')
    assert.match(transmission.message, /not proof of delivery/)
  })

  it('fails without an id and does not write a transmission', () => {
    const moment = makeActiveMoment({ id: 'only' })
    const storage = setup([moment])
    assert.throws(() => passMoment('', storage, 'local-user'), (error) => error.code === ERROR_CODES.MOMENT_INVALID_ID)
    assert.equal(storage.get(KEYS.transmissions).length, 0)
  })

  it('fails for a missing id and never falls back to the first moment', () => {
    const first = makeActiveMoment({ id: 'first-item', note: '第一' })
    const storage = setup([first])
    assert.throws(() => passMoment('missing-id', storage, 'local-user'), (error) => error.code === ERROR_CODES.MOMENT_INVALID_ID)
    assert.equal(storage.get(KEYS.transmissions).length, 0)
  })

  it('rejects archived and trashed moments', () => {
    const archived = makeActiveMoment({ id: 'arch', status: 'archived' })
    const trashed = makeActiveMoment({ id: 'trash', status: 'trashed' })
    const storage = setup([archived, trashed])
    assert.throws(() => passMoment('arch', storage, 'local-user'), (error) => error.code === ERROR_CODES.MOMENT_INVALID_TRANSITION)
    assert.throws(() => passMoment('trash', storage, 'local-user'), (error) => error.code === ERROR_CODES.MOMENT_INVALID_TRANSITION)
    assert.equal(storage.get(KEYS.transmissions).length, 0)
  })

  it('rejects a non-owner', () => {
    const moment = makeActiveMoment({ id: 'owned', ownerId: 'alice' })
    const storage = setup([moment])
    assert.throws(() => passMoment('owned', storage, 'bob'), (error) => error.code === ERROR_CODES.MOMENT_FORBIDDEN)
    assert.equal(storage.get(KEYS.transmissions).length, 0)
  })

  it('does not create a duplicate transmission for the same revision', () => {
    const moment = makeActiveMoment({ id: 'once' })
    const storage = setup([moment])
    const first = passMoment('once', storage, 'local-user')
    const second = passMoment('once', storage, 'local-user')
    assert.equal(first.id, second.id)
    assert.equal(storage.get(KEYS.transmissions).filter((item) => item.id === first.id).length, 1)
  })

  it('passes A when A and B both exist', () => {
    const a = makeActiveMoment({ id: 'moment-a', note: 'A' })
    const b = makeActiveMoment({ id: 'moment-b', note: 'B' })
    const storage = setup([a, b])
    const transmission = passMoment('moment-a', storage, 'local-user')
    assert.equal(transmission.sourceMomentId, 'moment-a')
    assert.equal(storage.get(KEYS.transmissions).some((item) => item.sourceMomentId === 'moment-b'), false)
  })
})
