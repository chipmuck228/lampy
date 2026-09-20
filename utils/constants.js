/**
 * Lampy 全局常量：色彩、动效、存储 key。
 */
const colors = {
  bg: '#0B1026',
  bgSoft: '#141A33',
  glow: '#FFD97D',
  glowGreen: '#A8E6A3',
  text: '#F5F1E8',
  textMuted: '#8A93B2',
  accent: '#FFB86B',
}

const motion = {
  splashMs: 1200,
  splashFadeMs: 700,
  pressMs: 280,
  liftMs: 420,
  breatheMin: 4000,
  breatheMax: 6000,
}

const keys = {
  lights: 'lampy_lights',
  incoming: 'lampy_incoming',
  splashShown: 'lampy_splash_shown',
  nearbyVisit: 'lampy_nearby_last_visit',
  draft: 'lampy_draft',
}

const wall = {
  minSize: 16,
  maxSize: 56,
  minOpacity: 0.4,
  maxOpacity: 0.95,
  edgePad: 0.1,
}

module.exports = {
  colors,
  motion,
  keys,
  wall,
}
