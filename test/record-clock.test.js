const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryStorage } = require('../repositories/storage-adapter.js')
const { resetRuntime } = require('../services/runtime.js')
const { submitRecord, saveDraftFromForm } = require('../services/record-service.js')
const { KEYS } = require('../repositories/keys.js')

afterEach(() => {
  resetRuntime()
})

function steppingClock(instants) {
  let calls = 0
  return {
    now() {
      const instant = instants[Math.min(calls, instants.length - 1)]
      calls += 1
      return instant
    },
    get calls() {
      return calls
    },
  }
}

describe('record service clock', () => {
  it('uses one clock instant for the whole submit even if later reads would go backwards', () => {
    const first = new Date('2026-09-21T10:00:00.000Z')
    const earlier = new Date('2026-09-21T09:59:59.999Z')
    const clock = steppingClock([first, earlier, earlier, earlier])
    const storage = createMemoryStorage({
      [KEYS.lights]: [],
      [KEYS.moments]: [],
    })
    const moment = submitRecord({
      text: '同一时刻点亮',
      imagePath: 'wxfile://tmp/a.jpg',
      voicePath: 'wxfile://tmp/a.mp3',
    }, storage, clock)
    assert.equal(clock.calls, 1)
    assert.equal(moment.audit.createdAt, first.toISOString())
    assert.equal(moment.audit.updatedAt, first.toISOString())
    assert.equal(moment.time.recordedAt, first.toISOString())
    assert.equal(moment.lifecycle.activatedAt, first.toISOString())
    assert.ok(Date.parse(moment.audit.updatedAt) >= Date.parse(moment.audit.createdAt))
  })

  it('uses the same injected instant when saving a new draft', () => {
    const first = new Date('2026-09-21T10:00:00.000Z')
    const earlier = new Date('2026-09-21T09:59:59.000Z')
    const clock = steppingClock([first, earlier])
    const storage = createMemoryStorage({})
    const draft = saveDraftFromForm({
      text: '草稿',
    }, storage, clock)
    assert.equal(clock.calls, 1)
    assert.equal(draft.audit.createdAt, first.toISOString())
    assert.equal(draft.audit.updatedAt, first.toISOString())
  })
})
