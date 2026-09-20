/**
 * 存储适配器。wx 调用只允许出现在这里。
 */

function createMemoryStorage(initial) {
  const data = Object.assign({}, initial || {})
  return {
    get(key, fallback) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback
    },
    set(key, value) {
      data[key] = value
    },
    remove(key) {
      delete data[key]
    },
    snapshot() {
      return Object.assign({}, data)
    },
  }
}

function createWxStorage(wxLike) {
  const api = wxLike || (typeof wx !== 'undefined' ? wx : null)
  if (!api) {
    throw new Error('wx storage API is not available')
  }
  return {
    get(key, fallback) {
      try {
        const value = api.getStorageSync(key)
        return value === '' || value === undefined || value === null ? fallback : value
      } catch (error) {
        return fallback
      }
    },
    set(key, value) {
      api.setStorageSync(key, value)
    },
    remove(key) {
      api.removeStorageSync(key)
    },
  }
}

module.exports = {
  createMemoryStorage,
  createWxStorage,
}
