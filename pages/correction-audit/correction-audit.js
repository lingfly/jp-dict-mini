// pages/correction-audit/correction-audit.js
const app = getApp()
const { get, post } = require('../../utils/request')

Page({
  data: {
    list: [],
    loading: true
  },

  onLoad() {
    this.loadList()
  },

  async loadList() {
    this.setData({ loading: true })
    try {
      const res = await get('/api/admin/audit/corrections')
      if (res.code === 200) {
        this.setData({ list: res.data || [] })
      }
    } catch (error) {
      console.error('加载纠错审核列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async approve(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await post('/api/admin/audit/corrections/approve', { id })
      if (res.code === 200) {
        wx.showToast({ title: '已通过', icon: 'success' })
        this.loadList()
      }
    } catch (error) {
      console.error('审核操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async reject(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await post('/api/admin/audit/corrections/reject', { id })
      if (res.code === 200) {
        wx.showToast({ title: '已拒绝', icon: 'success' })
        this.loadList()
      }
    } catch (error) {
      console.error('审核操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
