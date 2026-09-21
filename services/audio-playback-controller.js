/**
 * 详情页录音播放适配。每次播放创建独立播放器实例，
 * 监听器关闭在该 session 上。旧实例的延迟事件不能改写新播放。
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
      display: Object.assign({}, item.display, {
        unavailableLabel: '声音暂时无法播放',
      }),
    }
  })
  const state = Object.assign({}, detail.state, {
    hasAudio: assets.some((item) => item.type === 'audio' && item.status === 'available'),
    hasUnavailableAssets: assets.some((item) => item.status !== 'available'),
  })
  return Object.assign({}, detail, { assets, state })
}

function destroyPlayer(player) {
  if (!player) return
  try { player.stop() } catch (error) { /* already stopped */ }
  if (player.destroy) {
    try { player.destroy() } catch (error) { /* already destroyed */ }
  }
}

function createAudioPlaybackController(options) {
  const opts = options || {}
  let seq = 0
  let current = null
  let state = idleAudioState()

  function publish(next) {
    state = next
    if (opts.onState) opts.onState(state)
    return state
  }

  function apply(intent) {
    return publish(applyAudioIntent(state, intent))
  }

  function createPlayer() {
    if (opts.createPlayer) return opts.createPlayer()
    return null
  }

  function bindSession(player, session) {
    const sessionId = session.sessionId
    if (!player) return
    player.onPlay(() => dispatch({ type: 'play', sessionId }))
    player.onPause(() => dispatch({ type: 'pause', sessionId }))
    player.onStop(() => dispatch({ type: 'stop', sessionId }))
    player.onEnded(() => dispatch({ type: 'ended', sessionId }))
    player.onError((error) => {
      if (opts.onPlayerError) opts.onPlayerError(error)
      dispatch({ type: 'error', sessionId })
    })
  }

  function play(assetId, src) {
    seq += 1
    const next = { sessionId: `play:${seq}`, assetId, player: null }
    const previous = current
    current = next
    if (previous && previous.player) {
      destroyPlayer(previous.player)
    }
    const player = createPlayer()
    next.player = player
    bindSession(player, next)
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
      return finishSession(event.type)
    }
    if (event.type === 'error') {
      const assetId = current.assetId
      const next = finishSession('fail', assetId)
      if (opts.onPlaybackFailed) opts.onPlaybackFailed(assetId)
      return next
    }
    return state
  }

  function finishSession(type, assetId) {
    const session = current
    current = null
    if (session && session.player) destroyPlayer(session.player)
    if (type === 'fail') return apply({ type: 'fail', assetId: assetId || (session && session.assetId) })
    return apply({ type })
  }

  function currentPlayer() {
    return current && current.player
  }

  function pause() {
    const player = currentPlayer()
    if (player) {
      try { player.pause() } catch (error) { /* already paused */ }
    }
    return apply({ type: 'pause' })
  }

  function resume() {
    const player = currentPlayer()
    if (player) {
      try { player.play() } catch (error) { /* keep paused */ }
    }
    return apply({ type: 'resume' })
  }

  function stopCurrent() {
    return finishSession('stop')
  }

  function release() {
    const session = current
    current = null
    if (session && session.player) destroyPlayer(session.player)
    return publish(idleAudioState())
  }

  return {
    play,
    pause,
    resume,
    stopCurrent,
    release,
    dispatch,
    getState() { return state },
    getSession() { return current },
  }
}

module.exports = {
  createAudioPlaybackController,
  markAssetPlaybackFailed,
}
