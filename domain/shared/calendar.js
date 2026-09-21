/**
 * 日历辅助。timezoneOffsetMinutes 是东经为正：
 * UTC+8 = 480，UTC-5 = -300。
 * 不要直接使用 Date#getTimezoneOffset() 的反向符号。
 */

function getCalendarParts(timestamp, timezoneOffsetMinutes) {
  const offset = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0
  const shifted = new Date(Number(timestamp) + offset * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function getCalendarKey(timestamp, timezoneOffsetMinutes) {
  const parts = getCalendarParts(timestamp, timezoneOffsetMinutes)
  const month = parts.month < 10 ? `0${parts.month}` : String(parts.month)
  const day = parts.day < 10 ? `0${parts.day}` : String(parts.day)
  return `${parts.year}-${month}-${day}`
}

function isSameCalendarDay(a, b, timezoneOffsetMinutes) {
  return getCalendarKey(a, timezoneOffsetMinutes) === getCalendarKey(b, timezoneOffsetMinutes)
}

function isSameCalendarMonth(a, b, timezoneOffsetMinutes) {
  const left = getCalendarParts(a, timezoneOffsetMinutes)
  const right = getCalendarParts(b, timezoneOffsetMinutes)
  return left.year === right.year && left.month === right.month
}

function isSameCalendarYear(a, b, timezoneOffsetMinutes) {
  return getCalendarParts(a, timezoneOffsetMinutes).year === getCalendarParts(b, timezoneOffsetMinutes).year
}

function deviceTimezoneOffsetMinutes(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now())
  return -date.getTimezoneOffset()
}

module.exports = {
  getCalendarParts,
  getCalendarKey,
  isSameCalendarDay,
  isSameCalendarMonth,
  isSameCalendarYear,
  deviceTimezoneOffsetMinutes,
}
