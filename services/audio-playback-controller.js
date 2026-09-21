/**
 * 详情页录音播放适配。每次播放有独立 session，
 * 过期的 onStop / onEnded / onError 不能覆盖当前播放。
 */
const { idleAudioState, applyAudioIntent } = require('./audio-player-state.js')

function markAssetPlaybackFailed(detail, assetId) {
  if (!detail || !assetId) return detail
  const assets = (detail.assets || []).map((item) => {
    if (item.id !== assetId) return item
    return {
      id: item.id,
      type: item.type,
      status: 'failed',
      display: item.display || {},
    }
  })
  const state = Object.assign({}, detail.state, {
    hasAudio: assets.some((item) => item.type === 'audio' && item.status === 'available'),
    hasUnavailableAssets: assets.some((item) => item.status !== 'available'),
  })
  return Object.assign({}, detail, { assets, state })
}

function createAudioPlaybackController(options) {
  const opts = options || {}
  let seq = 0
  let current = null
  let lastStopSessionId = null
  let state = idleAudioState()
  let player = opts.player || null

  function publish(next) {
    state = next
    if (opts.onState) opts.onState(state)
    return state
  }

  function apply(intent) {
    return publish(applyAudioIntent(state, intent))
  }

  function play(assetId, src) {
    seq += 1
    const next = { sessionId: `play:${seq}`, assetId }
    if (current) {
      lastStopSessionId = current.sessionId
      if (player) {
        try { player.stop() } catch (error) { /* switching */ }
      }
    }
    current = next
    if (player) {
      player.src = src
      player.play()
    }
    return { session: next, state: apply({ type: 'play', assetId }) }
  }

  function dispatch(event) {
    if (!event || !current) return state
    if (event.sessionId !== current.sessionId) return state
    if (event.type === 'play') return apply({ type: 'play', assetId: current.assetId })
    if (event.type === 'pause') return apply({ type: 'pause' })
    if (event.type === 'ended' || event.type === 'stop') {
      current = null
      return apply({ type: event.type })
    }
    if (event.type === 'error') {
      const assetId = current.assetId
      current = null
      if (opts.onPlaybackFailed) opts.onPlaybackFailed(assetId)
      return apply({ type: 'fail', assetId })
    }
    return state
  }

  function bindPlayer(nextPlayer) {
    player = nextPlayer
    player.onPlay(() => {
      dispatch({ type: 'play', sessionId: current && current.sessionId })
    })
    player.onPause(() => {
      dispatch({ type: 'pause', sessionId: current && current.sessionId })
    })
    player.onEnded(() => {
      dispatch({ type: 'ended', sessionId: current && current.sessionId })
    })
    player.onStop(() => {
      dispatch({ type: 'stop', sessionId: lastStopSessionId })
    })
    player.onError((error) => {
      if (opts.onPlayerError) opts.onPlayerError(error)
      dispatch({ type: 'error', sessionId: current && current.sessionId })
    })
  }

  function pause() {
    if (player) {
      try { player.pause() } catch (error) { /* already paused */ }
    }
    return apply({ type: 'pause' })
  }

  function resume() {
    if (player) {
      try { player.play() } catch (error) { /* keep paused */ }
    }
    return apply({ type: 'resume' })
  }

  function stopCurrent() {
    if (current) lastStopSessionId = current.sessionId
    if (player) {
      try { player.stop() } catch (error) { /* already stopped */ }
    }
    current = null
    return apply({ type: 'stop' })
  }

  function release() {
    stopCurrent()
    if (player && player.destroy) {
      try { player.destroy() } catch (error) { /* already destroyed */ }
    }
    player = null
    current = null
    lastStopSessionId = null
    return publish(idleAudioState())
  }

  return {
    play,
    pause,
    resume,
    stopCurrent,
    release,
    dispatch,
    bindPlayer,
    getState() { return state },
    getSession() { return current },
  }
}

module.exports = {
  createAudioPlaybackController,
  markAssetPlaybackFailed,
}
