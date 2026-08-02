/**
 * 封装 wx.request，支持 token 认证
 */
const app = getApp()

/**
 * 发送请求
 * @param {String} url - 请求路径
 * @param {String} method - 请求方法
 * @param {Object} data - 请求数据
 * @param {Boolean} needAuth - 是否需要认证（默认 true）
 * @returns {Promise}
 */
function request(url, method = 'GET', data = {}, needAuth = true) {
  return new Promise((resolve, reject) => {
    const header = {
      'Content-Type': 'application/json'
    }

    // 添加 Authorization token
    if (needAuth && app.globalData.token) {
      header['Authorization'] = `Bearer ${app.globalData.token}`
      console.log('请求携带 token:', url)
    }

    wx.request({
      url: `${app.globalData.apiBaseUrl}${url}`,
      method: method,
      data: data,
      header: header,
      success: (res) => {
        console.log('请求成功:', url, res.statusCode)

        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // token 失效，清除登录信息并重新登录
          console.log('token 已失效，重新登录')
          app.clearLoginInfo()

          wx.showToast({
            title: '登录已过期，正在重新登录',
            icon: 'none',
            duration: 2000
          })

          // 自动重新登录
          app.autoWechatLogin().then(() => {
            // 登录成功后，重新发起原请求
            console.log('重新登录成功，重试请求')
            request(url, method, data, needAuth).then(resolve).catch(reject)
          }).catch(() => {
            reject(new Error('重新登录失败'))
          })
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
 */
function post(url, data = {}, needAuth = true) {
  return request(url, 'POST', data, needAuth)
}

module.exports = {
  request,
  get,
  post
}
