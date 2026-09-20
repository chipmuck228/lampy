/**
 * 首页：同一页内启动层 → 光墙浮现。冷启动只播一次。
 */
const { motion } = require('../../utils/constants')
const { formatHomeDate } = require('../../utils/date')
const { hasIncomingLight } = require('../../utils/storage')

const SPLASH_KEY = 'lampy_splash_shown'

Page({
  data: {
    dateLabel: '',
    lights: [],
    incoming: false,
    splashGrow: false,
    splashLeaving: false,
    splashHidden: false,
    homeLocked: true,
    wallAwaken: false,
    wallInstant: false,
    wallLift: 0,
    gathering: false,
    refreshing: false,
    topPad: 88,
    bottomPad: 24,
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      topPad: (windowInfo.statusBarHeight || 44) + 12,
      bottomPad: (windowInfo.safeArea
        ? windowInfo.screenHeight - windowInfo.safeArea.bottom
        : 16) + 12,
    })
    this._timers = []
    try {
      const catalog = require('../../services/catalog.js')
      catalog.bootstrapCatalog()
    } catch (error) {
      console.error('[lampy] catalog bootstrap failed', error)
    }
    try {
      this.refresh()
    } catch (error) {
      console.error('[lampy] refresh failed', error)
    }
    this.playSplashIfNeeded()
  },

  onShow() {
    try {
      this.refresh()
      this.refreshLights()
    } catch (error) {
      console.error('[lampy] onShow refresh failed', error)
    }
  },

  onUnload() {
    this.clearTimers()
  },

  refresh() {
    this.setData({
      dateLabel: formatHomeDate(),
      incoming: hasIncomingLight(),
    })
    this.refreshLights()
  },

  refreshLights() {
    try {
      const catalog = require('../../services/catalog.js')
      const { projectMomentsToLightWall } = require('../../projections/light-wall-projection.js')
      const moments = catalog.listActiveMoments()
      this.setData({
        lights: projectMomentsToLightWall(moments, Date.now()),
      })
    } catch (error) {
      console.error('[lampy] refreshLights failed', error)
    }
  },

  playSplashIfNeeded() {
    if (wx.getStorageSync(SPLASH_KEY)) {
      this.setData({
        splashHidden: true,
        homeLocked: false,
        wallAwaken: false,
        wallInstant: true,
      })
      return
    }

    this.setData({
      splashHidden: false,
      splashGrow: false,
      splashLeaving: false,
      homeLocked: true,
      wallAwaken: false,
      wallInstant: false,
    })

    this._timers.push(setTimeout(() => {
      this.setData({ splashGrow: true })
    }, 1800))

    this._timers.push(setTimeout(() => {
      this.setData({
        splashLeaving: true,
        wallAwaken: true,
      })
    }, 2100))

    this._timers.push(setTimeout(() => {
      wx.setStorageSync(SPLASH_KEY, true)
      this.setData({
        splashHidden: true,
        homeLocked: false,
      })
    }, 2600))
  },

  clearTimers() {
    if (!this._timers) return
    this._timers.forEach((timer) => clearTimeout(timer))
    this._timers = []
  },

  onSplashTouch() {
    return false
  },

  onSelectLight(e) {
    if (this.data.homeLocked) return
    const detail = e.detail || {}
    if (detail.seed) {
      console.log('[lampy] seed light')
      return
    }
    console.log('点击光点：', detail.light)
  },

  onIncoming() {
    if (this.data.homeLocked) return
    console.log('[lampy] incoming light')
  },

  onNearby() {
    this.onNearbyTap()
  },

  onNearbyTap() {
    if (this.data.homeLocked) return
    wx.navigateTo({
      url: '/pages/nearby/nearby',
    })
  },

  onJar() {
    this.onVaultTap()
  },

  onVaultTap() {
    if (this.data.homeLocked || this.data.gathering) return
    wx.vibrateShort({ type: 'light' })
    this.setData({ gathering: true })
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/vault/vault',
        complete: () => {
          this.setData({ gathering: false })
        },
      })
    }, 600)
  },

  onLightToday() {
    this.onRecordTap()
  },

  onRecordTap() {
    if (this.data.homeLocked) return
    wx.navigateTo({
      url: '/pages/record/record',
    })
  },

  onPulling(e) {
    if (this.data.homeLocked) return
    const dy = (e.detail && e.detail.dy) || 0
    this.setData({ wallLift: Math.min(18, Math.max(0, dy * 0.28)) })
  },

  onRefresh() {
    if (this.data.homeLocked) return
    this.setData({ refreshing: true, wallLift: 12 })
    this.refresh()
    setTimeout(() => {
      this.setData({ wallLift: 0, refreshing: false })
    }, motion.liftMs)
  },
})
