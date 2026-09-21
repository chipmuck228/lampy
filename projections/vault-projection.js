const { hash01 } = require('../domain/shared/hash')
const { parseMillis } = require('../domain/shared/time')
const { ERROR_CODES } = require('../domain/moment/moment.errors')
const { isSameCalendarDay, isSameCalendarMonth, isSameCalendarYear } = require('../domain/shared/calendar')
const { visualDecay, momentOccurredMillis } = require('./visual-decay')

const VIEWS = ['day', 'month', 'year']

/**
 * 展示时间：优先 occurredAt；未知时回退 recordedAt，不伪造发生日。
 */
function displayMillis(moment) {
  const occurred = parseMillis(moment.time && moment.time.occurredAt)
  if (occurred !== null) return occurred
  return parseMillis(moment.time && moment.time.recordedAt)
}

/**
 * @param {object[]} moments
 * @param {'day'|'month'|'year'} view
 * @param {number} now
 * @param {{ timezoneOffsetMinutes?: number }} [options]
 * 默认 timezoneOffsetMinutes = 0（UTC），测试必须显式注入。
 */
function projectMomentsToVault(moments, view, now, options) {
  if (VIEWS.indexOf(view) === -1) {
    const error = new Error('invalid vault view')
    error.code = ERROR_CODES.VAULT_INVALID_VIEW
    throw error
  }

  const timezoneOffsetMinutes = options && Number.isFinite(options.timezoneOffsetMinutes)
    ? options.timezoneOffsetMinutes
    : 0

  const active = (moments || []).filter((item) => item && item.lifecycle && item.lifecycle.status === 'active')
  const withDays = active
    .map((moment) => {
      const visual = visualDecay(moment, now)
      const createdAt = displayMillis(moment)
      return {
        moment,
        daysAgo: Math.floor(visual.daysAgo),
        visual,
        createdAt: createdAt === null ? momentOccurredMillis(moment) : createdAt,
        usedRecordedAtFallback: !(moment.time && moment.time.occurredAt),
      }
    })
    .sort((a, b) => a.daysAgo - b.daysAgo)

  let rows = withDays
  let caption = ''

  if (view === 'day') {
    rows = withDays.filter((item) => isSameCalendarDay(item.createdAt, now, timezoneOffsetMinutes))
    caption = `今天，你点亮了 ${rows.length} 个瞬间`
  } else if (view === 'month') {
    rows = withDays.filter((item) => isSameCalendarMonth(item.createdAt, now, timezoneOffsetMinutes))
    caption = `这个月，你点亮了 ${rows.length} 个瞬间`
  } else {
    rows = withDays.filter((item) => isSameCalendarYear(item.createdAt, now, timezoneOffsetMinutes))
    caption = `这一年，你点亮了 ${rows.length} 个瞬间`
  }

  const arrangedLights = rows.map((item, index) => {
    let x
    let y
    if (view === 'day') {
      x = 0.15 + hash01(item.moment.id, 'day-x') * 0.7
      y = 0.15 + hash01(item.moment.id, 'day-y') * 0.7
    } else if (view === 'month') {
      x = 0.15 + hash01(item.moment.id, 'month-x') * 0.7
      y = 0.9 - (index / Math.max(rows.length - 1, 1)) * 0.8
    } else {
      x = 0.1 + hash01(item.moment.id, 'year-x') * 0.8
      y = 0.95 - (index / Math.max(rows.length - 1, 1)) * 0.9
    }
    return {
      id: item.moment.id,
      text: item.moment.content && item.moment.content.note || '',
      emotion: item.moment.content && item.moment.content.emotion || '',
      createdAt: item.createdAt,
      daysAgo: item.daysAgo,
      usedRecordedAtFallback: item.usedRecordedAtFallback,
      x,
      y,
      size: item.visual.size,
      opacity: item.visual.opacity,
      blur: item.visual.blur,
      shadowBlur: item.visual.shadowBlur,
      color: item.visual.color,
      animationDelay: Math.round(hash01(item.moment.id, 'delay') * 6000),
    }
  })

  return {
    arrangedLights,
    caption,
    count: active.length,
    timezoneOffsetMinutes,
  }
}

module.exports = {
  projectMomentsToVault,
  displayMillis,
}
