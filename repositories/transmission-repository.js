const { KEYS } = require('./keys')

function createTransmissionRepository(storage) {
  function readAll() {
    const raw = storage.get(KEYS.transmissions, [])
    return Array.isArray(raw) ? raw.filter((item) => item && item.id) : []
  }

  function writeAll(list) {
    storage.set(KEYS.transmissions, list)
  }

  return {
    getById(id) {
      return readAll().find((item) => item.id === id) || null
    },
    list() {
      return readAll()
    },
    save(transmission) {
      const list = readAll().filter((item) => item.id !== transmission.id)
      list.unshift(transmission)
      writeAll(list)
      return transmission
    },
  }
}

module.exports = {
  createTransmissionRepository,
}
