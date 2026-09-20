const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  createDraftMoment,
  activateMoment,
  updateMomentContent,
  archiveMoment,
  restoreMoment,
  trashMoment,
  attachAsset,
  detachAsset,
  validateMoment,
  ERROR_CODES,
  DomainError,
} = require('../domain/moment')

const NOW = new Date('2026-09-20T02:00:00.000Z')
const OWNER = 'local-user'
const OTHER = 'other-user'

function draft(input) {
  return createDraftMoment(input, {
    now: () => NOW,
    id: () => 'moment_test',
    ownerId: OWNER,
  })
}

describe('moment commands', () => {
  it('creates an empty draft', () => {
    const moment = draft({ ownerId: OWNER })
    assert.equal(moment.lifecycle.status, 'draft')
    assert.equal(moment.revision, 1)
    assert.equal(moment.time.occurredAtPrecision, 'unknown')
    assert.equal(validateMoment(moment).ok, true)
  })

  it('activates a text-only moment', () => {
    let moment = draft({
      ownerId: OWNER,
      content: { note: '今天阳光很好' },
      time: { occurredAt: NOW.toISOString(), occurredAtPrecision: 'exact' },
    })
    moment = activateMoment(moment, OWNER, NOW)
    assert.equal(moment.lifecycle.status, 'active')
    assert.equal(moment.revision, 2)
    assert.equal(moment.content.note, '今天阳光很好')
  })

  it('rejects activating an empty moment', () => {
    const moment = draft({ ownerId: OWNER })
    assert.throws(() => activateMoment(moment, OWNER, NOW), (error) => {
      assert.equal(error instanceof DomainError, true)
      assert.equal(error.code, ERROR_CODES.MOMENT_EMPTY)
      return true
    })
  })

  it('activates after attaching an image asset', () => {
    let moment = draft({ ownerId: OWNER })
    moment = attachAsset(moment, 'asset:1:image', OWNER, NOW)
    moment = activateMoment(moment, OWNER, NOW)
    assert.equal(moment.lifecycle.status, 'active')
    assert.deepEqual(moment.assetIds, ['asset:1:image'])
  })

  it('activates after attaching an audio asset', () => {
    let moment = draft({ ownerId: OWNER })
    moment = attachAsset(moment, 'asset:1:audio', OWNER, NOW)
    moment = activateMoment(moment, OWNER, NOW)
    assert.equal(moment.assetIds[0], 'asset:1:audio')
  })

  it('activates text plus media', () => {
    let moment = draft({ ownerId: OWNER, content: { note: '桂花开了' } })
    moment = attachAsset(moment, 'asset:1:image', OWNER, NOW)
    moment = attachAsset(moment, 'asset:1:audio', OWNER, NOW)
    moment = activateMoment(moment, OWNER, NOW)
    assert.equal(moment.assetIds.length, 2)
    assert.equal(moment.content.note, '桂花开了')
  })

  it('increments revision on each domain change', () => {
    let moment = draft({ ownerId: OWNER, content: { note: 'a' } })
    assert.equal(moment.revision, 1)
    moment = updateMomentContent(moment, { content: { note: 'b' } }, OWNER, NOW)
    assert.equal(moment.revision, 2)
    moment = activateMoment(moment, OWNER, NOW)
    assert.equal(moment.revision, 3)
  })

  it('accepts exact, day, and unknown time precision', () => {
    const exact = draft({
      ownerId: OWNER,
      time: { occurredAt: NOW.toISOString(), occurredAtPrecision: 'exact' },
    })
    assert.equal(exact.time.occurredAtPrecision, 'exact')

    const day = draft({
      ownerId: OWNER,
      time: { occurredAt: '2026-09-01T00:00:00.000Z', occurredAtPrecision: 'day' },
    })
    assert.equal(day.time.occurredAtPrecision, 'day')

    const unknown = draft({
      ownerId: OWNER,
      time: { occurredAtPrecision: 'unknown' },
    })
    assert.equal(unknown.time.occurredAt, undefined)
  })

  it('rejects precision that is not unknown without occurredAt', () => {
    assert.throws(() => draft({
      ownerId: OWNER,
      time: { occurredAtPrecision: 'month' },
    }), (error) => error.code === ERROR_CODES.MOMENT_INVALID_TIME)
  })

  it('does not copy importedAt onto occurredAt', () => {
    const moment = draft({
      ownerId: OWNER,
      origin: { type: 'imported', importSource: 'album' },
      time: {
        importedAt: NOW.toISOString(),
        occurredAtPrecision: 'unknown',
      },
    })
    assert.equal(moment.time.importedAt, NOW.toISOString())
    assert.equal(moment.time.occurredAt, undefined)
    assert.equal(moment.origin.type, 'imported')
  })

  it('requires a complete received origin', () => {
    assert.throws(() => draft({
      ownerId: OWNER,
      origin: { type: 'received' },
    }), (error) => error.code === ERROR_CODES.MOMENT_INVALID_ORIGIN)

    const moment = draft({
      ownerId: OWNER,
      origin: {
        type: 'received',
        transmissionId: 'tx:1',
        originalMomentId: 'moment_src',
        snapshotRevision: 1,
      },
    })
    const active = activateMoment(moment, OWNER, NOW)
    assert.equal(active.origin.type, 'received')
    assert.equal(active.ownerId, OWNER)
    assert.equal(active.origin.originalMomentId, 'moment_src')
  })

  it('rejects edits by non-owner', () => {
    const moment = draft({ ownerId: OWNER, content: { note: 'x' } })
    assert.throws(() => updateMomentContent(moment, { content: { note: 'y' } }, OTHER, NOW), (error) => {
      assert.equal(error.code, ERROR_CODES.MOMENT_FORBIDDEN)
      return true
    })
  })

  it('supports archive, trash, and restore', () => {
    let moment = activateMoment(draft({ ownerId: OWNER, content: { note: 'keep' } }), OWNER, NOW)
    moment = archiveMoment(moment, OWNER, NOW)
    assert.equal(moment.lifecycle.status, 'archived')
    moment = restoreMoment(moment, OWNER, NOW)
    assert.equal(moment.lifecycle.status, 'active')
    moment = trashMoment(moment, OWNER, NOW)
    assert.equal(moment.lifecycle.status, 'trashed')
    assert.throws(() => updateMomentContent(moment, { content: { note: 'no' } }, OWNER, NOW), (error) => {
      assert.equal(error.code, ERROR_CODES.MOMENT_TRASHED)
      return true
    })
    moment = restoreMoment(moment, OWNER, NOW)
    assert.equal(moment.lifecycle.status, 'active')
  })

  it('rejects illegal transitions', () => {
    const moment = draft({ ownerId: OWNER, content: { note: 'x' } })
    assert.throws(() => archiveMoment(moment, OWNER, NOW), (error) => {
      assert.equal(error.code, ERROR_CODES.MOMENT_INVALID_TRANSITION)
      return true
    })
  })

  it('does not mutate the original object', () => {
    const moment = draft({ ownerId: OWNER, content: { note: 'x' } })
    const updated = updateMomentContent(moment, { content: { note: 'y' } }, OWNER, NOW)
    assert.equal(moment.content.note, 'x')
    assert.equal(updated.content.note, 'y')
  })

  it('can detach an asset', () => {
    let moment = attachAsset(draft({ ownerId: OWNER }), 'asset:1', OWNER, NOW)
    moment = detachAsset(moment, 'asset:1', OWNER, NOW)
    assert.deepEqual(moment.assetIds, [])
  })
})
