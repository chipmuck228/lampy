const { validateAsset } = require('../domain/asset/index.js')
const { KEYS } = require('./keys.js')
const { createSafeRepository } = require('./safe-repository.js')

function createAssetRepository(storage) {
  return createSafeRepository({
    storage,
    collectionKey: KEYS.assets,
    quarantineKey: KEYS.assetsQuarantine,
    entityType: 'asset',
    validate: validateAsset,
  })
}

module.exports = {
  createAssetRepository,
}
