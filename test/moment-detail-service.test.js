const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter.js')
const { createMomentRepository } = require('../repositories/moment-repository.js')
const { createAssetRepository } = require('../repositories/asset-repository.js')
const { KEYS } = require('../repositories/keys.js')
const { ERROR_CODES } = require('../domain/moment/moment.errors.js')
const { getMomentDetail, buildMomentDetailUrl } = require('../services/moment-detail-service.js')
const { idleAudioState, applyAudioIntent } = require('../services/audio-player-state.js')
const { resetRuntime } = require('../services/runtime.js')
const { makeActiveMoment, makeAsset } = require('./helpers.js')

afterEach(() => {
  resetRuntime()
})

function snapshot(value) {
  return JSON.parse(JSON.stringify(value))
}

describe('moment detail service', () => {
  it('reads the exact moment id', () => {
    const first = makeActiveMoment({ id: 'moment-a', note: '甲' })
    const second = makeActiveMoment({ id: 'moment-b', note: '乙' })
    const storage = createMemoryStorage({
      [KEYS.moments]: [first, second],
    })
    const view = getMomentDetail('moment-b', storage, { timezoneOffsetMinutes: 0 })
    assert.equal(view.id, 'moment-b')
    assert.equal(view.content.note, '乙')
  })

  it('fails for a missing id and never falls back to the first moment', () => {
    const first = makeActiveMoment({ id: 'moment-a', note: '不能回退到我' })
    const storage = createMemoryStorage({ [KEYS.moments]: [first] })
    assert.throws(() => getMomentDetail('missing-id', storage), (error) => {
      assert.equal(error.code, ERROR_CODES.MOMENT_NOT_FOUND)
      return true
    })
    assert.throws(() => getMomentDetail('', storage), (error) => {
      assert.equal(error.code, ERROR_CODES.MOMENT_INVALID_ID)
      return true
    })
  })

  it('resolves every assetId and keeps a missing neighbor', () => {
    const image = makeAsset({ id: 'photo-1', type: 'image' })
    const audio = makeAsset({ id: 'voice-1', type: 'audio', localUri: 'wxfile://tmp/a.mp3' })
    const moment = makeActiveMoment({
      id: 'with-media',
      note: '两份媒体',
      assetIds: ['photo-1', 'voice-1', 'gone'],
    })
    const storage = createMemoryStorage({
      [KEYS.moments]: [moment],
      [KEYS.assets]: [image, audio],
    })
    const view = getMomentDetail('with-media', storage, { timezoneOffsetMinutes: 0 })
    assert.deepEqual(view.assets.map((item) => item.id), ['photo-1', 'voice-1', 'gone'])
    assert.equal(view.assets[0].status, 'available')
    assert.equal(view.assets[1].status, 'available')
    assert.equal(view.assets[2].status, 'missing')
    assert.equal(view.content.note, '两份媒体')
  })

  it('returns error when the moment collection is not an array and does not overwrite it', () => {
    const blob = { damaged: true }
    const storage = createMemoryStorage({ [KEYS.moments]: blob })
    assert.throws(() => getMomentDetail('any', storage), (error) => {
      assert.equal(error.code, ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY)
      return true
    })
    assert.deepEqual(storage.get(KEYS.moments), blob)
  })

  it('does not change moment revision, moment body, or assets', () => {
    const image = makeAsset({ id: 'photo-1' })
    const moment = makeActiveMoment({ id: 'frozen', note: '只读', assetIds: ['photo-1'] })
    const storage = createMemoryStorage({
      [KEYS.moments]: [moment],
      [KEYS.assets]: [image],
    })
    const beforeMoment = snapshot(storage.get(KEYS.moments)[0])
    const beforeAsset = snapshot(storage.get(KEYS.assets)[0])
    getMomentDetail('frozen', storage, { timezoneOffsetMinutes: 0 })
    const afterMoment = createMomentRepository(storage).getById('frozen')
    const afterAsset = createAssetRepository(storage).getById('photo-1')
    assert.equal(afterMoment.revision, beforeMoment.revision)
    assert.deepEqual(snapshot(afterMoment), beforeMoment)
    assert.deepEqual(snapshot(afterAsset), beforeAsset)
    assert.deepEqual(snapshot(storage.get(KEYS.moments)[0]), beforeMoment)
    assert.deepEqual(snapshot(storage.get(KEYS.assets)[0]), beforeAsset)
  })

  it('keeps received and legacy received source without claiming delivery', () => {
    const received = makeActiveMoment({
      id: 'gift',
      note: '别人递来的',
      origin: {
        type: 'received',
        transmissionId: 'tx:legacy:received:gift',
        originalMomentId: 'origin-gift',
        snapshotRevision: 1,
        legacy: true,
      },
    })
    const storage = createMemoryStorage({ [KEYS.moments]: [received] })
    const view = getMomentDetail('gift', storage, { timezoneOffsetMinutes: 0 })
    assert.equal(view.source.type, 'received')
    assert.equal(view.source.label, '收下的一盏微光')
    assert.equal(view.source.isLegacy, true)
    assert.equal(JSON.stringify(view).indexOf('tx:legacy:received:gift'), -1)
    assert.equal(JSON.stringify(view).indexOf('origin-gift'), -1)
  })
})

describe('moment detail url', () => {
  it('encodes the id so special characters stay inside the query', () => {
    const id = 'light/日&夜?x=1'
    assert.equal(
      buildMomentDetailUrl(id),
      `/pages/moment-detail/moment-detail?id=${encodeURIComponent(id)}`
    )
    assert.equal(buildMomentDetailUrl(id).indexOf('?x=1'), -1)
  })

  it('rejects an empty id', () => {
    assert.throws(() => buildMomentDetailUrl(''), (error) => error.code === ERROR_CODES.MOMENT_INVALID_ID)
    assert.throws(() => buildMomentDetailUrl(null), (error) => error.code === ERROR_CODES.MOMENT_INVALID_ID)
  })
})

describe('audio player state', () => {
  it('plays, pauses, resumes, and resets after end', () => {
    let state = idleAudioState()
    state = applyAudioIntent(state, { type: 'play', assetId: 'voice-1' })
    assert.equal(state.status, 'playing')
    assert.equal(state.playingAssetId, 'voice-1')
    assert.equal(state.isPlaying, true)
    state = applyAudioIntent(state, { type: 'pause' })
    assert.equal(state.status, 'paused')
    assert.equal(state.isPlaying, false)
    state = applyAudioIntent(state, { type: 'resume' })
    assert.equal(state.status, 'playing')
    state = applyAudioIntent(state, { type: 'ended' })
    assert.equal(state.status, 'idle')
    assert.equal(state.playingAssetId, '')
    assert.equal(state.isPlaying, false)
  })

  it('switches to another clip and can mark a clip unavailable', () => {
    let state = applyAudioIntent(idleAudioState(), { type: 'play', assetId: 'voice-1' })
    state = applyAudioIntent(state, { type: 'play', assetId: 'voice-2' })
    assert.equal(state.playingAssetId, 'voice-2')
    assert.equal(state.status, 'playing')
    state = applyAudioIntent(state, { type: 'fail', assetId: 'voice-2' })
    assert.equal(state.status, 'unavailable')
    assert.equal(state.isPlaying, false)
  })
})
