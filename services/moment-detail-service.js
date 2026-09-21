/**
 * 只读 Moment 详情应用服务。页面只消费 ViewModel。
 */
const { ERROR_CODES, fail } = require('../domain/moment/moment.errors.js')
const { projectMomentDetail } = require('../projections/moment-detail-projection.js')
const { createRuntime, getRuntime } = require('./runtime.js')

function decodeMomentQueryId(rawId) {
  if (rawId == null || rawId === '') return ''
  if (typeof rawId !== 'string') return ''
  try {
    return decodeURIComponent(rawId)
  } catch (error) {
    return ''
  }
}

function buildMomentDetailUrl(momentId) {
  if (!momentId || typeof momentId !== 'string') {
    fail(ERROR_CODES.MOMENT_INVALID_ID, 'momentId is required')
  }
  return `/pages/moment-detail/moment-detail?id=${encodeURIComponent(momentId)}`
}

function getMomentDetail(momentId, storage, options) {
  if (!momentId || typeof momentId !== 'string') {
    fail(ERROR_CODES.MOMENT_INVALID_ID, 'momentId is required')
  }
  const runtime = storage ? createRuntime(storage) : getRuntime()
  if (runtime.moments.collectionKind() === 'corrupt') {
    fail(ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY, 'moment collection is not an array')
  }
  const moment = runtime.moments.getById(momentId)
  if (!moment) {
    fail(ERROR_CODES.MOMENT_NOT_FOUND, 'moment not found')
  }
  const assets = (moment.assetIds || []).map((id) => runtime.assets.getById(id))
  return projectMomentDetail(moment, assets, {
    timezoneOffsetMinutes: options && options.timezoneOffsetMinutes,
  })
}

module.exports = {
  getMomentDetail,
  buildMomentDetailUrl,
  decodeMomentQueryId,
}
