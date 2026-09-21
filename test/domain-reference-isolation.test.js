const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createDraftMoment, updateMomentContent } = require('../domain/moment/index.js')
const { createAsset } = require('../domain/asset/index.js')
const { createTransmission } = require('../domain/transmission/index.js')

const NOW = new Date('2026-09-20T02:00:00.000Z')
const OWNER = 'local-user'

describe('domain reference isolation', () => {
  it('does not share context arrays or place with the input', () => {
    const people = [{ id: 'p1', displayName: '阿明' }]
    const tags = ['桂花']
    const place = { id: 'place-1', displayName: '楼下' }
    const moment = createDraftMoment({
      ownerId: OWNER,
      context: { people, tags, place },
    }, { now: () => NOW, id: () => 'iso-1' })
    people[0].displayName = '被改掉'
    tags.push('侵入')
    place.displayName = '别处'
    assert.equal(moment.context.people[0].displayName, '阿明')
    assert.deepEqual(moment.context.tags, ['桂花'])
    assert.equal(moment.context.place.displayName, '楼下')
  })

  it('does not keep a live reference to an update patch', () => {
    const moment = createDraftMoment({
      ownerId: OWNER,
      content: { note: '原' },
      context: { people: [{ id: 'p1', displayName: '阿明' }], tags: [] },
    }, { now: () => NOW, id: () => 'iso-2' })
    const people = [{ id: 'p2', displayName: '新的人' }]
    const place = { id: 'place-2', displayName: '公园' }
    const updated = updateMomentContent(moment, {
      content: { note: '新' },
      context: { people, tags: ['a'], place },
    }, OWNER, NOW)
    people[0].displayName = '又改'
    place.displayName = '又改'
    assert.equal(updated.content.note, '新')
    assert.equal(updated.context.people[0].displayName, '新的人')
    assert.equal(updated.context.place.displayName, '公园')
    assert.equal(moment.content.note, '原')
  })

  it('returns a new moment and leaves the original untouched', () => {
    const moment = createDraftMoment({
      ownerId: OWNER,
      content: { note: '原' },
    }, { now: () => NOW, id: () => 'iso-3' })
    const updated = updateMomentContent(moment, { content: { note: '新' } }, OWNER, NOW)
    moment.content.note = '被污染'
    assert.equal(updated.content.note, '新')
    assert.equal(updated.revision, 2)
  })

  it('isolates asset metadata, storage, and integrity inputs', () => {
    const metadata = { width: 10, height: 10 }
    const storage = { status: 'local', originalKey: 'k' }
    const integrity = { checksum: 'abc' }
    const asset = createAsset({
      id: 'asset-iso',
      ownerId: OWNER,
      type: 'image',
      metadata,
      storage,
      integrity,
    }, { now: () => NOW })
    metadata.width = 99
    storage.status = 'failed'
    integrity.checksum = 'zzz'
    assert.equal(asset.metadata.width, 10)
    assert.equal(asset.storage.status, 'local')
    assert.equal(asset.integrity.checksum, 'abc')
  })

  it('does not reuse the transmission input object', () => {
    const input = {
      id: 'tx-iso',
      sourceMomentId: 'm1',
      sourceRevision: 1,
      senderId: OWNER,
      status: 'created',
      message: 'hello',
    }
    const transmission = createTransmission(input, { now: () => NOW })
    input.message = 'changed'
    input.sourceMomentId = 'other'
    assert.equal(transmission.message, 'hello')
    assert.equal(transmission.sourceMomentId, 'm1')
    assert.notEqual(transmission, input)
  })
})
