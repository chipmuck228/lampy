const { hash01 } = require('../domain/shared/hash')
const { visualDecay, momentOccurredMillis } = require('./visual-decay')

function projectMomentToLightWall(moment, now) {
  const visual = visualDecay(moment, now)
  const x = 0.08 + hash01(moment.id, 'wall-x') * 0.84
  const y = 0.05 + hash01(moment.id, 'wall-y') * 0.9
  return {
    id: moment.id,
    text: moment.content && moment.content.note || '',
    emotion: moment.content && moment.content.emotion || '',
    createdAt: momentOccurredMillis(moment),
    position: { x, y },
    left: `${(x * 100).toFixed(2)}%`,
    top: `${(y * 100).toFixed(2)}%`,
    size: visual.size,
    opacity: visual.opacity,
    blur: visual.blur,
    shadowBlur: visual.shadowBlur,
    color: visual.color,
    animationDelay: visual.animationDelay,
  }
}

function projectMomentsToLightWall(moments, now) {
  return (moments || [])
    .filter((item) => item && item.lifecycle && item.lifecycle.status === 'active')
    .map((item) => projectMomentToLightWall(item, now))
}

module.exports = {
  projectMomentToLightWall,
  projectMomentsToLightWall,
}
