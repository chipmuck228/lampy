/**
 * Lampy 小程序入口：启动时迁移旧 light，再进入页面。
 * catalog 延迟加载，避免模块失败时 App 无法注册导致白屏。
 */
App({
  onLaunch() {
    try {
      const { bootstrapCatalog } = require('./services/catalog.js')
      bootstrapCatalog()
    } catch (error) {
      console.error('[lampy] bootstrap failed', error)
    }
  },
})
