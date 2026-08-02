// pages/login/login.js
const app = getApp()
const { authApi } = require('../../utils/api')

Page({
  data: {
    loading: false
  },

  onLoad() {
    // 检查是否已登录
    if (app.isLoggedIn()) {
      this.redirectToHome()
    }
  },

  /**
   * 微信一键登录
   */
  async handleWechatLogin() {
    try {
      this.setData({ loading: true })

      // 1. 获取用户授权信息
      const userProfile = await this.getUserProfile()
      if (!userProfile) {
        this.setData({ loading: false })
        return
      }

      // 2. 获取微信登录 code
      const loginRes = await this.wxLogin()
      if (!loginRes.code) {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        })
        this.setData({ loading: false })
        return
      }

      // 3. 调用后端接口换取 token
      const res = await authApi.loginByWechat({
        code: loginRes.code,
        nickname: userProfile.nickName,
        avatarUrl: userProfile.avatarUrl
      })

      if (res.code === 200) {
        // 保存登录信息
        app.saveLoginInfo(res.data.token, res.data.userInfo)

        // 显示欢迎信息
        if (res.data.isNewUser) {
          wx.showToast({
            title: '注册成功',
            icon: 'success'
          })
        } else {
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
        }

        // 延迟跳转
        setTimeout(() => {
          this.redirectToHome()
        }, 1000)
      } else {
        wx.showToast({
          title: res.message || '登录失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('微信登录失败:', error)
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 获取用户信息
   */
  getUserProfile() {
    return new Promise((resolve) => {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          console.log('获取用户信息成功:', res.userInfo)
          resolve(res.userInfo)
        },
        fail: (err) => {
          console.error('获取用户信息失败:', err)
          wx.showToast({
            title: '需要授权才能登录',
            icon: 'none'
          })
          resolve(null)
        }
      })
    })
  },

  /**
   * 微信登录获取 code
   */
  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      })
    })
  },

  /**
   * 跳转到首页
   */
  redirectToHome() {
    wx.switchTab({
      url: '/pages/home/home'
    })
  },

  /**
   * 跳过登录（游客模式）
   */
  skipLogin() {
    wx.showModal({
      title: '提示',
      content: '游客模式下无法保存学习进度，确定要继续吗？',
      success: (res) => {
        if (res.confirm) {
          this.redirectToHome()
        }
      }
    })
  }
})
