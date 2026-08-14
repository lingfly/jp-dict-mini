// app.js
App({
  globalData: {
    token: null,
    userInfo: null,
    apiBaseUrl: 'https://jp-cika.cn' // API 基础地址
  },

  onLaunch() {
    console.log('小程序启动')

    // 尝试从缓存恢复登录状态
    this.restoreLoginState()

    // 如果没有登录，自动执行微信登录
    if (!this.isLoggedIn()) {
      this.autoWechatLogin()
    } else {
      // 已登录，更新 tabBar 复习角标
      this.updateReviewBadge()
    }
  },

  /**
   * 更新复习 tabBar 角标（显示今日需复习词数）
   */
  async updateReviewBadge() {
    try {
      const dataSource = require('./utils/fsrs/dataSource')
      const res = await dataSource.getLearningStatus()
      if (res.code === 200 && res.data.dueCount > 0) {
        wx.setTabBarBadge({
          index: 2,
          text: String(res.data.dueCount)
        })
      } else {
        wx.removeTabBarBadge({ index: 2 })
      }
    } catch (error) {
      console.error('更新复习角标失败:', error)
    }
  },

  /**
   * 自动微信登录（静默登录）
   */
  async autoWechatLogin() {
    try {
      console.log('开始自动登录...')

      // 1. 获取微信登录 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        })
      })

      if (!loginRes.code) {
        console.error('获取微信 code 失败')
        return
      }

      console.log('获取微信 code 成功:', loginRes.code)

      // 2. 调用后端接口换取 token（不需要用户信息）
      const { authApi } = require('./utils/api')
      const res = await authApi.loginByWechat({
        code: loginRes.code
      })

      if (res.code === 200) {
        // 保存登录信息
        this.saveLoginInfo(res.data.token, res.data.userInfo)
        console.log('自动登录成功')

        // 更新复习角标
        this.updateReviewBadge()

        // 通知页面刷新
        if (this.loginSuccessCallback) {
          this.loginSuccessCallback()
        }
      } else {
        console.error('自动登录失败:', res.message)
      }
    } catch (error) {
      console.error('自动登录失败:', error)
    }
  },

  /**
   * 恢复登录状态
   */
  restoreLoginState() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')

    if (token && userInfo) {
      this.globalData.token = token
      this.globalData.userInfo = userInfo
      console.log('登录状态已恢复')
      return true
    }
    return false
  },

  /**
   * 保存登录信息
   */
  saveLoginInfo(token, userInfo) {
    this.globalData.token = token
    this.globalData.userInfo = userInfo

    wx.setStorageSync('token', token)
    wx.setStorageSync('userInfo', userInfo)
    console.log('登录信息已保存')
  },

  /**
   * 清除登录信息
   */
  clearLoginInfo() {
    this.globalData.token = null
    this.globalData.userInfo = null

    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    console.log('登录信息已清除')
  },

  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return !!this.globalData.token
  },

  /**
   * 设置登录成功回调
   */
  setLoginSuccessCallback(callback) {
    this.loginSuccessCallback = callback
  }
})
