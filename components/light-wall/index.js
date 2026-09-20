/**
 * 光墙：按时间衰减绘制萤火；空态只留一颗种子光。
 */
const { colors, motion } = require('../../utils/constants')

const DAY = 24 * 60 * 60 * 1000
const WARM = [255, 217, 125]
const COOL = [138, 147, 178]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hashCode(text) {
  let h = 0
  const raw = String(text || '')
  for (let i = 0; i < raw.length; i += 1) {
    h = ((h << 5) - h) + raw.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
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

function visualOf(light, now) {
  const daysAgo = clamp((now - light.createdAt) / DAY, 0, 365)
  const t = daysAgo / 365
  const hash = hashCode(light.id)
  const duration = motion.breatheMin + (hash % (motion.breatheMax - motion.breatheMin))
  return {
    ...light,
    size: sizeFor(daysAgo, hash),
    opacity: +(Math.max(0.4, 1 - t * 0.6)).toFixed(2),
    blur: +(Math.min(2.5, t * 2.5)).toFixed(2),
    shadowBlur: Math.round(Math.max(4, 24 - t * 20)),
    color: mixColor(t),
    duration,
    animationDelay: hash % 2400,
    left: `${(light.position.x * 100).toFixed(2)}%`,
    top: `${(light.position.y * 100).toFixed(2)}%`,
  }
}

Component({
  properties: {
    lights: {
      type: Array,
      value: [],
    },
    lift: {
      type: Number,
      value: 0,
    },
    awaken: {
      type: Boolean,
      value: false,
    },
    instant: {
      type: Boolean,
      value: false,
    },
    gathering: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    dots: [],
    empty: true,
    seedColor: colors.glow,
  },
  observers: {
    lights(list) {
      this.syncDots(list)
    },
  },
  lifetimes: {
    attached() {
      this.syncDots(this.properties.lights)
    },
  },
  methods: {
    syncDots(list) {
      const lights = Array.isArray(list) ? list : []
      if (!lights.length) {
        this.setData({ dots: [], empty: true })
        return
      }
      const now = Date.now()
      this.setData({
        empty: false,
        dots: lights.map((item) => visualOf(item, now)),
      })
    },
    onLightTap(e) {
      const id = e.currentTarget.dataset.id
      const lights = this.properties.lights || []
      const light = lights.find((item) => item.id === id)
      console.log('点击光点：', light)

      const index = (this.data.dots || []).findIndex((item) => item.id === id)
      if (index >= 0) {
        this.setData({ [`dots[${index}].tapped`]: true })
        if (this._tapTimer) clearTimeout(this._tapTimer)
        this._tapTimer = setTimeout(() => {
          this.setData({ [`dots[${index}].tapped`]: false })
        }, 300)
      }

      this.triggerEvent('select', { light })
    },
    onSeed() {
      this.triggerEvent('select', { light: null, seed: true })
    },
  },
})
