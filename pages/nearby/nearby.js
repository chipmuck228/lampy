/**
 * 附近微光：一次一盏，随机而来，看完即止。
 */
const { keys } = require('../../utils/constants')
const { receiveNearbyLight } = require('../../services/nearby-service.js')
const { generateMockNearby } = require('../../utils/mockNearby')

Page({
  data: {
    lights: [],
    currentIndex: 0,
    current: {},
    transitioning: false,
    finished: false,
    touchStartX: 0,
    touchStartY: 0,
    headerPad: 88,
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      headerPad: (windowInfo.statusBarHeight || 44) + 12,
    })

    const today = new Date().toDateString()
    const lastVisit = wx.getStorageSync(keys.nearbyVisit)
    if (lastVisit === today) {
      this.setData({ finished: true })
      return
    }

    const count = 3 + Math.floor(Math.random() * 3)
    const lights = generateMockNearby(count).map((light) => ({
      ...light,
      animationDelay: Math.round(Math.random() * 6000),
    }))

    this.setData({
      lights,
      current: lights[0],
      currentIndex: 0,
    })
  },

  onCollect() {
    if (this.data.transitioning || this.data.finished) return
    const current = this.data.current
    if (!current || !current.id) return

    receiveNearbyLight(current)
    wx.vibrateShort({ type: 'light' })
    this.goToNext()
  },

  onPass() {
    if (this.data.transitioning || this.data.finished) return

    wx.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage', 'shareTimeline'],
    })

    wx.showToast({
      title: '已递给下一个人',
      icon: 'none',
      duration: 1500,
    })

    setTimeout(() => {
      this.goToNext()
    }, 800)
  },

  goToNext() {
    if (this.data.transitioning) return

    this.setData({ transitioning: true })

    setTimeout(() => {
      const nextIndex = this.data.currentIndex + 1
      const lights = this.data.lights

      if (nextIndex >= lights.length) {
        wx.setStorageSync(keys.nearbyVisit, new Date().toDateString())
        this.setData({
          transitioning: false,
          finished: true,
        })
        return
      }

      this.setData({
        currentIndex: nextIndex,
        current: lights[nextIndex],
        transitioning: false,
      })
    }, 400)
  },

  onTouchStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    this.setData({
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
    })
  },

  onTouchEnd(e) {
    if (this.data.transitioning || this.data.finished) return
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) return

    const diffX = touch.clientX - this.data.touchStartX
    const diffY = touch.clientY - this.data.touchStartY
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) && diffX < 0) {
      this.goToNext()
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    return {
      title: '有人为你点亮了一盏微光',
      path: '/pages/nearby/nearby',
    }
  },
})
