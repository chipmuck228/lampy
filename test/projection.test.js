const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createDraftMoment, activateMoment } = require('../domain/moment')
const { projectMomentToLightWall, projectMomentsToLightWall } = require('../projections/light-wall-projection')
const { projectMomentsToVault } = require('../projections/vault-projection')

const NOW = new Date('2026-09-20T02:00:00.000Z')
const OWNER = 'local-user'

function activeMoment(id, occurredAt, note) {
  let moment = createDraftMoment({
    id,
    ownerId: OWNER,
    content: { note },
    time: { occurredAt, occurredAtPrecision: 'exact', recordedAt: occurredAt },
  }, { now: () => NOW })
  return activateMoment(moment, OWNER, NOW)
}

describe('projections', () => {
  it('is deterministic for the same moment and now', () => {
    const moment = activeMoment('moment_a', '2026-09-18T02:00:00.000Z', '今天阳光很好')
    const a = projectMomentToLightWall(moment, NOW.getTime())
    const b = projectMomentToLightWall(moment, NOW.getTime())
    assert.deepEqual(a, b)
    assert.ok(a.position.x >= 0.08 && a.position.x <= 0.92)
    assert.equal(Object.prototype.hasOwnProperty.call(a, 'isPassed'), false)
  })

  it('does not mutate the moment', () => {
    const moment = activeMoment('moment_b', '2026-09-18T02:00:00.000Z', 'x')
    const before = JSON.stringify(moment)
    projectMomentToLightWall(moment, NOW.getTime())
    assert.equal(JSON.stringify(moment), before)
  })

  it('vault day/month/year filters by occurred time', () => {
    const today = activeMoment('m-today', '2026-09-20T01:00:00.000Z', 'today')
    const month = activeMoment('m-month', '2026-09-05T01:00:00.000Z', 'month')
    const year = activeMoment('m-year', '2026-03-01T01:00:00.000Z', 'year')
    const moments = [today, month, year]
    const now = NOW.getTime()

    const dayView = projectMomentsToVault(moments, 'day', now)
    assert.equal(dayView.arrangedLights.length, 1)
    assert.equal(dayView.arrangedLights[0].id, 'm-today')
    assert.match(dayView.caption, /今天/)

    const monthView = projectMomentsToVault(moments, 'month', now)
    assert.equal(monthView.arrangedLights.length, 2)
    assert.match(monthView.caption, /这个月/)

    const yearView = projectMomentsToVault(moments, 'year', now)
    assert.equal(yearView.arrangedLights.length, 3)
    assert.match(yearView.caption, /这一年/)

    const again = projectMomentsToVault(moments, 'month', now)
    assert.deepEqual(again, monthView)
  })

  it('light wall only projects active moments', () => {
    const moment = activeMoment('m-active', '2026-09-20T01:00:00.000Z', 'ok')
    const lights = projectMomentsToLightWall([moment], NOW.getTime())
    assert.equal(lights.length, 1)
    assert.equal(lights[0].id, 'm-active')
  })
})
