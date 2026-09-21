/**
 * Moment 只读详情：重新看见一条已经点亮的光。
 */
const { getMomentDetail } = require('../../services/moment-detail-service.js')
const { idleAudioState, applyAudioIntent } = require('../../services/audio-player-state.js')
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
    const rawId = query && query.id
    const momentId = rawId ? decodeURIComponent(rawId) : ''
    if (!momentId) {
      this.setData({ status: 'not-found' })
      return
    }
    this.loadDetail(momentId)
  },

  onHide() {
    this.stopAudio()
  },

  onUnload() {
    this.releasePlayer()
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

  ensurePlayer() {
    if (this._player) return this._player
    const player = wx.createInnerAudioContext()
    player.onPlay(() => {
      this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'play', assetId: this._playingId }) })
    })
    player.onPause(() => {
      this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'pause' }) })
    })
    player.onEnded(() => {
      this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'ended' }) })
    })
    player.onStop(() => {
      this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'stop' }) })
    })
    player.onError((error) => {
      console.error('[lampy] audio playback failed', error)
      this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'fail', assetId: this._playingId }) })
    })
    this._player = player
    return player
  },

  onAudioTap(e) {
    const id = e.currentTarget.dataset.id
    const detail = this.data.detail
    if (!detail) return
    const asset = (detail.assets || []).find((item) => item.id === id)
    if (!asset || asset.type !== 'audio' || asset.status !== 'available' || !asset.localUri) {
      this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'fail', assetId: id }) })
      return
    }
    const audio = this.data.audio
    const player = this.ensurePlayer()
    if (audio.playingAssetId === id && audio.isPlaying) {
      player.pause()
      return
    }
    if (audio.playingAssetId === id && audio.status === 'paused') {
      player.play()
      return
    }
    this._playingId = id
    if (audio.playingAssetId && audio.playingAssetId !== id) {
      try { player.stop() } catch (error) { /* keep switching */ }
    }
    player.src = asset.localUri
    player.play()
    this.setData({ audio: applyAudioIntent(audio, { type: 'play', assetId: id }) })
  },

  stopAudio() {
    if (!this._player) return
    try { this._player.stop() } catch (error) { /* already stopped */ }
    this.setData({ audio: applyAudioIntent(this.data.audio, { type: 'stop' }) })
  },

  releasePlayer() {
    if (!this._player) return
    try { this._player.stop() } catch (error) { /* already stopped */ }
    try { this._player.destroy() } catch (error) { /* already destroyed */ }
    this._player = null
    this._playingId = ''
    this.setData({ audio: idleAudioState() })
  },
})
