/**
 * Moment + Assets → 只读详情 ViewModel。
 * 纯函数：不读 wx、不读 Repository、不修改输入。
 */
const { formatCalendarDate, formatDurationLabel } = require('../domain/shared/date-format.js')

const SOURCE_LABELS = {
  created: '你点亮的瞬间',
  imported: '后来拾起的时光',
  received: '收下的一盏微光',
}

function resolveAssetStatus(asset) {
  if (!asset) return 'missing'
  const storageStatus = asset.storage && asset.storage.status
  if (storageStatus === 'missing') return 'missing'
  if (storageStatus === 'failed') return 'failed'
  if (!asset.localUri) return 'missing'
  if (asset.type === 'video') return 'unsupported'
  return 'available'
}

function projectAsset(assetId, asset) {
  const type = asset && asset.type ? asset.type : 'image'
  const status = resolveAssetStatus(asset)
  const metadata = (asset && asset.metadata) || {}
  const display = {}
  if (asset && asset.userCaption) display.caption = asset.userCaption
  const durationLabel = formatDurationLabel(metadata.durationMs)
  if (durationLabel) display.durationLabel = durationLabel
  if (Number.isFinite(metadata.width)) display.width = metadata.width
  if (Number.isFinite(metadata.height)) display.height = metadata.height

  const view = {
    id: assetId,
    type,
    status,
    display,
  }
  if (status === 'available' && asset.localUri) {
    view.localUri = asset.localUri
  }
  return view
}

function projectOrigin(origin) {
  const type = origin && SOURCE_LABELS[origin.type] ? origin.type : 'created'
  return {
    type,
    label: SOURCE_LABELS[type],
    isLegacy: !!(origin && origin.legacy),
  }
}

function projectDisplayDate(moment, timezoneOffsetMinutes) {
  const time = (moment && moment.time) || {}
  const precision = time.occurredAtPrecision || 'unknown'
  const usedRecordedAtFallback = !time.occurredAt && !!time.recordedAt
  if (!time.occurredAt && !time.recordedAt) {
    return {
      primary: '时间未确认',
      precision: precision === 'unknown' ? 'unknown' : precision,
      usedRecordedAtFallback: false,
    }
  }
  if (usedRecordedAtFallback) {
    return {
      primary: `记录于 ${formatCalendarDate(time.recordedAt, 'day', timezoneOffsetMinutes)}`,
      precision,
      usedRecordedAtFallback: true,
    }
  }
  return {
    primary: formatCalendarDate(time.occurredAt, precision, timezoneOffsetMinutes),
    precision,
    usedRecordedAtFallback: false,
  }
}

/**
 * @param {object} moment
 * @param {Array<object|null|undefined>} assets
 * @param {{ timezoneOffsetMinutes?: number }} [options]
 */
function projectMomentDetail(moment, assets, options) {
  const timezoneOffsetMinutes = options && Number.isFinite(options.timezoneOffsetMinutes)
    ? options.timezoneOffsetMinutes
    : 0

  const byId = {}
  ;(Array.isArray(assets) ? assets : []).forEach((asset) => {
    if (asset && asset.id) byId[asset.id] = asset
  })

  const projectedAssets = (moment.assetIds || []).map((id) => projectAsset(id, byId[id] || null))
  const note = (moment.content && moment.content.note) || ''
  const significance = (moment.content && moment.content.significance) || ''
  const emotion = (moment.content && moment.content.emotion) || ''

  return {
    id: moment.id,
    displayDate: projectDisplayDate(moment, timezoneOffsetMinutes),
    content: {
      note,
      significance,
      emotion,
    },
    source: projectOrigin(moment.origin),
    assets: projectedAssets,
    state: {
      isActive: !!(moment.lifecycle && moment.lifecycle.status === 'active'),
      hasText: !!note.trim(),
      hasImages: projectedAssets.some((item) => item.type === 'image' && item.status === 'available'),
      hasAudio: projectedAssets.some((item) => item.type === 'audio' && item.status === 'available'),
      hasUnavailableAssets: projectedAssets.some((item) => item.status !== 'available'),
    },
    timezoneOffsetMinutes,
  }
}

module.exports = {
  SOURCE_LABELS,
  projectMomentDetail,
  projectAsset,
}
