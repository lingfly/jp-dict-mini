/**
 * 复习响应计时器（#003）
 *
 * 只统计"卡片在屏幕上、用户在看"的时长：
 * - 页面不可见（切 tab、进入其他页面、小程序退到后台、锁屏）时暂停
 * - 重新可见时恢复，离开期间不计入响应时间
 * - 结果截断到 [0, MAX_RESPONSE_TIME_MS]
 *
 * 口径依据：
 * - Anki 手册：计时区间是"题目出现 → 按评分键"，且作答时长不参与 FSRS 调度
 * - 看答案属于同一次作答，不单独扣除（AC-05），只受上限约束
 *
 * 页面不可见也可以安全 start：此时把"当前时刻"记为隐藏起点，
 * resume 时整段扣除，避免把后台加载新卡的时间算进去。
 */
const MAX_RESPONSE_TIME_MS = 60000

/** 取时间戳：显式传入 0 也视为有效值（便于测试注入） */
function toTs(now) {
  return typeof now === 'number' ? now : Date.now()
}

/** 截断到 [0, MAX_RESPONSE_TIME_MS]，非数字按 0 处理 */
function clamp(ms) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return 0
  if (ms > MAX_RESPONSE_TIME_MS) return MAX_RESPONSE_TIME_MS
  return ms
}

/**
 * 创建计时器实例（挂在页面实例上，不进 data，避免无意义的 setData）
 * @returns {{ start: Function, pause: Function, resume: Function, elapsed: Function }}
 */
function createReviewTimer() {
  let startedAt = null // 本张卡计时起点；null 表示尚未开始
  let hiddenAt = null // 进入不可见的时刻；null 表示当前可见
  let hiddenMs = 0 // 本张卡累计不可见时长
  let visible = true

  return {
    /**
     * 开始统计一张新卡
     * @param {Number} [now] 毫秒时间戳，便于测试注入
     */
    start(now) {
      const ts = toTs(now)
      startedAt = ts
      hiddenMs = 0
      hiddenAt = visible ? null : ts
    },

    /**
     * 页面变为不可见（onHide）
     * @param {Number} [now]
     */
    pause(now) {
      if (!visible) return
      visible = false
      hiddenAt = toTs(now)
    },

    /**
     * 页面重新可见（onShow）
     * @param {Number} [now]
     */
    resume(now) {
      if (visible) return
      visible = true
      if (hiddenAt !== null) {
        hiddenMs += toTs(now) - hiddenAt
        hiddenAt = null
      }
    },

    /**
     * 当前卡的响应时长（已扣除不可见时长并截断）
     * @param {Number} [now]
     * @returns {Number} 0 ~ MAX_RESPONSE_TIME_MS
     */
    elapsed(now) {
      if (startedAt === null) return 0
      const ts = toTs(now)
      // 页面仍不可见时取用：把"此刻到隐藏起点"也算进扣除，避免多算
      const hidden = hiddenMs + (hiddenAt !== null ? ts - hiddenAt : 0)
      return clamp(ts - startedAt - hidden)
    }
  }
}

module.exports = {
  createReviewTimer,
  MAX_RESPONSE_TIME_MS
}
