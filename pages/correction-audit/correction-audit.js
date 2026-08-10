// pages/correction-audit/correction-audit.js
const { correctionApi } = require('../../utils/api')

Page({
  data: {
    list: [],
    loading: true
  },

  onLoad() {
    this.loadList()
  },

  onShow() {
    // 从详情页返回后刷新列表（仅在已加载过时刷新，避免 onLoad 重复）
    if (this.data.list.length > 0 || !this.data.loading) {
      this.loadList()
    }
  },

  async loadList() {
    this.setData({ loading: true })
    try {
      const res = await correctionApi.listPending()
      if (res.code === 200) {
        this.setData({ list: res.data || [] })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载纠错审核列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 进入纠错详情 */
  goDetail(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.list[index]
    if (!item) return
    // 将纠错数据编码传递到详情页
    const data = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({
      url: `/pages/correction-audit-detail/correction-audit-detail?data=${data}`
    })
  }
})
