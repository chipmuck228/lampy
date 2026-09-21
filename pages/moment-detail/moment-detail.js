/**
 * Moment 只读详情：重新看见一条已经点亮的光。
 */
const { getMomentDetail, decodeMomentQueryId } = require('../../services/moment-detail-service.js')
const { idleAudioState } = require('../../services/audio-player-state.js')
const {
  createAudioPlaybackController,
  markAssetPlaybackFailed,
} = require('../../services/audio-playback-controller.js')
const { ERROR_CODES } = require('../../domain/moment/moment.errors.js')
const { deviceTimezoneOffsetMinutes } = require('../../domain/shared/calendar.js')

Page({
  data: {
    status: 'loading',
    detail: null,
    audio: idleAudioState(),
    headerPad: 88,
    bottomPad: 24,
  },

  onLoad(query) {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      headerPad: (windowInfo.statusBarHeight || 44) + 12,
      bottomPad: windowInfo.safeArea
        ? windowInfo.screenHeight - windowInfo.safeArea.bottom + 24
        : 40,
    })
    this._playback = createAudioPlaybackController({
      onState: (audio) => this.setData({ audio }),
      onPlaybackFailed: (assetId) => this.markAudioFailed(assetId),
      onPlayerError: (error) => console.error('[lampy] audio playback failed', error),
    })
    const momentId = decodeMomentQueryId(query && query.id)
    if (!momentId) {
      this.setData({ status: 'not-found' })
      return
    }
    this.loadDetail(momentId)
  },

  onHide() {
    if (this._playback) this._playback.stopCurrent()
  },

  onUnload() {
    if (this._playback) this._playback.release()
    this._player = null
  },

  loadDetail(momentId) {
    this.setData({ status: 'loading', detail: null })
    try {
      const detail = getMomentDetail(momentId, undefined, {
        timezoneOffsetMinutes: deviceTimezoneOffsetMinutes(),
      })
      this.setData({ status: 'ready', detail })
    } catch (error) {
      console.error('[lampy] moment detail failed', error)
      const notFound = error && (
        error.code === ERROR_CODES.MOMENT_NOT_FOUND ||
        error.code === ERROR_CODES.MOMENT_INVALID_ID
      )
      this.setData({ status: notFound ? 'not-found' : 'error' })
    }
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' })
      },
    })
  },

  onImageTap(e) {
    const id = e.currentTarget.dataset.id
    const detail = this.data.detail
    if (!detail || !detail.assets) return
    const images = detail.assets.filter((item) => item.type === 'image' && item.status === 'available' && item.localUri)
    const current = images.find((item) => item.id === id)
    if (!current) return
    wx.previewImage({
      current: current.localUri,
      urls: images.map((item) => item.localUri),
    })
  },

  onImageError(e) {
    const id = e.currentTarget.dataset.id
    const detail = this.data.detail
    if (!detail || !detail.assets) return
    const assets = detail.assets.map((item) => {
      if (item.id !== id) return item
      return {
        id: item.id,
        type: item.type,
        status: 'missing',
        display: item.display || {},
      }
    })
    this.setData({
      'detail.assets': assets,
      'detail.state.hasImages': assets.some((item) => item.type === 'image' && item.status === 'available'),
      'detail.state.hasUnavailableAssets': assets.some((item) => item.status !== 'available'),
    })
  },

  markAudioFailed(assetId) {
    const detail = markAssetPlaybackFailed(this.data.detail, assetId)
    if (detail) this.setData({ detail })
  },

  ensurePlayer() {
    if (this._player) return this._player
    const player = wx.createInnerAudioContext()
    this._player = player
    if (this._playback) this._playback.bindPlayer(player)
    return player
  },

  onAudioTap(e) {
    const id = e.currentTarget.dataset.id
    const detail = this.data.detail
    if (!detail || !this._playback) return
    const asset = (detail.assets || []).find((item) => item.id === id)
    if (!asset || asset.type !== 'audio' || asset.status !== 'available' || !asset.localUri) {
      this.markAudioFailed(id)
      return
    }
    this.ensurePlayer()
    const audio = this.data.audio
    if (audio.playingAssetId === id && audio.isPlaying) {
      this._playback.pause()
      return
    }
    if (audio.playingAssetId === id && audio.status === 'paused') {
      this._playback.resume()
      return
    }
    this._playback.play(id, asset.localUri)
  },
})
