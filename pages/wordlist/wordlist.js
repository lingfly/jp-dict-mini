// pages/wordlist/wordlist.js
const app = getApp()
const { wordlistApi } = require('../../utils/api')

Page({
  data: {
    loading: false,
    wordLists: []
  },

  onLoad() {
    this.loadWordLists()
  },

  /**
   * 加载词单列表
   */
  async loadWordLists() {
    this.setData({ loading: true })

    try {
      const res = await wordlistApi.getAvailable(app.globalData.userId)

      if (res.code === 200) {
        this.setData({
          wordLists: res.data
        })
      } else {
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('加载词单列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 选择词单
   */
  async selectWordList(e) {
    const wordListId = e.currentTarget.dataset.id

    // 如果已经是当前词单，不需要切换
    const currentList = this.data.wordLists.find(item => item.id === wordListId)
    if (currentList && currentList.isCurrent) {
      wx.navigateBack()
      return
    }

    wx.showLoading({ title: '切换中...' })

    try {
      const res = await wordlistApi.select(app.globalData.userId, wordListId)

      if (res.code === 200) {
        wx.showToast({
          title: '切换成功',
          icon: 'success'
        })

        // 延迟返回，让用户看到提示
        setTimeout(() => {
          wx.navigateBack()
        }, 1000)
      } else {
        wx.showToast({
          title: res.message || '切换失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('选择词单失败:', error)
      wx.showToast({
        title: '切换失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  }
})
