const { validateAsset } = require('../domain/asset/index.js')
const { KEYS } = require('./keys')

function createAssetRepository(storage) {
  function readAll() {
    const raw = storage.get(KEYS.assets, [])
    if (!Array.isArray(raw)) return []
    return raw.filter((item) => validateAsset(item).ok)
  }

  function writeAll(list) {
    storage.set(KEYS.assets, list)
  }

  return {
    getById(id) {
      return readAll().find((item) => item.id === id) || null
    },
    list() {
      return readAll()
    },
    save(asset) {
      const result = validateAsset(asset)
      if (!result.ok) throw new Error(result.errors[0].message)
      const list = readAll().filter((item) => item.id !== asset.id)
      list.unshift(asset)
      writeAll(list)
      return asset
    },
    remove(id) {
      writeAll(readAll().filter((item) => item.id !== id))
    },
  }
}

module.exports = {
  createAssetRepository,
}
