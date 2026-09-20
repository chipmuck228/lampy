const { hash01 } = require('../domain/shared/hash')
const { visualDecay, momentOccurredMillis } = require('./visual-decay')

function projectMomentsToVault(moments, view, now) {
  const active = (moments || []).filter((item) => item && item.lifecycle && item.lifecycle.status === 'active')
  const withDays = active
    .map((moment) => {
      const visual = visualDecay(moment, now)
      return {
        moment,
        daysAgo: Math.floor(visual.daysAgo),
        visual,
        createdAt: momentOccurredMillis(moment),
      }
    })
    .sort((a, b) => a.daysAgo - b.daysAgo)

  let rows = withDays
  let caption = ''

  if (view === 'day') {
    rows = withDays.filter((item) => item.daysAgo === 0)
    caption = `今天，你点亮了 ${rows.length} 个瞬间`
  } else if (view === 'month') {
    rows = withDays.filter((item) => item.daysAgo <= 30)
    caption = `这个月，你点亮了 ${rows.length} 个瞬间`
  } else {
    caption = `这一年，你点亮了 ${withDays.length} 个瞬间`
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
  }
}

module.exports = {
  projectMomentsToVault,
}
