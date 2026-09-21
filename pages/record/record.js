/**
 * 记录页：写下今天的瞬间，点亮一盏微光。
 */
const { loadDraftForm, saveDraftFromForm, submitRecord, passMoment } = require('../../services/record-service.js')

function glowFromText(text) {
  const length = (text || '').length
  return {
    lightScale: Math.min(1.2, 1 + length * 0.002),
    lightOpacity: Math.min(1, 0.8 + length * 0.005),
  }
}

function canSubmitOf(data) {
  return !!(String(data.text || '').trim() || data.hasImage || data.hasVoice)
}

Page({
  data: {
    text: '',
    imagePath: '',
    hasImage: false,
    emotion: '',
    emotions: ['平静', '喜悦', '感动', '温暖', '惊喜', '释然'],
    showEmotion: false,
    showPass: false,
    canSubmit: false,
    lightScale: 1,
    lightOpacity: 0.8,
    isRecording: false,
    voiceLabel: '语音',
    hasVoice: false,
    voicePath: '',
    headerPad: 88,
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const draft = loadDraftForm()
    const text = draft && draft.text ? draft.text : ''
    const imagePath = draft && draft.imagePath ? draft.imagePath : ''
    const emotion = draft && draft.emotion ? draft.emotion : ''
    const next = {
      text,
      imagePath,
      hasImage: !!imagePath,
      emotion,
      headerPad: (windowInfo.statusBarHeight || 44) + 12,
      ...glowFromText(text),
    }
    next.canSubmit = canSubmitOf(next)
    this.setData(next)
    this.initRecorder()
  },

  onTextInput(e) {
    const text = e.detail.value
    this.setData({
      text,
      canSubmit: canSubmitOf({ ...this.data, text }),
      ...glowFromText(text),
    })
    this.saveDraft()
  },

  saveDraft() {
    const { text, imagePath, emotion, voicePath } = this.data
    saveDraftFromForm({ text, imagePath, emotion, voicePath })
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        this.setData({
          imagePath: file.tempFilePath,
          hasImage: true,
          canSubmit: true,
        })
        this.saveDraft()
      },
    })
  },

  onRemoveImage() {
    const next = {
      imagePath: '',
      hasImage: false,
    }
    this.setData({
      ...next,
      canSubmit: canSubmitOf({ ...this.data, ...next }),
    })
    this.saveDraft()
  },

  initRecorder() {
    const recorder = wx.getRecorderManager()
    recorder.onStop((res) => {
      this._recording = false
      if (!res || res.duration < 1000) {
        wx.showToast({ title: '录音太短了', icon: 'none' })
        this.setData({
          isRecording: false,
          voiceLabel: this.data.hasVoice ? this.data.voiceLabel : '语音',
        })
        return
      }
      this.setData({
        voicePath: res.tempFilePath,
        hasVoice: true,
        isRecording: false,
        voiceLabel: `${Math.round(res.duration / 1000)}″`,
        canSubmit: true,
      })
      this.saveDraft()
    })
    this._recorder = recorder
  },

  onVoiceStart() {
    if (this._recording) return
    this._recording = true
    this.setData({ isRecording: true, voiceLabel: '松手结束' })
    wx.vibrateShort({ type: 'light' })
    this._recorder.start({
      duration: 60000,
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
    })
  },

  onVoiceEnd() {
    if (!this._recording && !this.data.isRecording) return
    this.setData({ isRecording: false })
    this._recorder.stop()
  },

  onEmotionTap() {
    this.setData({ showEmotion: true })
  },

  onEmotionClose() {
    this.setData({ showEmotion: false })
  },

  onEmotionPanelTap() {},

  onEmotionSelect(e) {
    const emotion = e.currentTarget.dataset.emotion
    const finalEmotion = this.data.emotion === emotion ? '' : emotion
    this.setData({
      emotion: finalEmotion,
      showEmotion: false,
    })
    this.saveDraft()
  },

  onSubmit() {
    if (!this.data.canSubmit || this.data.showPass) return

    const { text, imagePath, emotion, voicePath } = this.data
    const moment = submitRecord({
      text: text.trim(),
      imagePath: imagePath || '',
      voicePath: voicePath || '',
      emotion: emotion || '',
    })
    this._submittedMomentId = moment && moment.id
    wx.vibrateShort({ type: 'light' })
    this.setData({ showPass: true })
  },

  onPassConfirm() {
    try {
      passMoment(this._submittedMomentId)
    } catch (error) {
      console.error('[lampy] pass moment failed', error)
      return
    }
    wx.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage'],
    })
    wx.showToast({ title: '已递出', icon: 'none', duration: 1200 })
    setTimeout(() => {
      this.setData({ showPass: false })
      wx.navigateBack()
    }, 800)
  },

  onPassCancel() {
    this.setData({ showPass: false })
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage && typeof prevPage.refreshLights === 'function') {
      prevPage.refreshLights()
    }
    wx.navigateBack()
  },

  onClose() {
    this.saveDraft()
    wx.navigateBack()
  },

  onShareAppMessage() {
    return {
      title: '有人为你点亮了一盏微光',
      path: '/pages/index/index',
    }
  },
})
