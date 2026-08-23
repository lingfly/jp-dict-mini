/**
 * tabBar 角标文本格式化
 *
 * iOS 真机上 tabBar badge 超过 2 位（>= 100）数字会因渲染宽度超限被截断显示为 "..."，
 * 因此 iOS 上超过 99 时显示 "99+"（窄字符 '+' 占宽小，能正常显示）；
 * Android / 开发者工具无此限制，直接返回真实数字。
 */
function formatBadgeText(count) {
  const n = Number(count) || 0
  if (n > 99 && isIOS()) return '99+'
  return String(n)
}

/**
 * 判断当前是否为 iOS 平台（开发者工具返回 devtools，按非 iOS 处理，显示真实数字）
 */
function isIOS() {
  try {
    return wx.getSystemInfoSync().platform === 'ios'
  } catch (e) {
    return false
  }
}

module.exports = {
  formatBadgeText
}
