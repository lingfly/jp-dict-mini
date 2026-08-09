// pages/feedback/feedback.js
const { feedbackApi } = require('../../utils/api')

Page({
  data: {
    // 当前 tab: 'create' | 'list' | 'detail'
    currentTab: 'create',
    // 提交反馈表单
    feedbackType: 'bug',
    feedbackTypes: [
      { value: 'bug', label: '问题反馈' },
      { value: 'suggestion', label: '功能建议' },
      { value: 'other', label: '其他' }
    ],
    title: '',
    content: '',
    contact: '',
    submitting: false,
    // 反馈列表
    feedbackList: [],
    listLoading: true,
    pageNum: 1,
    pageSize: 10,
    hasMore: true,
    // 反馈详情
    feedbackDetail: null,
    detailLoading: false
  },

  onLoad() {
    this.loadFeedbackList()
  },

  // 切换 Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    if (tab === 'list') {
      this.loadFeedbackList()
    }
  },

  // 选择反馈类型
  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ feedbackType: type })
  },

  // 输入标题
  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  // 输入内容
  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  // 输入联系方式
  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  // 提交反馈
  async submitFeedback() {
    const { title, content, feedbackType, contact, submitting } = this.data

    if (submitting) return

    if (!title.trim()) {
      wx.showToast({ title: '请输入反馈标题', icon: 'none' })
      return
    }

    if (!feedbackType) {
      wx.showToast({ title: '请选择反馈类型', icon: 'none' })
      return
    }

    if (!content.trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const res = await feedbackApi.create({
        feedbackType: feedbackType,
        title: title.trim(),
        content: content.trim(),
        contact: contact.trim()
      })

      if (res.code === 200) {
        wx.showToast({ title: res.message || '反馈提交成功', icon: 'success' })
        this.setData({
          title: '',
          content: '',
          contact: '',
          feedbackType: 'bug'
        })
        // 切换到反馈列表
        this.setData({ currentTab: 'list' })
        this.loadFeedbackList()
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交反馈失败:', error)
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 加载反馈列表
  async loadFeedbackList() {
    this.setData({ listLoading: true, pageNum: 1 })
    try {
      const res = await feedbackApi.list(1, this.data.pageSize)
      if (res.code === 200) {
        const records = res.data.records || []
        this.setData({
          feedbackList: records,
          hasMore: records.length >= this.data.pageSize,
          pageNum: 1
        })
      }
    } catch (error) {
      console.error('加载反馈列表失败:', error)
    } finally {
      this.setData({ listLoading: false })
    }
  },

  // 加载更多
  async loadMore() {
    if (!this.data.hasMore || this.data.listLoading) return

    const nextPage = this.data.pageNum + 1
    this.setData({ listLoading: true })

    try {
      const res = await feedbackApi.list(nextPage, this.data.pageSize)
      if (res.code === 200) {
        const records = res.data.records || []
        this.setData({
          feedbackList: [...this.data.feedbackList, ...records],
          hasMore: records.length >= this.data.pageSize,
          pageNum: nextPage
        })
      }
    } catch (error) {
      console.error('加载更多反馈失败:', error)
    } finally {
      this.setData({ listLoading: false })
    }
  },

  // 查看反馈详情
  async viewDetail(e) {
    const feedbackId = e.currentTarget.dataset.id
    this.setData({
      currentTab: 'detail',
      detailLoading: true,
      feedbackDetail: null
    })

    try {
      const res = await feedbackApi.getDetail(feedbackId)
      if (res.code === 200) {
        this.setData({ feedbackDetail: res.data })
      }
    } catch (error) {
      console.error('加载反馈详情失败:', error)
      wx.showToast({ title: '加载详情失败', icon: 'none' })
    } finally {
      this.setData({ detailLoading: false })
    }
  },

  // 返回列表
  backToList() {
    this.setData({ currentTab: 'list' })
  },

  // 反馈类型文本
  getTypeLabel(type) {
    const item = this.data.feedbackTypes.find(t => t.value === type)
    return item ? item.label : type
  }
})
