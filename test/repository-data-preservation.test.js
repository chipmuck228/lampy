const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter.js')
const { createMomentRepository } = require('../repositories/moment-repository.js')
const { createAssetRepository } = require('../repositories/asset-repository.js')
const { createTransmissionRepository } = require('../repositories/transmission-repository.js')
const { KEYS } = require('../repositories/keys.js')
const { ERROR_CODES } = require('../domain/moment/moment.errors.js')
const { makeActiveMoment, makeAsset, makeTransmission } = require('./helpers.js')

describe('repository data preservation', () => {
  it('keeps an invalid moment in raw storage after saving a valid one', () => {
    const broken = { id: 'broken-moment', text: true }
    const storage = createMemoryStorage({ [KEYS.moments]: [broken] })
    const repo = createMomentRepository(storage)
    const valid = makeActiveMoment({ id: 'good-moment', note: '合法记录' })
    repo.save(valid)
    const raw = storage.get(KEYS.moments)
    assert.equal(raw.some((item) => item && item.id === 'broken-moment' && item.text === true), true)
    assert.equal(raw.some((item) => item && item.id === 'good-moment'), true)
    assert.equal(repo.list().some((item) => item.id === 'broken-moment'), false)
    assert.equal(repo.list().some((item) => item.id === 'good-moment'), true)
  })

  it('writes an invalid moment to quarantine exactly once', () => {
    const broken = { id: 'broken-moment', text: true }
    const storage = createMemoryStorage({ [KEYS.moments]: [broken] })
    const repo = createMomentRepository(storage)
    repo.list()
    repo.list()
    repo.save(makeActiveMoment({ id: 'another' }))
    const quarantine = storage.get(KEYS.momentsQuarantine)
    assert.equal(quarantine.length, 1)
    assert.equal(quarantine[0].entityType, 'moment')
    assert.equal(quarantine[0].raw.id, 'broken-moment')
    assert.ok(quarantine[0].fingerprint)
  })

  it('does not delete an invalid moment when removing another id', () => {
    const broken = { id: 'broken-moment' }
    const valid = makeActiveMoment({ id: 'keep-or-drop', note: '会被删' })
    const storage = createMemoryStorage({ [KEYS.moments]: [broken, valid] })
    const repo = createMomentRepository(storage)
    const result = repo.remove('keep-or-drop')
    assert.equal(result.removed, true)
    const raw = storage.get(KEYS.moments)
    assert.equal(raw.some((item) => item && item.id === 'broken-moment'), true)
    assert.equal(raw.some((item) => item && item.id === 'keep-or-drop'), false)
  })

  it('rejects replaceAll when any record is invalid and leaves storage unchanged', () => {
    const existing = makeActiveMoment({ id: 'existing' })
    const storage = createMemoryStorage({ [KEYS.moments]: [existing] })
    const repo = createMomentRepository(storage)
    assert.throws(() => repo.replaceAll([existing, { id: 'nope' }]), (error) => {
      assert.equal(error.code, ERROR_CODES.REPOSITORY_INVALID_RECORD)
      return true
    })
    assert.equal(storage.get(KEYS.moments)[0].id, 'existing')
    assert.equal(storage.get(KEYS.moments).length, 1)
  })

  it('replaces only the same id when saving a newer valid moment', () => {
    const first = makeActiveMoment({ id: 'same-id', note: '旧' })
    const neighbor = makeActiveMoment({ id: 'neighbor', note: '邻居' })
    const storage = createMemoryStorage({ [KEYS.moments]: [first, neighbor] })
    const repo = createMomentRepository(storage)
    const updated = makeActiveMoment({ id: 'same-id', note: '新' })
    repo.save(updated)
    const raw = storage.get(KEYS.moments)
    assert.equal(raw.filter((item) => item.id === 'same-id').length, 1)
    assert.equal(raw.find((item) => item.id === 'same-id').content.note, '新')
    assert.equal(raw.find((item) => item.id === 'neighbor').content.note, '邻居')
  })

  it('still lists other valid moments when one record is corrupt', () => {
    const good = makeActiveMoment({ id: 'readable' })
    const storage = createMemoryStorage({ [KEYS.moments]: [good, { id: 'x' }] })
    const repo = createMomentRepository(storage)
    const listed = repo.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].id, 'readable')
  })

  it('applies the same preservation rules to assets', () => {
    const broken = { id: 'broken-asset' }
    const storage = createMemoryStorage({ [KEYS.assets]: [broken] })
    const repo = createAssetRepository(storage)
    const valid = makeAsset({ id: 'good-asset' })
    repo.save(valid)
    assert.equal(storage.get(KEYS.assets).some((item) => item.id === 'broken-asset'), true)
    assert.equal(repo.list().some((item) => item.id === 'broken-asset'), false)
    repo.list()
    assert.equal(storage.get(KEYS.assetsQuarantine).length, 1)
    repo.remove('good-asset')
    assert.equal(storage.get(KEYS.assets).some((item) => item.id === 'broken-asset'), true)
    assert.throws(() => repo.replaceAll([valid, { id: 'bad' }]), (error) => error.code === ERROR_CODES.REPOSITORY_INVALID_RECORD)
  })

  it('does not overwrite a non-array moment collection', () => {
    const blob = { items: [{ id: 'hidden' }], note: 'not-an-array' }
    const storage = createMemoryStorage({ [KEYS.moments]: blob })
    const repo = createMomentRepository(storage)
    assert.deepEqual(repo.list(), [])
    assert.throws(
      () => repo.save(makeActiveMoment({ id: 'new-moment' })),
      (error) => error.code === ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY
    )
    assert.throws(
      () => repo.remove('hidden'),
      (error) => error.code === ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY
    )
    assert.throws(
      () => repo.replaceAll([makeActiveMoment({ id: 'replacement' })]),
      (error) => error.code === ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY
    )
    assert.deepEqual(storage.get(KEYS.moments), blob)
    repo.list()
    const quarantine = storage.get(KEYS.momentsQuarantine)
    assert.equal(quarantine.length, 1)
    assert.equal(quarantine[0].reason, ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY)
    assert.deepEqual(quarantine[0].raw, blob)
  })

  it('does not overwrite a non-array asset collection', () => {
    const blob = { type: 'object-store' }
    const storage = createMemoryStorage({ [KEYS.assets]: blob })
    const repo = createAssetRepository(storage)
    assert.throws(
      () => repo.save(makeAsset({ id: 'new-asset' })),
      (error) => error.code === ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY
    )
    assert.deepEqual(storage.get(KEYS.assets), blob)
    assert.equal(storage.get(KEYS.assetsQuarantine).length, 1)
  })

  it('does not overwrite a non-array transmission collection', () => {
    const blob = 'not-an-array'
    const storage = createMemoryStorage({ [KEYS.transmissions]: blob })
    const repo = createTransmissionRepository(storage)
    assert.throws(
      () => repo.save(makeTransmission({ id: 'new-tx' })),
      (error) => error.code === ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY
    )
    assert.equal(storage.get(KEYS.transmissions), blob)
    assert.equal(storage.get(KEYS.transmissionsQuarantine).length, 1)
  })

  it('still writes when the collection key is missing', () => {
    const storage = createMemoryStorage({})
    const repo = createMomentRepository(storage)
    const valid = makeActiveMoment({ id: 'first-write' })
    repo.save(valid)
    assert.equal(storage.get(KEYS.moments)[0].id, 'first-write')
  })

  it('applies the same preservation rules to transmissions', () => {
    const broken = { id: 'broken-tx' }
    const storage = createMemoryStorage({ [KEYS.transmissions]: [broken] })
    const repo = createTransmissionRepository(storage)
    const valid = makeTransmission({ id: 'good-tx' })
    repo.save(valid)
    assert.equal(storage.get(KEYS.transmissions).some((item) => item.id === 'broken-tx'), true)
    assert.equal(repo.list().some((item) => item.id === 'broken-tx'), false)
    assert.equal(storage.get(KEYS.transmissionsQuarantine).length, 1)
    repo.remove('good-tx')
    assert.equal(storage.get(KEYS.transmissions).some((item) => item.id === 'broken-tx'), true)
    assert.throws(() => repo.replaceAll([{ id: 'nope' }]), (error) => error.code === ERROR_CODES.REPOSITORY_INVALID_RECORD)
  })
})
