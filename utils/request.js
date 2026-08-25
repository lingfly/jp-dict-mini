/**
 * 封装 wx.request，支持 token 认证
 */

// 用缓存存储 apiBaseUrl 和 token，避免依赖 getApp() 的模块加载时序问题
const config = require('./config')
let _cachedApiBaseUrl = config.apiBaseUrl
let _cachedToken = wx.getStorageSync('token') || null

/**
 * 设置基础 URL
 */
function setApiBaseUrl(url) {
  _cachedApiBaseUrl = url
}

/**
 * 获取 App 实例（懒加载）
 */
function getAppInstance() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

/**
 * 获取 token（优先从 app.globalData，fallback 到 storage 缓存）
 */
function getToken() {
  const app = getAppInstance()
  if (app && app.globalData && app.globalData.token) {
    _cachedToken = app.globalData.token
    return app.globalData.token
  }
  // fallback：从本地缓存读取（handle app.js require 时序问题）
  if (!_cachedToken) {
    _cachedToken = wx.getStorageSync('token') || null
  }
  return _cachedToken
}

/**
 * 获取 API 基础 URL（优先从 app.globalData，fallback 到缓存）
 */
function getApiBaseUrl() {
  const app = getAppInstance()
  if (app && app.globalData && app.globalData.apiBaseUrl) {
    _cachedApiBaseUrl = app.globalData.apiBaseUrl
    return app.globalData.apiBaseUrl
  }
  return _cachedApiBaseUrl
}

/**
 * 发送请求
 * @param {String} url - 请求路径
 * @param {String} method - 请求方法
 * @param {Object} data - 请求数据
 * @param {Boolean} needAuth - 是否需要认证（默认 true）
 * @param {Number} timeout - 超时时间（毫秒，默认 60000）
 * @returns {Promise}
 */
function request(url, method = 'GET', data = {}, needAuth = true, timeout = 60000) {
  const app = getAppInstance()

  return new Promise((resolve, reject) => {
    const header = {
      'Content-Type': 'application/json'
    }

    // 添加 Authorization token
    const token = getToken()
    if (needAuth && token) {
      header['Authorization'] = `Bearer ${token}`
    }

    const baseUrl = getApiBaseUrl()

    wx.request({
      url: `${baseUrl}${url}`,
      method: method,
      data: data,
      header: header,
      timeout: timeout,
      success: (res) => {
        if (res.statusCode === 200) {
          // 检查业务状态码
          if (res.data && res.data.code !== undefined && res.data.code !== 200) {
            // 业务错误，显示后端返回的错误信息
            wx.showToast({
              title: res.data.message || '操作失败',
              icon: 'none'
            })
          }
          // 无论业务状态码是什么，都返回完整数据，让调用方自行判断
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // token 失效，清除登录信息并尝试重新登录
          console.log('token 已失效，重新登录')

          // 清除缓存的 token
          _cachedToken = null
          wx.removeStorageSync('token')

          if (app && app.clearLoginInfo) {
            app.clearLoginInfo()
          }

          // 自动重新登录（仅在 app 可用时），无感登录，不提示用户
          if (app && app.autoWechatLogin) {
            app.autoWechatLogin().then(() => {
              console.log('重新登录成功，重试请求')
              request(url, method, data, needAuth).then(resolve).catch(reject)
            }).catch(() => {
              reject(new Error('重新登录失败'))
            })
          } else {
            // app 不可用，直接返回错误让调用方处理
            reject(new Error('登录已过期，请重新打开小程序'))
          }
        } else {
          wx.showToast({
            title: res.data.message || '请求失败',
            icon: 'none'
          })
          reject(res)
        }
      },
      fail: (err) => {
        console.error('请求失败:', url, err)
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        })
        reject(err)
      }
    })
  })
}

/**
 * GET 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求参数
 * @param {Boolean} needAuth - 是否需要认证（默认 true）
 */
function get(url, data = {}, needAuth = true) {
  // GET 请求将参数拼接到 URL
  const params = Object.keys(data)
    .filter(key => data[key] !== undefined && data[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&')

  const fullUrl = params ? `${url}?${params}` : url
  return request(fullUrl, 'GET', {}, needAuth)
}

/**
 * POST 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求数据
 * @param {Boolean} needAuth - 是否需要认证（默认 true）
 * @param {Number} timeout - 超时时间（毫秒，默认 60000）
 */
function post(url, data = {}, needAuth = true, timeout = 60000) {
  return request(url, 'POST', data, needAuth, timeout)
}

/**
 * POST 表单请求（multipart/form-data）
 * @param {String} url - 请求路径
 * @param {Object} data - 表单数据
 * @param {Boolean} needAuth - 是否需要认证（默认 true）
 */
function formPost(url, data = {}, needAuth = true) {
  const app = getAppInstance()

  return new Promise((resolve, reject) => {
    const header = {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
    const token = getToken()
    if (needAuth && token) {
      header['Authorization'] = `Bearer ${token}`
    }

    // 将对象转为 URL 编码的 form data 字符串
    const formData = Object.keys(data)
      .filter(key => data[key] !== undefined && data[key] !== null)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
      .join('&')

    const baseUrl = getApiBaseUrl()

    wx.request({
      url: `${baseUrl}${url}`,
      method: 'POST',
      data: formData,
      header: header,
      success: (res) => {
        if (res.statusCode === 200) {
          // 检查业务状态码
          if (res.data && res.data.code !== undefined && res.data.code !== 200) {
            // 业务错误，显示后端返回的错误信息
            wx.showToast({
              title: res.data.message || '操作失败',
              icon: 'none'
            })
          }
          // 无论业务状态码是什么，都返回完整数据，让调用方自行判断
          resolve(res.data)
        } else if (res.statusCode === 401) {
          _cachedToken = null
          wx.removeStorageSync('token')
          if (app && app.clearLoginInfo) {
            app.clearLoginInfo()
          }
          if (app && app.autoWechatLogin) {
            app.autoWechatLogin().then(() => {
              formPost(url, data, needAuth).then(resolve).catch(reject)
            }).catch(() => {
              reject(new Error('重新登录失败'))
            })
          } else {
            reject(new Error('登录已过期，请重新打开小程序'))
          }
        } else {
          wx.showToast({
            title: res.data.message || '请求失败',
            icon: 'none'
          })
          reject(res)
        }
      },
      fail: (err) => {
        console.error('请求失败:', url, err)
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        })
        reject(err)
      }
    })
  })
}

/**
 * PUT 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求数据
 * @param {Boolean} needAuth - 是否需要认证（默认 true）
 */
function put(url, data = {}, needAuth = true) {
  return request(url, 'PUT', data, needAuth)
}

module.exports = {
  request,
  get,
  post,
  formPost,
  put,
  setApiBaseUrl
}
