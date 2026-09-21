/**
 * 详情日期展示。timezoneOffsetMinutes 东经为正：UTC+8 = 480，UTC-5 = -300。
 * 未传入时默认 0（UTC）。
 */
const { parseMillis } = require('./time.js')
const { getCalendarParts } = require('./calendar.js')

const PRECISIONS = ['exact', 'day', 'month', 'year', 'unknown']

function pad2(value) {
  return value < 10 ? `0${value}` : String(value)
}

function clockParts(timestamp, timezoneOffsetMinutes) {
  const offset = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0
  const shifted = new Date(Number(timestamp) + offset * 60 * 1000)
  return {
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

function formatCalendarDate(timestamp, precision, timezoneOffsetMinutes) {
  if (precision === 'unknown' || PRECISIONS.indexOf(precision) === -1) {
    return '时间未确认'
  }
  const millis = parseMillis(timestamp)
  if (millis === null) return '时间未确认'
  const parts = getCalendarParts(millis, timezoneOffsetMinutes)
  if (precision === 'year') return `${parts.year}年`
  if (precision === 'month') return `${parts.year}年${parts.month}月`
  const dayLabel = `${parts.year}年${parts.month}月${parts.day}日`
  if (precision === 'day') return dayLabel
  const clock = clockParts(millis, timezoneOffsetMinutes)
  return `${dayLabel} ${pad2(clock.hour)}:${pad2(clock.minute)}`
}

function formatDurationLabel(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return ''
  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${pad2(seconds)}`
}

module.exports = {
  PRECISIONS,
  formatCalendarDate,
  formatDurationLabel,
}
