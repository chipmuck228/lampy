const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { validateMoment, ERROR_CODES } = require('../domain/moment/index.js')
const { validateAsset } = require('../domain/asset/index.js')
const { validateTransmission } = require('../domain/transmission/index.js')
const { makeActiveMoment, makeAsset, makeTransmission } = require('./helpers.js')

describe('validator contracts', () => {
  it('accepts a command-built active moment', () => {
    assert.equal(validateMoment(makeActiveMoment({ id: 'valid' })).ok, true)
  })

  it('rejects invalid content, context, access, and lifecycle with stable codes', () => {
    const base = makeActiveMoment({ id: 'v' })
    assert.equal(validateMoment(Object.assign({}, base, { content: 'x' })).errors[0].code, ERROR_CODES.MOMENT_INVALID_CONTENT)
    assert.equal(validateMoment(Object.assign({}, base, { context: { people: 'no', tags: [] } })).errors.some((item) => item.code === ERROR_CODES.MOMENT_INVALID_CONTEXT), true)
    assert.equal(validateMoment(Object.assign({}, base, { accessSummary: { visibility: 'nope', futureAccessEnabled: true } })).errors[0].code, ERROR_CODES.MOMENT_INVALID_ACCESS)
    const noActivated = JSON.parse(JSON.stringify(base))
    delete noActivated.lifecycle.activatedAt
    assert.equal(validateMoment(noActivated).errors.some((item) => item.code === ERROR_CODES.MOMENT_INVALID_LIFECYCLE), true)
  })

  it('rejects invalid time structures', () => {
    const base = makeActiveMoment({ id: 'time' })
    assert.equal(validateMoment(Object.assign({}, base, { time: null })).errors[0].code, ERROR_CODES.MOMENT_INVALID_TIME)
    const badPrecision = JSON.parse(JSON.stringify(base))
    badPrecision.time.occurredAtPrecision = 'week'
    assert.equal(validateMoment(badPrecision).errors[0].code, ERROR_CODES.MOMENT_INVALID_TIME)
  })

  it('rejects duplicate asset ids', () => {
    const base = JSON.parse(JSON.stringify(makeActiveMoment({ id: 'dup' })))
    base.assetIds = ['a1', 'a1']
    assert.equal(validateMoment(base).ok, false)
    assert.equal(validateMoment(base).errors[0].code, ERROR_CODES.ASSET_NOT_FOUND)
  })

  it('rejects an invalid asset with ASSET_INVALID', () => {
    const asset = makeAsset({ id: 'ok-asset' })
    assert.equal(validateAsset(asset).ok, true)
    assert.equal(validateAsset(Object.assign({}, asset, { type: 'pdf' })).errors[0].code, ERROR_CODES.ASSET_INVALID)
    assert.equal(validateAsset(Object.assign({}, asset, { metadata: { width: -1 } })).errors[0].code, ERROR_CODES.ASSET_INVALID)
  })

  it('rejects an invalid transmission with TRANSMISSION_INVALID', () => {
    const transmission = makeTransmission({ id: 'ok-tx' })
    assert.equal(validateTransmission(transmission).ok, true)
    assert.equal(validateTransmission(Object.assign({}, transmission, { status: 'flying' })).errors[0].code, ERROR_CODES.TRANSMISSION_INVALID)
    assert.equal(validateTransmission({ id: 'sent-only', sourceMomentId: 'm', sourceRevision: 1, senderId: 'u', status: 'sent', createdAt: '2026-09-20T02:00:00.000Z' }).errors[0].code, ERROR_CODES.TRANSMISSION_INVALID)
  })
})
