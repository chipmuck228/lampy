const { LOCAL_OWNER_ID } = require('../domain/shared/identity.js')
const { migrateLightsToMomentsV1 } = require('../migrations/migrate-lights-to-moments-v1.js')
const { KEYS } = require('../repositories/keys.js')
const { getRuntime } = require('./runtime.js')
const { generateMockLights } = require('../utils/mock-lights.js')

function seedLegacyLightsIfEmpty(storage) {
  const moments = storage.get(KEYS.moments, [])
  const lights = storage.get(KEYS.lights, [])
  const hasMoments = Array.isArray(moments) && moments.length > 0
  const hasLights = Array.isArray(lights) && lights.length > 0
  if (!hasMoments && !hasLights) {
    storage.set(KEYS.lights, generateMockLights())
  }
}

function bootstrapCatalog(storage) {
  const runtime = getRuntime(storage)
  seedLegacyLightsIfEmpty(runtime.storage)
  migrateLightsToMomentsV1({
    storage: runtime.storage,
    now: Date.now(),
    ownerId: LOCAL_OWNER_ID,
  })
  return runtime
}

function listActiveMoments(storage) {
  const runtime = getRuntime(storage)
  return runtime.moments.list().filter((item) => item.lifecycle.status === 'active')
}

module.exports = {
  bootstrapCatalog,
  listActiveMoments,
}
