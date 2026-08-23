// pages/profile/profile.js
const app = getApp()
const { authApi, reviewApi } = require('../../utils/api')

Page({
  data: {
    isLoggedIn: false,
    isAdmin: false,
    userInfo: null,
    learningStats: {
      learnedWords: 0,
      masteredWords: 0,
      dailyNewWords: 0
    },
    loading: true
  },

  onLoad() {
    // 设置登录成功回调
    app.setLoginSuccessCallback(() => {
      this.loadData()
    })
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    // 等待登录完成
    if (!app.isLoggedIn()) {
      // 等待自动登录完成
      setTimeout(() => {
        this.loadData()
      }, 500)
      return
    }

    const isLoggedIn = app.isLoggedIn()
    this.setData({ isLoggedIn, loading: false })

    if (isLoggedIn) {
      await this.loadUserInfo()
      await this.loadLearningStats()
    }
  },

  async loadUserInfo() {
    try {
      const res = await authApi.getCurrentUser()
      if (res.code === 200) {
        const isAdmin = res.data.userType === 1
        this.setData({ userInfo: res.data, isAdmin })
        app.globalData.userInfo = res.data
        wx.setStorageSync('userInfo', res.data)
      }
    } catch (error) {
      console.error('加载用户信息失败:', error)
    }
  },

  async loadLearningStats() {
    try {
      const res = await reviewApi.getLearningStatus()
      if (res.code === 200) {
        this.setData({
          learningStats: {
            learnedWords: res.data.learnedCount || 0,
            masteredWords: res.data.masteredCount || 0,
            dailyNewWords: res.data.dailyNewWords || 0
          }
        })
      }
    } catch (error) {
      console.error('加载学习统计失败:', error)
    }
  },

  goToSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    })
  },

  goToReviewForecast() {
    wx.navigateTo({
      url: '/pages/review-forecast/review-forecast'
    })
  },

  goToNewWordAudit() {
    wx.navigateTo({
      url: '/pages/new-word-audit/new-word-audit'
    })
  },

  goToCorrectionAudit() {
    wx.navigateTo({
      url: '/pages/correction-audit/correction-audit'
    })
  },

  goToDefinitionCorrectionAudit() {
    wx.navigateTo({
      url: '/pages/correction-definition-audit/correction-definition-audit'
    })
  },

  goToFeedback() {
    wx.navigateTo({
      url: '/pages/feedback-menu/feedback-menu'
    })
  },

  goToMyCorrection() {
    wx.navigateTo({
      url: '/pages/correction-my/correction-my'
    })
  },

  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？退出后将清除本地数据。',
      success: (res) => {
        if (res.confirm) {
          app.clearLoginInfo()
          this.setData({
            isLoggedIn: false,
            userInfo: null,
            learningStats: {
              learnedWords: 0,
              masteredWords: 0,
              dailyNewWords: 0
            }
          })
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
          
          // 重新自动登录
          setTimeout(() => {
            app.autoWechatLogin()
          }, 1000)
        }
      }
    })
  }
})
