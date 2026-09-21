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
    destroyed: false,
    onPlay(fn) { handlers.play = fn },
    onPause(fn) { handlers.pause = fn },
    onStop(fn) { handlers.stop = fn },
    onEnded(fn) { handlers.ended = fn },
    onError(fn) { handlers.error = fn },
    play() {},
    stop() {
      if (handlers.stop) handlers.stop()
    },
    pause() {},
    destroy() { this.destroyed = true },
    emit(type, payload) {
      if (handlers[type]) handlers[type](payload)
    },
  }
}

function createController(extra) {
  const players = []
  const failed = []
  const controller = createAudioPlaybackController(Object.assign({
    createPlayer() {
      const player = createFakePlayer()
      players.push(player)
      return player
    },
    onPlaybackFailed(assetId) { failed.push(assetId) },
  }, extra || {}))
  return { controller, players, failed }
}

describe('audio playback controller', () => {
  it('keeps B playing after play A, stop A, play B, onPlay B, then a late onStop A', () => {
    const { controller, players } = createController()
    controller.play('voice-a', 'wxfile://a.mp3')
    players[0].stop()
    controller.play('voice-b', 'wxfile://b.mp3')
    players[1].emit('play')
    players[0].emit('stop')
    const state = controller.getState()
    assert.equal(state.playingAssetId, 'voice-b')
    assert.equal(state.status, 'playing')
    assert.equal(state.isPlaying, true)
  })

  it('keeps B playing when A later emits stop, ended, and error through its own player', () => {
    const { controller, players, failed } = createController()

    controller.play('voice-a', 'wxfile://a.mp3')
    assert.equal(controller.getState().playingAssetId, 'voice-a')
    const playerA = players[0]

    controller.play('voice-b', 'wxfile://b.mp3')
    const playerB = players[1]
    assert.equal(playerA.destroyed, true)
    assert.notEqual(playerA, playerB)

    playerB.emit('play')
    playerA.emit('stop')
    playerA.emit('ended')
    playerA.emit('error', { errMsg: 'late A' })

    const state = controller.getState()
    assert.equal(state.playingAssetId, 'voice-b')
    assert.equal(state.status, 'playing')
    assert.equal(state.isPlaying, true)
    assert.deepEqual(failed, [])
  })

  it('still marks the current clip unavailable when its own player errors', () => {
    const { controller, players, failed } = createController()
    controller.play('voice-a', 'wxfile://a.mp3')
    controller.play('voice-b', 'wxfile://b.mp3')
    players[1].emit('play')
    players[0].emit('error', { errMsg: 'stale A' })
    assert.equal(controller.getState().status, 'playing')
    players[1].emit('error', { errMsg: 'real B' })
    assert.deepEqual(failed, ['voice-b'])
    assert.equal(controller.getState().status, 'unavailable')
    assert.equal(controller.getState().playingAssetId, 'voice-b')
  })

  it('marks only the failed clip unavailable in page session state', () => {
    const { controller, players, failed } = createController()
    controller.play('voice-a', 'wxfile://a.mp3')
    players[0].emit('error', { errMsg: 'fail' })
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
    assert.equal(next.assets[0].display.unavailableLabel, '声音暂时无法播放')
    assert.equal(next.assets[1].status, 'available')
    assert.equal(next.state.hasAudio, true)
    assert.equal(next.state.hasUnavailableAssets, true)
    assert.equal(Object.prototype.hasOwnProperty.call(next.assets[0], 'localUri'), false)
  })
})
