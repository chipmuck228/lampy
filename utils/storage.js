/**
 * Lampy 本地存储：光点记录、递来的光、100 条时间积累模拟数据。
 */
const { keys, wall } = require('./constants')

const EMOTIONS = ['平静', '喜悦', '感动', '温暖', '惊喜', '释然']

const MOCK_TEXTS = [
  '下班路上看到晚霞',
  '朋友突然发来一句问候',
  '喝到一杯刚好的咖啡',
  '地铁上有人让座',
  '路过一棵开花的树',
  '收到一封手写信',
  '今天阳光很好',
  '猫在窗台睡着了',
  '听到了喜欢的歌',
  '睡前看了一页书',
  '陌生人的一个微笑',
  '雨后的空气很干净',
  '和家人通了一次电话',
  '工作上的一个小突破',
  '做了一顿好吃的饭',
]

const DAY = 24 * 60 * 60 * 1000

function readJSON(key, fallback) {
  try {
    const value = wx.getStorageSync(key)
    return value === '' || value === undefined || value === null ? fallback : value
  } catch (error) {
    return fallback
  }
}

function randomPosition() {
  const pad = wall.edgePad
  return {
    x: pad + Math.random() * (1 - pad * 2),
    y: pad + Math.random() * (1 - pad * 2),
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function distance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function scatterPosition(existing) {
  for (let i = 0; i < 48; i += 1) {
    const next = {
      x: 0.08 + Math.random() * 0.84,
      y: 0.05 + Math.random() * 0.9,
    }
    const tooClose = existing.some((item) => distance(item.position, next) < 0.06)
    if (!tooClose) return next
  }
  return {
    x: 0.08 + Math.random() * 0.84,
    y: 0.05 + Math.random() * 0.9,
  }
}

function randomInRange(minDays, maxDays) {
  return minDays + Math.random() * (maxDays - minDays)
}

function generateMockLights() {
  const now = Date.now()
  const buckets = [
    { count: 15, min: 0, max: 7 },
    { count: 25, min: 7, max: 30 },
    { count: 25, min: 30, max: 90 },
    { count: 35, min: 90, max: 365 },
  ]
  const lights = []

  buckets.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i += 1) {
      const daysAgo = randomInRange(bucket.min, bucket.max)
      lights.push({
        id: `mock-${bucketIndex}-${i}`,
        text: pick(MOCK_TEXTS),
        emotion: pick(EMOTIONS),
        createdAt: Math.round(now - daysAgo * DAY),
        isPublic: Math.random() > 0.45,
        isPassed: Math.random() > 0.8,
        position: scatterPosition(lights),
      })
    }
  })

  return lights.sort((a, b) => b.createdAt - a.createdAt)
}

function normalizeLight(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  const createdAt = Number(raw.createdAt) || Date.now()
  const pos = raw.position && typeof raw.position.x === 'number'
    ? raw.position
    : randomPosition()
  return {
    id: String(raw.id),
    text: typeof raw.text === 'string' ? raw.text : '',
    emotion: typeof raw.emotion === 'string' ? raw.emotion : '',
    createdAt,
    isPublic: !!raw.isPublic,
    isPassed: !!raw.isPassed,
    source: typeof raw.source === 'string' ? raw.source : '',
    imagePath: typeof raw.imagePath === 'string' ? raw.imagePath : '',
    voicePath: typeof raw.voicePath === 'string' ? raw.voicePath : '',
    position: {
      x: Math.min(1, Math.max(0, Number(pos.x) || 0)),
      y: Math.min(1, Math.max(0, Number(pos.y) || 0)),
    },
  }
}

function getLights() {
  const raw = readJSON(keys.lights, [])
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeLight).filter(Boolean)
}

function saveLights(list) {
  wx.setStorageSync(keys.lights, list)
}

function ensureMockLights() {
  const current = getLights()
  if (current.length >= 100) return current
  const list = generateMockLights()
  saveLights(list)
  return list
}

function collectNearbyLight(current) {
  if (!current || !current.id) return null
  const light = normalizeLight({
    id: `collected_${current.id}`,
    text: current.text || '',
    emotion: current.emotion || '',
    createdAt: Number(current.createdAt) || Date.now(),
    source: 'nearby',
    isPublic: false,
    isPassed: false,
    position: {
      x: 0.1 + Math.random() * 0.8,
      y: 0.1 + Math.random() * 0.8,
    },
  })
  if (!light) return null
  const list = getLights()
  list.unshift(light)
  saveLights(list)
  return light
}

function addLight(input) {
  const list = getLights()
  const light = normalizeLight({
    id: (input && input.id) || `light_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: (input && input.text) || '',
    emotion: (input && input.emotion) || '',
    imagePath: (input && input.imagePath) || '',
    voicePath: (input && input.voicePath) || '',
    createdAt: (input && input.createdAt) || Date.now(),
    isPublic: !!(input && input.isPublic),
    isPassed: !!(input && input.isPassed),
    source: (input && input.source) || '',
    position: (input && input.position) || scatterPosition(list),
  })
  if (!light) return null
  list.unshift(light)
  saveLights(list)
  return light
}

function markNewestPassed() {
  const list = getLights()
  if (!list.length) return
  list[0].isPassed = true
  saveLights(list)
}

function getDraft() {
  const draft = readJSON(keys.draft, null)
  return draft && typeof draft === 'object' ? draft : null
}

function saveDraft(draft) {
  if (!draft || (!draft.text && !draft.imagePath && !draft.emotion && !draft.voicePath)) {
    wx.removeStorageSync(keys.draft)
    return
  }
  wx.setStorageSync(keys.draft, draft)
}

function clearDraft() {
  wx.removeStorageSync(keys.draft)
}

function hasIncomingLight() {
  return !!wx.getStorageSync(keys.incoming)
}

function setIncomingLight(visible) {
  wx.setStorageSync(keys.incoming, !!visible)
}

function hasShownSplash() {
  return !!wx.getStorageSync(keys.splashShown)
}

function markSplashShown() {
  wx.setStorageSync(keys.splashShown, true)
}

module.exports = {
  randomPosition,
  scatterPosition,
  generateMockLights,
  ensureMockLights,
  getLights,
  addLight,
  markNewestPassed,
  getDraft,
  saveDraft,
  clearDraft,
  collectNearbyLight,
  hasIncomingLight,
  setIncomingLight,
  hasShownSplash,
  markSplashShown,
}
