// 悬浮按钮长按拖动（通用工具）
// 用于「新建词单」「新建分组」等右下角悬浮按钮：长按后可拖动位置，松手保存，避免遮挡内容。

const LONG_PRESS_MS = 300 // 长按判定阈值（毫秒）
const MOVE_TOLERANCE = 10 // 判定为"移动"的最小位移，超过则取消长按
const MARGIN_RIGHT = 24   // 距右边缘

/**
 * 创建悬浮按钮拖动控制器
 * @param {Object} page 页面实例
 * @param {String} storageKey 位置持久化 key（每个按钮独立）
 * @param {Object} btnSize 按钮近似尺寸 { w, h }，用于默认位置与边界约束
 * @param {Number} marginBottom 按钮底部距视口底部的留白（px，默认 24）
 *   - tabBar 页面：视口底部即 tabBar 顶部，按钮最多下移到 tabBar 上方留白处
 *   - 普通页面：视口底部即屏幕底部
 * @returns {{ touchStart, touchMove, touchEnd }}
 */
function createFabDrag(page, storageKey, btnSize, marginBottom) {
  const marginBottomVal = typeof marginBottom === 'number' ? marginBottom : 24
  let timer = null
  let dragging = false
  let moved = false
  let startX = 0
  let startY = 0
  let grabDX = 0
  let grabDY = 0
  let viewH = 0   // 精确视口高度（selectViewport，不含 tabBar）
  let fallbackH = 0 // 兜底视口高度（windowHeight - tabBar 估计）

  function winInfo() {
    return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  }

  /** 视口高度：优先精确测量值，否则兜底（windowHeight - tabBar 估计） */
  function viewportHeight() {
    if (viewH > 0) return viewH
    if (fallbackH > 0) return fallbackH
    const i = winInfo()
    // 兜底：windowHeight 含 tabBar，减去 tabBar 估计高度（约 50px）
    fallbackH = (i.windowHeight || 0) - 50
    return fallbackH
  }

  /** 异步精确测量视口高度（selectViewport 返回不含 tabBar 的可视区域） */
  function measureViewport() {
    try {
      wx.createSelectorQuery()
        .selectViewport()
        .boundingClientRect((rect) => {
          if (rect && (rect.height || rect.bottom)) {
            const h = rect.height || rect.bottom
            if (h > 0 && h !== viewH) {
              viewH = h
              clampPosition()
            }
          }
        })
        .exec()
    } catch (e) {
      // ignore
    }
  }

  /** 把按钮位置校正到视口边界内（视口高度变化后调用） */
  function clampPosition() {
    const p = page.data
    if (p.fabLeft === null || p.fabTop === null) return
    const i = winInfo()
    let left = p.fabLeft
    let top = p.fabTop
    if (left < 0) left = 0
    if (top < 0) top = 0
    const maxLeft = i.windowWidth - btnSize.w
    if (left > maxLeft) left = maxLeft
    const maxTop = viewportHeight() - marginBottomVal - btnSize.h
    if (top > maxTop) top = maxTop
    if (left !== p.fabLeft || top !== p.fabTop) {
      page.setData({ fabLeft: left, fabTop: top })
    }
  }

  /** 计算默认位置（右下角，距视口底部 marginBottomVal） */
  function defaultPos() {
    const i = winInfo()
    const h = viewportHeight()
    return {
      left: i.windowWidth - MARGIN_RIGHT - btnSize.w,
      top: h - marginBottomVal - btnSize.h
    }
  }

  /** 初始化位置：优先读本地保存，否则用默认右下角 */
  function ensureInit() {
    if (page.data.fabLeft !== null) return
    let pos = wx.getStorageSync(storageKey)
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') {
      pos = defaultPos()
    }
    page.setData({ fabLeft: pos.left, fabTop: pos.top })
    clampPosition()
  }

  function touchStart(e) {
    ensureInit()
    measureViewport() // 刷新视口高度（屏幕旋转/键盘弹出后可能变化）
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    grabDX = t.clientX - page.data.fabLeft
    grabDY = t.clientY - page.data.fabTop
    moved = false
    dragging = false
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!moved) {
        dragging = true
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
      }
    }, LONG_PRESS_MS)
  }

  function touchMove(e) {
    if (!dragging) {
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) {
        moved = true
        clearTimeout(timer)
      }
      return
    }
    const i = winInfo()
    const t = e.touches[0]
    let left = t.clientX - grabDX
    let top = t.clientY - grabDY
    if (left < 0) left = 0
    if (top < 0) top = 0
    if (left > i.windowWidth - btnSize.w) left = i.windowWidth - btnSize.w
    const bottomLimit = viewportHeight() - marginBottomVal - btnSize.h
    if (top > bottomLimit) top = bottomLimit
    page.setData({ fabLeft: left, fabTop: top })
  }

  function touchEnd() {
    clearTimeout(timer)
    if (dragging) {
      dragging = false
      wx.setStorageSync(storageKey, { left: page.data.fabLeft, top: page.data.fabTop })
    }
  }

  ensureInit()
  measureViewport()

  return { touchStart, touchMove, touchEnd }
}

module.exports = { createFabDrag }
