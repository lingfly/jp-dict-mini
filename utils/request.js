/**
 * 统一请求层：超时集中管理、错误分类、401 并发治理
 *
 * 规范：#001 接口超时治理
 *   specs/changes/001-api-timeout/spec.md
 *
 * 关键约束（改代码前先看）：
 *   - 超时值只在 TIMEOUTS 里改，页面不传具体数字
 *   - 任何超时都不自动重试；只有 401 换 token 后重试一次
 *   - 失败提示统一走 notifyOnce，页面不要再弹第二个 toast
 *   - 上报的 path 必须去掉 query，避免搜索词/用户 ID 进日志
 */

const config = require('./config')

// 超时值集中管理（毫秒）
const TIMEOUTS = {
  DEFAULT: 60000,
  AI_QUERY: 300000
}

// 慢请求阈值：超过即上报，用于后续判断是否要分级超时
const SLOW_THRESHOLD = 5000

// 轮询类请求失败不弹 toast：由发起方自己决定怎么提示，避免弹到别的页面（AC-16）
const SILENT_PATHS = [/^\/api\/ai-dict\/query-result/]

// 业务码级静默：路径 + code 精确匹配（#003 AC-06）
// 3001 = 单词不存在 / 已移出词单，复习页会静默跳过该卡，再弹 toast 会自相矛盾
const SILENT_BIZ = [{ path: /^\/api\/fsrs\/review$/, codes: [3001] }]

function isSilent(url) {
  const p = toPath(url)
  return SILENT_PATHS.some((re) => re.test(p))
}

function isSilentBiz(url, code) {
  const p = toPath(url)
  const n = Number(code)
  return SILENT_BIZ.some((rule) => rule.path.test(p) && rule.codes.indexOf(n) !== -1)
}

const MESSAGES = {
  TIMEOUT: '请求超时，请重试',
  OFFLINE: '网络不可用，请检查连接',
  SERVER: '服务繁忙，请稍后重试',
  NETWORK: '网络错误，请稍后重试',
  AUTH: '登录已失效，请重新打开小程序'
}

// 用缓存存储 apiBaseUrl 和 token，避免依赖 getApp() 的模块加载时序问题
let _cachedApiBaseUrl = config.apiBaseUrl
let _cachedToken = wx.getStorageSync('token') || null

// toast 去重：1 秒内相同文案只弹一次
let _lastToast = { message: '', at: 0 }

function notifyOnce(message) {
  const title = message || '操作失败'
  const now = Date.now()
  if (title === _lastToast.message && now - _lastToast.at < 1000) return
  _lastToast = { message: title, at: now }
  wx.showToast({ title, icon: 'none', duration: 3000 })
}

/** 去掉 query string（AC-12：日志里不能出现搜索词、用户 ID） */
function toPath(url) {
  const s = String(url || '')
  const i = s.indexOf('?')
  return i >= 0 ? s.slice(0, i) : s
}

/**
 * 结构化上报微信「实时日志」
 * 查看：微信公众平台 → We分析 → 性能质量 → 实时日志
 */
function report(level, kind, url, fields) {
  try {
    if (!wx.getRealtimeLogManager) return
    const log = wx.getRealtimeLogManager()
    if (!log) return

    const parts = [`${kind} path=${toPath(url)}`]
    Object.keys(fields || {}).forEach((key) => {
      const value = fields[key]
      if (value !== undefined && value !== null && value !== '') {
        parts.push(`${key}=${value}`)
      }
    })
    parts.push(`env=${config.envVersion}`)

    const fn = log[level] || log.error
    fn.call(log, parts.join(' '))
  } catch (e) {
    // 日志上报失败不影响主流程
  }
}

function makeRequestError(type, message, extra) {
  const err = new Error(message || MESSAGES[type] || '请求失败')
  err.name = 'RequestError'
  err.type = type
  if (extra) Object.assign(err, extra)
  return err
}

/** 解析本次请求的超时值：显式传入 > AI 查词 > 默认 */
function resolveTimeout(url, explicit) {
  if (explicit) return explicit
  if (/^\/api\/ai-dict\/query(\?|$)/.test(toPath(url))) return TIMEOUTS.AI_QUERY
  return TIMEOUTS.DEFAULT
}

function setApiBaseUrl(url) {
  _cachedApiBaseUrl = url
}

function getAppInstance() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

function getToken() {
  const app = getAppInstance()
  if (app && app.globalData && app.globalData.token) {
    _cachedToken = app.globalData.token
    return app.globalData.token
  }
  if (!_cachedToken) {
    _cachedToken = wx.getStorageSync('token') || null
  }
  return _cachedToken
}

function getApiBaseUrl() {
  const app = getAppInstance()
  if (app && app.globalData && app.globalData.apiBaseUrl) {
    _cachedApiBaseUrl = app.globalData.apiBaseUrl
    return app.globalData.apiBaseUrl
  }
  return _cachedApiBaseUrl
}

/**
 * 401 处理（AC-08 / AC-09 / AC-10 / AC-11）
 *
 * 三条分支：
 *   1. 已经因为 401 重试过一次 → 停止，提示重新打开
 *   2. 本请求携带的 token 与当前 token 不同（别人已刷新）→ 直接用新 token 重试
 *   3. 否则 → 清理登录信息 → 单例重登 → 用原 timeout 重试一次
 */
function handle401(ctx) {
  const { url, method, data, needAuth, limit, retried, sentToken, resolve, reject } = ctx
  const app = getAppInstance()
  const currentToken = getToken()

  // 分支 1：重试后仍是 401
  if (retried) {
    const err = makeRequestError('AUTH', MESSAGES.AUTH, { url: toPath(url), timeout: limit })
    report('error', '[REQ]', url, { type: 'AUTH', detail: 'retry-still-401', timeout: limit })
    notifyOnce(err.message)
    reject(err)
    return
  }

  // 分支 2：token 已被刷新（或正在刷新）
  if (sentToken && sentToken !== currentToken) {
    const wait = currentToken
      ? Promise.resolve()
      : (app && app.autoWechatLogin
        ? app.autoWechatLogin()
        : Promise.reject(new Error('login unavailable')))

    wait
      .then(() => request(url, method, data, needAuth, limit, true))
      .then(resolve)
      .catch(() => {
        const err = makeRequestError('AUTH', MESSAGES.AUTH, { url: toPath(url) })
        reject(err)
      })
    return
  }

  // 分支 3：本次 token 就是当前 token，确实过期了
  _cachedToken = null
  wx.removeStorageSync('token')
  if (app && app.clearLoginInfo) {
    app.clearLoginInfo()
  }

  if (!app || !app.autoWechatLogin) {
    const err = makeRequestError('AUTH', MESSAGES.AUTH, { url: toPath(url) })
    notifyOnce(err.message)
    reject(err)
    return
  }

  app.autoWechatLogin()
    .then(() => {
      // 登录若静默失败，token 仍为空 → 不再重试，直接报错
      if (!getToken()) {
        throw makeRequestError('AUTH', MESSAGES.AUTH, { url: toPath(url) })
      }
      return request(url, method, data, needAuth, limit, true)
    })
    .then(resolve)
    .catch(() => {
      const err = makeRequestError('AUTH', MESSAGES.AUTH, { url: toPath(url), timeout: limit })
      report('error', '[REQ]', url, { type: 'AUTH', detail: 'login-failed', timeout: limit })
      notifyOnce(err.message)
      reject(err)
    })
}

/** 统一处理 success 回调 */
function handleSuccess(res, ctx) {
  const { url, method, data, needAuth, limit, retried, sentToken, resolve, reject, startedAt } = ctx
  const duration = Date.now() - startedAt

  if (res.statusCode === 200) {
    const body = res.data

    if (body && body.code !== undefined && body.code !== 200) {
      // 业务错误：请求层提示一次，页面不要再弹（除非该路径的该业务码约定静默）
      report('warn', '[BIZ]', url, { code: body.code, dur: duration })
      if (!isSilent(url) && !isSilentBiz(url, body.code)) notifyOnce(body.message || '操作失败')
    } else if (duration > SLOW_THRESHOLD) {
      report('warn', '[SLOW]', url, { dur: duration, timeout: limit })
    }

    // 无论业务码如何都返回完整数据，让调用方自行判断（保持旧行为）
    resolve(body)
    return
  }

  if (res.statusCode === 401) {
    handle401({ url, method, data, needAuth, limit, retried, sentToken, resolve, reject })
    return
  }

  if (res.statusCode >= 500) {
    const err = makeRequestError('SERVER', MESSAGES.SERVER, {
      url: toPath(url),
      statusCode: res.statusCode,
      duration,
      timeout: limit
    })
    report('error', '[REQ]', url, { type: 'SERVER', status: res.statusCode, dur: duration, timeout: limit })
    if (!isSilent(url)) notifyOnce(err.message)
    reject(err)
    return
  }

  const message = (res.data && res.data.message) || '请求失败'
  const err = makeRequestError('CLIENT', message, {
    url: toPath(url),
    statusCode: res.statusCode,
    duration,
    timeout: limit
  })
  report('warn', '[REQ]', url, { type: 'CLIENT', status: res.statusCode, dur: duration, timeout: limit })
  if (!isSilent(url)) notifyOnce(message)
  reject(err)
}

/** 统一处理 fail 回调 */
function handleFail(err, ctx) {
  const { url, limit, reject, startedAt } = ctx
  const duration = Date.now() - startedAt
  const msg = (err && err.errMsg) || ''

  let type = 'NETWORK'
  if (/timeout/i.test(msg)) {
    type = 'TIMEOUT'
  } else if (/ERR_INTERNET|network|offline|disconnected/i.test(msg)) {
    type = 'OFFLINE'
  }

  const requestError = makeRequestError(type, MESSAGES[type], {
    url: toPath(url),
    duration,
    timeout: limit,
    errMsg: msg
  })

  report('error', '[REQ]', url, { type, dur: duration, timeout: limit, detail: msg })
  if (!isSilent(url)) notifyOnce(requestError.message)
  reject(requestError)
}

/**
 * 发送请求
 * @param {String} url 请求路径
 * @param {String} method 方法
 * @param {Object} data 数据
 * @param {Boolean} needAuth 是否需要 token
 * @param {Number} timeout 超时（不传则按 TIMEOUTS 规则）
 * @param {Boolean} retried 是否已因 401 重试过（内部使用）
 */
function request(url, method = 'GET', data = {}, needAuth = true, timeout, retried = false) {
  const limit = resolveTimeout(url, timeout)
  const sentToken = needAuth ? getToken() : null
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    if (needAuth && sentToken) {
      header['Authorization'] = `Bearer ${sentToken}`
    }

    wx.request({
      url: `${getApiBaseUrl()}${url}`,
      method,
      data,
      header,
      timeout: limit,
      success: (res) => handleSuccess(res, { url, method, data, needAuth, limit, retried, sentToken, resolve, reject, startedAt }),
      fail: (err) => handleFail(err, { url, limit, reject, startedAt })
    })
  })
}

/** GET：参数拼到 URL */
function get(url, data = {}, needAuth = true, timeout) {
  const params = Object.keys(data)
    .filter((key) => data[key] !== undefined && data[key] !== null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&')

  const fullUrl = params ? `${url}?${params}` : url
  return request(fullUrl, 'GET', {}, needAuth, timeout)
}

function post(url, data = {}, needAuth = true, timeout) {
  return request(url, 'POST', data, needAuth, timeout)
}

function put(url, data = {}, needAuth = true, timeout) {
  return request(url, 'PUT', data, needAuth, timeout)
}

/** 表单提交（application/x-www-form-urlencoded） */
function formPost(url, data = {}, needAuth = true, timeout) {
  const limit = resolveTimeout(url, timeout)
  const sentToken = needAuth ? getToken() : null
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (needAuth && sentToken) {
      header['Authorization'] = `Bearer ${sentToken}`
    }

    const formData = Object.keys(data)
      .filter((key) => data[key] !== undefined && data[key] !== null)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
      .join('&')

    wx.request({
      url: `${getApiBaseUrl()}${url}`,
      method: 'POST',
      data: formData,
      header,
      timeout: limit,
      success: (res) => handleSuccess(res, { url, method: 'POST', data, needAuth, limit, retried: false, sentToken, resolve, reject, startedAt }),
      fail: (err) => handleFail(err, { url, limit, reject, startedAt })
    })
  })
}

module.exports = {
  request,
  get,
  post,
  formPost,
  put,
  setApiBaseUrl,
  TIMEOUTS
}
