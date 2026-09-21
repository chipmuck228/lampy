/**
 * 详情页录音播放器的纯状态转换。不调用微信 API。
 */

function idleAudioState() {
  return {
    playingAssetId: '',
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    status: 'idle',
  }
}

function applyAudioIntent(state, intent) {
  const current = state || idleAudioState()
  const type = intent && intent.type
  if (type === 'play') {
    return {
      playingAssetId: intent.assetId,
      isPlaying: true,
      isPaused: false,
      currentTime: current.playingAssetId === intent.assetId ? current.currentTime : 0,
      duration: current.playingAssetId === intent.assetId ? current.duration : 0,
      status: 'playing',
    }
  }
  if (type === 'pause') {
    return Object.assign({}, current, {
      isPlaying: false,
      isPaused: true,
      status: 'paused',
    })
  }
  if (type === 'resume') {
    return Object.assign({}, current, {
      isPlaying: true,
      isPaused: false,
      status: 'playing',
    })
  }
  if (type === 'ended' || type === 'stop' || type === 'reset') {
    return idleAudioState()
  }
  if (type === 'fail') {
    return {
      playingAssetId: intent.assetId || current.playingAssetId,
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      duration: 0,
      status: 'unavailable',
    }
  }
  if (type === 'time') {
    return Object.assign({}, current, {
      currentTime: Number.isFinite(intent.currentTime) ? intent.currentTime : current.currentTime,
      duration: Number.isFinite(intent.duration) ? intent.duration : current.duration,
    })
  }
  return current
}

module.exports = {
  idleAudioState,
  applyAudioIntent,
}
