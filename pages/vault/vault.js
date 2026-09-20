/**
 * 光罐：所有光点汇成星空，按日 / 月 / 年重排。
 */
const { getLights } = require('../../utils/storage')

const DAY = 24 * 60 * 60 * 1000

function hash01(text, salt) {
  let h = 0
  const raw = `${text || ''}:${salt || ''}`
  for (let i = 0; i < raw.length; i += 1) {
    h = ((h << 5) - h) + raw.charCodeAt(i)
    h |= 0
  }
  return (Math.abs(h) % 10000) / 10000
}

Page({
  data: {
    lights: [],
    arrangedLights: [],
    currentView: 'month',
    caption: '',
    entering: true,
    headerPad: 88,
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const lights = getLights()
    this.setData({
      lights,
      entering: true,
      headerPad: (windowInfo.statusBarHeight || 44) + 12,
    }, () => {
      this.arrangeLights()
      setTimeout(() => {
        this.setData({ entering: false })
      }, 600)
    })
  },

  arrangeLights() {
    const { lights, currentView } = this.data
    const now = Date.now()
    const withDays = lights
      .map((light) => ({
        ...light,
        daysAgo: Math.max(0, Math.floor((now - light.createdAt) / DAY)),
      }))
      .sort((a, b) => a.daysAgo - b.daysAgo)

    let arranged = []
    let caption = ''

    if (currentView === 'day') {
      const today = withDays.filter((item) => item.daysAgo === 0)
      arranged = today.map((light) => ({
        ...this.computeVisual(light),
        x: 0.15 + hash01(light.id, 'day-x') * 0.7,
        y: 0.15 + hash01(light.id, 'day-y') * 0.7,
      }))
      caption = `今天，你点亮了 ${today.length} 个瞬间`
    } else if (currentView === 'month') {
      const month = withDays.filter((item) => item.daysAgo <= 30)
      arranged = month.map((light, index) => ({
        ...this.computeVisual(light),
        x: 0.15 + hash01(light.id, 'month-x') * 0.7,
        y: 0.9 - (index / Math.max(month.length - 1, 1)) * 0.8,
      }))
      caption = `这个月，你点亮了 ${month.length} 个瞬间`
    } else {
      arranged = withDays.map((light, index) => ({
        ...this.computeVisual(light),
        x: 0.1 + hash01(light.id, 'year-x') * 0.8,
        y: 0.95 - (index / Math.max(withDays.length - 1, 1)) * 0.9,
      }))
      caption = `这一年，你点亮了 ${withDays.length} 个瞬间`
    }

    this.setData({ arrangedLights: arranged, caption })
  },

  computeVisual(light) {
    const daysAgo = light.daysAgo
    const ratio = Math.min(1, daysAgo / 365)
    return {
      ...light,
      size: Math.max(16, 56 - ratio * 40),
      opacity: Math.max(0.4, 1 - ratio * 0.6),
      blur: Math.min(2.5, ratio * 2.5),
      shadowBlur: Math.max(4, 24 - ratio * 20),
      color: this.interpolateColor('#FFD97D', '#8A93B2', ratio),
      animationDelay: Math.round(hash01(light.id, 'delay') * 6000),
    }
  },

  interpolateColor(c1, c2, ratio) {
    const hex = (color) => parseInt(color.slice(1), 16)
    const r1 = (hex(c1) >> 16) & 255
    const g1 = (hex(c1) >> 8) & 255
    const b1 = hex(c1) & 255
    const r2 = (hex(c2) >> 16) & 255
    const g2 = (hex(c2) >> 8) & 255
    const b2 = hex(c2) & 255
    const r = Math.round(r1 + (r2 - r1) * ratio)
    const g = Math.round(g1 + (g2 - g1) * ratio)
    const b = Math.round(b1 + (b2 - b1) * ratio)
    return `rgb(${r}, ${g}, ${b})`
  },

  switchView(e) {
    const view = e.currentTarget.dataset.view
    if (!view || view === this.data.currentView) return
    this.setData({ currentView: view }, () => {
      this.arrangeLights()
    })
  },

  onBack() {
    wx.navigateBack()
  },

  onLightTap(e) {
    const id = e.currentTarget.dataset.id
    const light = (this.data.lights || []).find((item) => item.id === id)
    console.log('光罐点击光点：', light)
  },
})
