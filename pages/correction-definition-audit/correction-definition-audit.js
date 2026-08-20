// pages/correction-definition-audit/correction-definition-audit.js
const { adminApi } = require('../../utils/api')

Page({
  data: {
    list: [],
    loading: true
  },

  onLoad() {
    this.loadList()
  },

  onShow() {
    // 从详情页返回后刷新列表（避免 onLoad 重复加载）
    if (this.data.list.length > 0 || !this.data.loading) {
      this.loadList()
    }
  },

  async loadList() {
    this.setData({ loading: true })
    try {
      const res = await adminApi.listPendingDefinitionCorrections()
      if (res.code === 200) {
        this.setData({ list: res.data || [] })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载释义纠错审核列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 进入释义纠错详情 */
  goDetail(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.list[index]
    if (!item || !item.id) return
    wx.navigateTo({
      url: `/pages/correction-definition-audit-detail/correction-definition-audit-detail?correctionId=${item.id}`
    })
  }
})
