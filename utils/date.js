/**
 * 首页日期文案。天气先本地占位。
 */
function formatHomeDate(now) {
  const date = now instanceof Date ? now : new Date()
  return `${date.getMonth() + 1}月${date.getDate()}日 · 晴`
}

module.exports = {
  formatHomeDate,
}
