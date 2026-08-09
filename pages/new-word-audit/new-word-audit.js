// pages/new-word-audit/new-word-audit.js
const app = getApp()
const { get, post } = require('../../utils/request')

const PAGE_SIZE = 20

Page({
  data: {
    // tab
    activeTab: 'pending',
    // 第一层：queryWord 列表
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
    loadingMore: false,
    // 每个 tab 的数据缓存
    tabCache: {},
    // 第二层：results 列表
    currentRecord: null,
    // 第三层：单词详情
    currentWord: null,
    expandedSense: [0],
    // 状态映射
    statusMap: {
      'pending': '待审核',
      'incorrect': '不符合预期',
      'unmarked': '未标记',
      'approved': '已通过',
      'rejected': '已拒绝'
    }
  },

  onLoad() {
    this.loadList()
  },

  /** 切换 tab */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    const tabCache = this.data.tabCache
    if (tabCache[tab]) {
      const cached = tabCache[tab]
      this.setData({
        activeTab: tab,
        list: cached.list,
        page: cached.page,
        hasMore: cached.hasMore
      })
      return
    }
    this.setData({ activeTab: tab, page: 1, list: [], hasMore: false })
    this.loadList()
  },

  /** 加载第一层列表 */
  async loadList() {
    this.setData({ loading: true })
    try {
      const { activeTab, page } = this.data
      const res = await get('/api/ai-dict/audit/list', {
        status: activeTab,
        page: page,
        size: PAGE_SIZE
      })
      if (res.code === 200) {
        const pageData = res.data
        const list = pageData.data || []
        const hasMore = pageData.hasNext
        this.setData({ list, hasMore })
        const tabCache = this.data.tabCache
        tabCache[activeTab] = { list, page, hasMore }
        this.setData({ tabCache })
      }
    } catch (error) {
      console.error('加载审核列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 加载更多第一层 */
  async loadMore() {
    if (this.data.loadingMore) return
    this.setData({ loadingMore: true })
    try {
      const { activeTab, page, list } = this.data
      const nextPage = page + 1
      const res = await get('/api/ai-dict/audit/list', {
        status: activeTab,
        page: nextPage,
        size: PAGE_SIZE
      })
      if (res.code === 200) {
        const pageData = res.data
        const newRecords = pageData.data || []
        const hasMore = pageData.hasNext
        const newList = [...list, ...newRecords]
        this.setData({ list: newList, page: nextPage, hasMore })
        const tabCache = this.data.tabCache
        tabCache[activeTab] = { list: newList, page: nextPage, hasMore }
        this.setData({ tabCache })
      }
    } catch (error) {
      console.error('加载更多失败:', error)
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  /** 进入第二层 */
  enterResults(e) {
    const record = e.currentTarget.dataset.record
    this.setData({ currentRecord: record, currentWord: null })
  },

  /** 返回第一层 */
  backToList() {
    this.setData({ currentRecord: null, currentWord: null })
  },

  /** 进入第三层：查看单词详情 */
  enterWordDetail(e) {
    const word = e.currentTarget.dataset.word
    this.setData({ currentWord: word, expandedSense: [0] })
  },

  /** 返回第二层 */
  backToResults() {
    this.setData({ currentWord: null })
  },

  /** 展开/折叠义项 */
  toggleSense(e) {
    const index = e.currentTarget.dataset.index
    const expandedSense = this.data.expandedSense.slice()
    const pos = expandedSense.indexOf(index)
    if (pos > -1) {
      expandedSense.splice(pos, 1)
    } else {
      expandedSense.push(index)
    }
    this.setData({ expandedSense })
  },

  /** 采纳 */
  async approve(e) {
    const logId = this.data.currentRecord.logId
    try {
      const res = await post('/api/ai-dict/audit/approve', { logId })
      if (res.code === 200) {
        wx.showToast({ title: '已采纳', icon: 'success' })
        this.removeFromList(logId)
        this.setData({ currentRecord: null, currentWord: null })
      }
    } catch (error) {
      console.error('采纳失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /** 驳回 */
  async reject(e) {
    const logId = this.data.currentRecord.logId
    try {
      const res = await post('/api/ai-dict/audit/reject', { logId })
      if (res.code === 200) {
        wx.showToast({ title: '已驳回', icon: 'success' })
        this.removeFromList(logId)
        this.setData({ currentRecord: null, currentWord: null })
      }
    } catch (error) {
      console.error('驳回失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /** 从列表中移除并更新缓存 */
  removeFromList(logId) {
    const { activeTab, list } = this.data
    const newList = list.filter(item => item.logId !== logId)
    this.setData({ list: newList })
    const tabCache = this.data.tabCache
    if (tabCache[activeTab]) {
      tabCache[activeTab].list = newList
      this.setData({ tabCache })
    }
  }
})
