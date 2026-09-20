const { hashCode } = require('../domain/shared/hash')
const { parseMillis } = require('../domain/shared/time')

const DAY = 24 * 60 * 60 * 1000
const WARM = [255, 217, 125]
const COOL = [138, 147, 178]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function mixColor(t) {
  const p = clamp(t, 0, 1)
  const r = Math.round(WARM[0] + (COOL[0] - WARM[0]) * p)
  const g = Math.round(WARM[1] + (COOL[1] - WARM[1]) * p)
  const b = Math.round(WARM[2] + (COOL[2] - WARM[2]) * p)
  return `rgb(${r},${g},${b})`
}

function sizeFor(daysAgo, hash) {
  let min = 16
  let max = 24
  if (daysAgo <= 7) {
    min = 48
    max = 56
  } else if (daysAgo <= 30) {
    min = 40
    max = 48
  } else if (daysAgo <= 90) {
    min = 32
    max = 40
  } else if (daysAgo <= 180) {
    min = 24
    max = 32
  }
  return min + (hash % (max - min + 1))
}

function momentOccurredMillis(moment) {
  return parseMillis(moment.time && (moment.time.occurredAt || moment.time.recordedAt)) || 0
}

function visualDecay(moment, now) {
  const createdAt = momentOccurredMillis(moment)
  const daysAgo = clamp((now - createdAt) / DAY, 0, 365)
  const t = daysAgo / 365
  const hash = hashCode(moment.id)
  return {
    daysAgo,
    size: sizeFor(daysAgo, hash),
    opacity: +(Math.max(0.4, 1 - t * 0.6)).toFixed(2),
    blur: +(Math.min(2.5, t * 2.5)).toFixed(2),
    shadowBlur: Math.round(Math.max(4, 24 - t * 20)),
    color: mixColor(t),
    animationDelay: hash % 2400,
  }
}

module.exports = {
  visualDecay,
  momentOccurredMillis,
  mixColor,
}
