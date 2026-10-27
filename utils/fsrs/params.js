/**
 * FSRS 用户参数（#004）
 *
 * 真值在服务端 learning-config：
 * - GET 返回 fsrsRequestRetention / fsrsMaximumInterval（v3 起始终为 number，非 null）
 * - PUT /api/user/learning-config/fsrs-config 为部分更新（传几项改几项）
 *
 * 本模块负责：默认值、档位白名单、本机缓存（仅请求失败时兜底）、服务端字段映射。
 * 默认值必须与后端列默认值同值（0.900 / 36500），改一处必须同时改两处。
 */

const STORAGE_KEY = 'fsrsUserParams'

const DEFAULTS = Object.freeze({
  requestRetention: 0.9,
  maximumInterval: 36500
})

const RETENTION_VALUES = Object.freeze([0.8, 0.85, 0.9, 0.95])
const RETENTION_LABELS = Object.freeze([
  '80%（轻松）',
  '85%（较轻松）',
  '90%（标准）',
  '95%（牢固）'
])

const INTERVAL_VALUES = Object.freeze([30, 90, 180, 365, 730, 36500])
const INTERVAL_LABELS = Object.freeze([
  '30 天',
  '90 天',
  '180 天',
  '365 天',
  '730 天（两年）',
  '不限'
])

// 本次运行内的生效参数；null 表示尚未初始化
let _current = null

function normalizeRetention(value) {
  return RETENTION_VALUES.indexOf(value) >= 0 ? value : DEFAULTS.requestRetention
}

function normalizeInterval(value) {
  return INTERVAL_VALUES.indexOf(value) >= 0 ? value : DEFAULTS.maximumInterval
}

/** 逐项白名单校验；非法项回落默认，不抛错（避免 FSRSValidationError 让复习页打不开） */
function sanitize(raw) {
  const src = raw || {}
  return {
    requestRetention: normalizeRetention(src.requestRetention),
    maximumInterval: normalizeInterval(src.maximumInterval)
  }
}

function readCache() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY)
    if (!saved || typeof saved !== 'object') return null
    return sanitize(saved)
  } catch (e) {
    // 缓存不可读不影响可用性：默认值本身就是合法参数
    console.error('[fsrsParams] 读取缓存失败，使用默认值:', e)
    return null
  }
}

function writeCache(params) {
  try {
    wx.setStorageSync(STORAGE_KEY, params)
  } catch (e) {
    // 缓存只是兜底手段：写失败不阻断保存流程，下次启动会重新从服务端取
    console.error('[fsrsParams] 写入缓存失败:', e)
  }
}

/** 当前生效参数（缓存 → 默认值） */
function getCurrent() {
  if (!_current) {
    _current = readCache() || Object.assign({}, DEFAULTS)
  }
  return Object.assign({}, _current)
}

/** 设置页保存成功后写入内存 + 缓存 */
function applyLocal(raw) {
  _current = sanitize(raw)
  writeCache(_current)
  return Object.assign({}, _current)
}

/**
 * 服务端 learning-config → 本模块参数
 * 字段缺失 / null / 越界都按字段回落默认（AC-13）
 */
function applyServerConfig(configData) {
  const data = configData || {}
  return applyLocal({
    requestRetention: data.fsrsRequestRetention,
    maximumInterval: data.fsrsMaximumInterval
  })
}

function getRetentionOptions() {
  return RETENTION_VALUES.map((value, index) => ({
    value,
    label: RETENTION_LABELS[index]
  }))
}

function getIntervalOptions() {
  return INTERVAL_VALUES.map((value, index) => ({
    value,
    label: INTERVAL_LABELS[index]
  }))
}

function indexOfRetention(value) {
  const index = RETENTION_VALUES.indexOf(value)
  return index >= 0 ? index : RETENTION_VALUES.indexOf(DEFAULTS.requestRetention)
}

function indexOfInterval(value) {
  const index = INTERVAL_VALUES.indexOf(value)
  return index >= 0 ? index : INTERVAL_VALUES.indexOf(DEFAULTS.maximumInterval)
}

module.exports = {
  STORAGE_KEY,
  DEFAULTS,
  RETENTION_VALUES,
  RETENTION_LABELS,
  INTERVAL_VALUES,
  INTERVAL_LABELS,
  getCurrent,
  applyLocal,
  applyServerConfig,
  getRetentionOptions,
  getIntervalOptions,
  indexOfRetention,
  indexOfInterval
}
