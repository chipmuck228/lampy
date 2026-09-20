const { createWxStorage } = require('../repositories/storage-adapter.js')
const { createMomentRepository } = require('../repositories/moment-repository.js')
const { createAssetRepository } = require('../repositories/asset-repository.js')
const { createTransmissionRepository } = require('../repositories/transmission-repository.js')

let runtime = null

function createRuntime(storage) {
  return {
    storage,
    moments: createMomentRepository(storage),
    assets: createAssetRepository(storage),
    transmissions: createTransmissionRepository(storage),
  }
}

function getRuntime(storage) {
  if (storage) {
    runtime = createRuntime(storage)
    return runtime
  }
  if (!runtime) runtime = createRuntime(createWxStorage())
  return runtime
}

function resetRuntime() {
  runtime = null
}

module.exports = {
  createRuntime,
  getRuntime,
  resetRuntime,
}
