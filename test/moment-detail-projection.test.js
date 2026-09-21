const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { projectMomentDetail } = require('../projections/moment-detail-projection.js')
const { makeActiveMoment, makeAsset } = require('./helpers.js')

function snapshot(value) {
  return JSON.parse(JSON.stringify(value))
}

describe('moment detail projection', () => {
  it('projects a text-only moment', () => {
    const moment = makeActiveMoment({
      id: 'text-only',
      note: '窗边的光刚好落在杯子上',
      emotion: '平静',
      significance: '想再看一眼',
    })
    const view = projectMomentDetail(moment, [], { timezoneOffsetMinutes: 0 })
    assert.equal(view.id, 'text-only')
    assert.equal(view.content.note, '窗边的光刚好落在杯子上')
    assert.equal(view.content.significance, '想再看一眼')
    assert.equal(view.content.emotion, '平静')
    assert.equal(view.state.hasText, true)
    assert.equal(view.state.hasImages, false)
    assert.equal(view.state.hasAudio, false)
    assert.deepEqual(view.assets, [])
    assert.equal(view.source.label, '你点亮的瞬间')
  })

  it('projects an image-only moment', () => {
    const image = makeAsset({ id: 'photo-1', type: 'image' })
    const moment = makeActiveMoment({ id: 'image-only', note: '', assetIds: ['photo-1'] })
    const view = projectMomentDetail(moment, [image], { timezoneOffsetMinutes: 0 })
    assert.equal(view.state.hasText, false)
    assert.equal(view.state.hasImages, true)
    assert.equal(view.assets.length, 1)
    assert.equal(view.assets[0].id, 'photo-1')
    assert.equal(view.assets[0].type, 'image')
    assert.equal(view.assets[0].status, 'available')
    assert.equal(view.assets[0].localUri, 'wxfile://tmp/a.jpg')
  })

  it('projects an audio-only moment', () => {
    const audio = makeAsset({
      id: 'voice-1',
      type: 'audio',
      localUri: 'wxfile://tmp/a.mp3',
      metadata: { durationMs: 12500 },
    })
    const moment = makeActiveMoment({ id: 'audio-only', note: '', assetIds: ['voice-1'] })
    const view = projectMomentDetail(moment, [audio], { timezoneOffsetMinutes: 0 })
    assert.equal(view.state.hasAudio, true)
    assert.equal(view.assets[0].type, 'audio')
    assert.equal(view.assets[0].status, 'available')
    assert.equal(view.assets[0].display.durationLabel, '13秒')
  })

  it('projects text plus image plus audio', () => {
    const image = makeAsset({ id: 'photo-1', type: 'image' })
    const audio = makeAsset({ id: 'voice-1', type: 'audio', localUri: 'wxfile://tmp/a.mp3' })
    const moment = makeActiveMoment({
      id: 'mixed',
      note: '三种都在',
      assetIds: ['photo-1', 'voice-1'],
    })
    const view = projectMomentDetail(moment, [image, audio], { timezoneOffsetMinutes: 0 })
    assert.equal(view.state.hasText, true)
    assert.equal(view.state.hasImages, true)
    assert.equal(view.state.hasAudio, true)
    assert.deepEqual(view.assets.map((item) => item.id), ['photo-1', 'voice-1'])
  })

  it('keeps multiple images in assetId order', () => {
    const first = makeAsset({ id: 'photo-a', type: 'image', localUri: 'wxfile://a.jpg' })
    const second = makeAsset({ id: 'photo-b', type: 'image', localUri: 'wxfile://b.jpg' })
    const moment = makeActiveMoment({ id: 'album', note: '两张', assetIds: ['photo-b', 'photo-a'] })
    const view = projectMomentDetail(moment, [first, second], { timezoneOffsetMinutes: 0 })
    assert.deepEqual(view.assets.map((item) => item.id), ['photo-b', 'photo-a'])
    assert.equal(view.assets[0].localUri, 'wxfile://b.jpg')
  })

  it('keeps multiple audio clips', () => {
    const first = makeAsset({ id: 'voice-a', type: 'audio', localUri: 'wxfile://a.mp3' })
    const second = makeAsset({ id: 'voice-b', type: 'audio', localUri: 'wxfile://b.mp3' })
    const moment = makeActiveMoment({ id: 'voices', note: '', assetIds: ['voice-a', 'voice-b'] })
    const view = projectMomentDetail(moment, [first, second], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets.length, 2)
    assert.equal(view.assets[1].id, 'voice-b')
    assert.equal(view.state.hasAudio, true)
  })

  it('marks a missing asset without dropping the id', () => {
    const image = makeAsset({ id: 'photo-1', type: 'image' })
    const moment = makeActiveMoment({ id: 'gap', note: '还有一张', assetIds: ['photo-1', 'gone'] })
    const view = projectMomentDetail(moment, [image], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].status, 'available')
    assert.equal(view.assets[1].id, 'gone')
    assert.equal(view.assets[1].status, 'missing')
    assert.equal(view.assets[1].type, 'unknown')
    assert.equal(view.assets[1].display.unavailableLabel, '这份内容暂时无法打开')
    assert.equal(view.state.hasUnavailableAssets, true)
    assert.equal(view.content.note, '还有一张')
  })

  it('does not treat a lost image id as available and keeps the image copy', () => {
    const moment = makeActiveMoment({ id: 'lost-image', note: '照片丢了', assetIds: ['asset:m:image'] })
    const view = projectMomentDetail(moment, [null], { timezoneOffsetMinutes: 0 })
    assert.deepEqual(view.assets[0], {
      id: 'asset:m:image',
      type: 'image',
      status: 'missing',
      display: { unavailableLabel: '这张照片暂时无法显示' },
    })
  })

  it('does not treat a lost audio id as a photo', () => {
    const moment = makeActiveMoment({ id: 'lost-audio', note: '声音丢了', assetIds: ['asset:m:audio'] })
    const view = projectMomentDetail(moment, [null], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].id, 'asset:m:audio')
    assert.equal(view.assets[0].type, 'audio')
    assert.equal(view.assets[0].status, 'missing')
    assert.equal(view.assets[0].display.unavailableLabel, '声音暂时无法播放')
    assert.notEqual(view.assets[0].type, 'image')
    assert.notEqual(view.assets[0].display.unavailableLabel, '这张照片暂时无法显示')
  })

  it('does not treat a lost video id as a photo', () => {
    const moment = makeActiveMoment({ id: 'lost-video', note: '影像丢了', assetIds: ['asset:m:video'] })
    const view = projectMomentDetail(moment, [null], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].id, 'asset:m:video')
    assert.equal(view.assets[0].type, 'video')
    assert.equal(view.assets[0].status, 'missing')
    assert.equal(view.assets[0].display.unavailableLabel, '暂不支持播放')
  })

  it('uses a neutral copy when a missing asset type cannot be recovered', () => {
    const moment = makeActiveMoment({ id: 'lost-unknown', note: '无法识别', assetIds: ['legacy-blob'] })
    const view = projectMomentDetail(moment, [], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].id, 'legacy-blob')
    assert.equal(view.assets[0].type, 'unknown')
    assert.equal(view.assets[0].status, 'missing')
    assert.equal(view.assets[0].display.unavailableLabel, '这份内容暂时无法打开')
  })

  it('marks a failed asset as failed', () => {
    const failed = makeAsset({
      id: 'broken-photo',
      type: 'image',
      localUri: 'wxfile://gone.jpg',
      storage: { status: 'failed' },
    })
    const moment = makeActiveMoment({ id: 'fail', note: '失败', assetIds: ['broken-photo'] })
    const view = projectMomentDetail(moment, [failed], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].status, 'failed')
    assert.equal(view.assets[0].localUri, undefined)
    assert.equal(view.state.hasImages, false)
  })

  it('does not mark an empty localUri as available', () => {
    const empty = makeAsset({ id: 'empty-uri', type: 'image', localUri: '' })
    const moment = makeActiveMoment({ id: 'empty', note: '空路径', assetIds: ['empty-uri'] })
    const view = projectMomentDetail(moment, [empty], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].status, 'missing')
    assert.equal(Object.prototype.hasOwnProperty.call(view.assets[0], 'localUri'), false)
  })

  it('formats exact, day, month, year, and unknown dates', () => {
    const occurredAt = '2026-09-21T10:32:00.000Z'
    const exact = projectMomentDetail(
      makeActiveMoment({ id: 'd-exact', occurredAt, occurredAtPrecision: 'exact' }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    const day = projectMomentDetail(
      makeActiveMoment({ id: 'd-day', occurredAt, occurredAtPrecision: 'day' }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    const month = projectMomentDetail(
      makeActiveMoment({ id: 'd-month', occurredAt, occurredAtPrecision: 'month' }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    const year = projectMomentDetail(
      makeActiveMoment({ id: 'd-year', occurredAt, occurredAtPrecision: 'year' }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    const unknown = projectMomentDetail(
      makeActiveMoment({
        id: 'd-unknown',
        occurredAt: null,
        occurredAtPrecision: 'unknown',
        recordedAt: occurredAt,
      }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    assert.equal(exact.displayDate.primary, '2026年9月21日 10:32')
    assert.equal(exact.displayDate.precision, 'exact')
    assert.equal(day.displayDate.primary, '2026年9月21日')
    assert.equal(month.displayDate.primary, '2026年9月')
    assert.equal(year.displayDate.primary, '2026年')
    assert.equal(unknown.displayDate.primary, '记录于 2026年9月21日')
    assert.equal(unknown.displayDate.usedRecordedAtFallback, true)
    assert.equal(unknown.displayDate.precision, 'unknown')
  })

  it('applies UTC+8 and UTC-5 date boundaries', () => {
    const plus8 = projectMomentDetail(
      makeActiveMoment({
        id: 'east',
        occurredAt: '2026-09-21T16:10:00.000Z',
        occurredAtPrecision: 'exact',
      }),
      [],
      { timezoneOffsetMinutes: 480 }
    )
    const minus5 = projectMomentDetail(
      makeActiveMoment({
        id: 'west',
        occurredAt: '2026-09-21T04:10:00.000Z',
        occurredAtPrecision: 'exact',
      }),
      [],
      { timezoneOffsetMinutes: -300 }
    )
    assert.equal(plus8.displayDate.primary, '2026年9月22日 00:10')
    assert.equal(minus5.displayDate.primary, '2026年9月20日 23:10')
  })

  it('uses created, imported, and received source labels', () => {
    const created = projectMomentDetail(makeActiveMoment({ id: 'src-created' }), [], { timezoneOffsetMinutes: 0 })
    const imported = projectMomentDetail(
      makeActiveMoment({
        id: 'src-imported',
        origin: { type: 'imported', importSource: 'album' },
      }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    const received = projectMomentDetail(
      makeActiveMoment({
        id: 'src-received',
        origin: {
          type: 'received',
          transmissionId: 'tx:legacy:received:src-received',
          originalMomentId: 'src-received',
          snapshotRevision: 1,
          legacy: true,
        },
      }),
      [],
      { timezoneOffsetMinutes: 0 }
    )
    assert.equal(created.source.type, 'created')
    assert.equal(created.source.label, '你点亮的瞬间')
    assert.equal(imported.source.label, '后来拾起的时光')
    assert.equal(received.source.label, '收下的一盏微光')
    assert.equal(received.source.isLegacy, true)
    assert.equal(JSON.stringify(received).indexOf('tx:legacy:received:src-received'), -1)
  })

  it('does not mutate inputs and is deterministic', () => {
    const image = makeAsset({ id: 'photo-1' })
    const moment = makeActiveMoment({ id: 'stable', note: '不变', assetIds: ['photo-1'] })
    const beforeMoment = snapshot(moment)
    const beforeAssets = snapshot([image])
    const first = projectMomentDetail(moment, [image], { timezoneOffsetMinutes: 480 })
    const second = projectMomentDetail(moment, [image], { timezoneOffsetMinutes: 480 })
    assert.deepEqual(snapshot(moment), beforeMoment)
    assert.deepEqual(snapshot([image]), beforeAssets)
    assert.deepEqual(first, second)
    assert.equal(Object.prototype.hasOwnProperty.call(first, 'ownerId'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(first, 'revision'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(first, 'schemaVersion'), false)
  })

  it('recognizes video without exposing it as playable', () => {
    const video = makeAsset({ id: 'clip-1', type: 'video', localUri: 'wxfile://clip.mp4' })
    const moment = makeActiveMoment({ id: 'video', note: '视频', assetIds: ['clip-1'] })
    const view = projectMomentDetail(moment, [video], { timezoneOffsetMinutes: 0 })
    assert.equal(view.assets[0].type, 'video')
    assert.equal(view.assets[0].status, 'unsupported')
  })
})
