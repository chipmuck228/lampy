const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  createAudioPlaybackController,
  markAssetPlaybackFailed,
} = require('../services/audio-playback-controller.js')

function createFakePlayer() {
  const handlers = {}
  return {
    src: '',
    onPlay(fn) { handlers.play = fn },
    onPause(fn) { handlers.pause = fn },
    onStop(fn) { handlers.stop = fn },
    onEnded(fn) { handlers.ended = fn },
    onError(fn) { handlers.error = fn },
    play() {},
    stop() {},
    pause() {},
    destroy() { this.destroyed = true },
    emit(type, payload) {
      if (handlers[type]) handlers[type](payload)
    },
  }
}

describe('audio playback controller', () => {
  it('keeps B playing when a late onStop from A arrives', () => {
    const player = createFakePlayer()
    const controller = createAudioPlaybackController({ player })
    controller.bindPlayer(player)

    const sessionA = controller.play('voice-a', 'wxfile://a.mp3').session
    assert.equal(controller.getState().playingAssetId, 'voice-a')

    const sessionB = controller.play('voice-b', 'wxfile://b.mp3').session
    player.emit('play')
    controller.dispatch({ type: 'stop', sessionId: sessionA.sessionId })

    const state = controller.getState()
    assert.equal(sessionB.assetId, 'voice-b')
    assert.equal(state.playingAssetId, 'voice-b')
    assert.equal(state.status, 'playing')
    assert.equal(state.isPlaying, true)
  })

  it('does not let a stale onEnded or onError replace the new session', () => {
    const player = createFakePlayer()
    const controller = createAudioPlaybackController({ player })
    controller.bindPlayer(player)
    const sessionA = controller.play('voice-a', 'wxfile://a.mp3').session
    controller.play('voice-b', 'wxfile://b.mp3')
    player.emit('play')
    controller.dispatch({ type: 'ended', sessionId: sessionA.sessionId })
    controller.dispatch({ type: 'error', sessionId: sessionA.sessionId })
    assert.equal(controller.getState().playingAssetId, 'voice-b')
    assert.equal(controller.getState().status, 'playing')
  })

  it('marks only the failed clip unavailable in page session state', () => {
    const failed = []
    const player = createFakePlayer()
    const controller = createAudioPlaybackController({
      player,
      onPlaybackFailed(assetId) { failed.push(assetId) },
    })
    controller.bindPlayer(player)
    controller.play('voice-a', 'wxfile://a.mp3')
    player.emit('error', { errMsg: 'fail' })
    assert.deepEqual(failed, ['voice-a'])
    assert.equal(controller.getState().status, 'unavailable')
    assert.equal(controller.getState().playingAssetId, 'voice-a')

    const detail = {
      assets: [
        { id: 'voice-a', type: 'audio', status: 'available', localUri: 'wxfile://a.mp3', display: {} },
        { id: 'voice-b', type: 'audio', status: 'available', localUri: 'wxfile://b.mp3', display: {} },
      ],
      state: { hasAudio: true, hasUnavailableAssets: false },
    }
    const before = JSON.parse(JSON.stringify(detail))
    const next = markAssetPlaybackFailed(detail, 'voice-a')
    assert.deepEqual(detail, before)
    assert.equal(next.assets[0].status, 'failed')
    assert.equal(next.assets[1].status, 'available')
    assert.equal(next.state.hasAudio, true)
    assert.equal(next.state.hasUnavailableAssets, true)
    assert.equal(Object.prototype.hasOwnProperty.call(next.assets[0], 'localUri'), false)
  })
})
