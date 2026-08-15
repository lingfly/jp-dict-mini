/**
 * tabBar 角标文本格式化
 *
 * iOS 真机上 tabBar badge 数字超过 2 位（>= 100）会显示为 "..."，
 * 因此超过 99 时统一显示为 "99+"。
 */
function formatBadgeText(count) {
  const n = Number(count) || 0
  if (n > 99) return '99+'
  return String(n)
}

module.exports = {
  formatBadgeText
}
