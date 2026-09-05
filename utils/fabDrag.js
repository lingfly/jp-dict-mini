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
 * @param {Number} marginBottom 距底部留白（tabBar 页面需补偿导航栏高度，如 96；普通页面可用 24）
 * @returns {{ touchStart, touchMove, touchEnd }}
 */
function createFabDrag(page, storageKey, btnSize, marginBottom) {
  const marginBottomVal = typeof marginBottom === 'number' ? marginBottom : 96
  let timer = null
  let dragging = false
  let moved = false
  let startX = 0
  let startY = 0
  let grabDX = 0 // 手指相对按钮左边界的偏移
  let grabDY = 0 // 手指相对按钮上边界的偏移

  function winInfo() {
    return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  }

  /** 计算默认位置（右下角，避开底部导航栏） */
  function defaultPos() {
    const i = winInfo()
    return {
      left: i.windowWidth - MARGIN_RIGHT - btnSize.w,
      top: i.windowHeight - marginBottomVal - btnSize.h
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
  }

  function touchStart(e) {
    ensureInit()
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
      // 未进入拖动态：位移超过容忍度则取消长按
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
    if (top > i.windowHeight - marginBottomVal - btnSize.h) top = i.windowHeight - marginBottomVal - btnSize.h
    page.setData({ fabLeft: left, fabTop: top })
  }

  function touchEnd() {
    clearTimeout(timer)
    if (dragging) {
      dragging = false
      wx.setStorageSync(storageKey, { left: page.data.fabLeft, top: page.data.fabTop })
    }
  }

  // 创建时立即初始化位置，避免按钮渲染在错误位置
  ensureInit()

  return { touchStart, touchMove, touchEnd }
}

module.exports = { createFabDrag }
