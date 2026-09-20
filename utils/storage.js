/**
 * 会话与 UI 状态。Moment 持久化不走这里。
 */
const { keys } = require('./constants')

function readJSON(key, fallback) {
  try {
    const value = wx.getStorageSync(key)
    return value === '' || value === undefined || value === null ? fallback : value
  } catch (error) {
    return fallback
  }
}

function hasIncomingLight() {
  return !!readJSON(keys.incoming, false)
}

function setIncomingLight(visible) {
  wx.setStorageSync(keys.incoming, !!visible)
}

function hasShownSplash() {
  return !!wx.getStorageSync(keys.splashShown)
}

function markSplashShown() {
  wx.setStorageSync(keys.splashShown, true)
}

module.exports = {
  hasIncomingLight,
  setIncomingLight,
  hasShownSplash,
  markSplashShown,
}
