// pages/feedback-menu/feedback-menu.js
Page({
  data: {},

  // 向开发者反馈
  goToDevFeedback() {
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    })
  },

  // 向微信平台投诉
  goToComplaint() {
    // 使用微信提供的投诉功能
    wx.openBusinessView({
      businessType: 'complaintPage',
      success: (res) => {
        console.log('打开投诉页面成功', res)
      },
      fail: (err) => {
        console.error('打开投诉页面失败', err)
        wx.showToast({
          title: '暂不支持此功能',
          icon: 'none'
        })
      }
    })
  }
})
