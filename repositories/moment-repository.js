const { validateMoment } = require('../domain/moment/index.js')
const { KEYS } = require('./keys')

function createMomentRepository(storage) {
  function readAll() {
    const raw = storage.get(KEYS.moments, [])
    if (!Array.isArray(raw)) return []
    const valid = []
    raw.forEach((item) => {
      const result = validateMoment(item)
      if (result.ok) valid.push(item)
    })
    return valid
  }

  function writeAll(list) {
    storage.set(KEYS.moments, list)
  }

  return {
    getById(id) {
      return readAll().find((item) => item.id === id) || null
    },
    list() {
      return readAll()
    },
    save(moment) {
      const result = validateMoment(moment)
      if (!result.ok) {
        throw new Error(result.errors[0].message)
      }
      const list = readAll().filter((item) => item.id !== moment.id)
      list.unshift(moment)
      writeAll(list)
      return moment
    },
    remove(id) {
      writeAll(readAll().filter((item) => item.id !== id))
    },
    replaceAll(moments) {
      const valid = []
      ;(moments || []).forEach((item) => {
        const result = validateMoment(item)
        if (result.ok) valid.push(item)
      })
      writeAll(valid)
      return valid
    },
  }
}

module.exports = {
  createMomentRepository,
}
