/**
 * 光罐：所有光点汇成星空，按日 / 月 / 年重排。
 */
const { listActiveMoments } = require('../../services/catalog.js')
const { projectMomentsToVault } = require('../../projections/vault-projection.js')
const { deviceTimezoneOffsetMinutes } = require('../../domain/shared/calendar.js')

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
    const moments = listActiveMoments()
    this.setData({
      lights: moments,
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
    const projected = projectMomentsToVault(
      this.data.lights,
      this.data.currentView,
      Date.now(),
      { timezoneOffsetMinutes: deviceTimezoneOffsetMinutes() }
    )
    this.setData({
      arrangedLights: projected.arrangedLights,
      caption: projected.caption,
    })
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
    const light = (this.data.arrangedLights || []).find((item) => item.id === id)
    console.log('光罐点击光点：', light)
  },
})
