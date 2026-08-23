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
    // 当前查看单词在 results 数组中的索引
    currentWordIndex: -1,
    expandedSense: [0],
    // 防重复点击
    submitting: false,
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
    this.setData({ currentRecord: this.decorateRecord(record), currentWord: null, currentWordIndex: -1 })
  },

  /** 为 record 的每个 result 附加 auditStatus 字段（数据驱动，便于渲染同步） */
  decorateRecord(record) {
    if (!record || !record.results) return record
    const approved = this.parseIndexes(record.approvedIndexes)
    const rejected = this.parseIndexes(record.rejectedIndexes)
    const results = record.results.map((r, i) => {
      let auditStatus = ''
      if (approved.indexOf(i) > -1) {
        auditStatus = 'approved'
      } else if (rejected.indexOf(i) > -1) {
        auditStatus = 'rejected'
      } else if (r.submitted) {
        auditStatus = 'submitted'
      }
      return { ...r, auditStatus }
    })
    return { ...record, results }
  },

  /** 解析逗号分隔的索引字符串为数字数组 */
  parseIndexes(str) {
    if (!str) return []
    return String(str).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
  },

  /** 返回第一层 */
  backToList() {
    this.setData({ currentRecord: null, currentWord: null, currentWordIndex: -1 })
  },

  /** 进入第三层：查看单词详情 */
  enterWordDetail(e) {
    const index = Number(e.currentTarget.dataset.index)
    const word = e.currentTarget.dataset.word
    this.setData({ currentWord: word, currentWordIndex: index, expandedSense: [0] })
  },

  /** 返回第二层 */
  backToResults() {
    this.setData({ currentWord: null, currentWordIndex: -1 })
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
    this.doAudit('approve')
  },

  /** 驳回 */
  async reject(e) {
    this.doAudit('reject')
  },

  /** 执行审核操作（采纳/驳回），指定 selectedIndex */
  async doAudit(type) {
    if (this.data.submitting) return
    const { currentRecord, currentWordIndex } = this.data
    const logId = currentRecord && currentRecord.logId
    if (!logId || currentWordIndex < 0) return
    this.setData({ submitting: true })
    wx.showLoading({ title: '处理中...', mask: true })
    const url = type === 'approve' ? '/api/ai-dict/audit/approve' : '/api/ai-dict/audit/reject'
    const successTitle = type === 'approve' ? '已采纳' : '已驳回'
    try {
      const res = await post(url, { logId, selectedIndex: currentWordIndex })
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: successTitle, icon: 'success' })
        this.afterAudit(type)
      }
    } catch (error) {
      wx.hideLoading()
      console.error('审核失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 审核成功后的本地状态更新：标记该索引的审核状态，并同步到各层级 */
  afterAudit(type) {
    const { currentRecord, currentWordIndex, activeTab, list } = this.data
    const idxKey = type === 'approve' ? 'approvedIndexes' : 'rejectedIndexes'
    const status = type === 'approve' ? 'approved' : 'rejected'

    // 1. 更新 results 中对应单词的 auditStatus
    const results = currentRecord.results.map((r, i) => {
      if (i === currentWordIndex) {
        return { ...r, auditStatus: status }
      }
      return r
    })

    // 2. 更新审核索引字段（逗号分隔字符串）
    const record = { ...currentRecord, results }
    const existing = this.parseIndexes(record[idxKey])
    if (existing.indexOf(currentWordIndex) === -1) {
      existing.push(currentWordIndex)
    }
    record[idxKey] = existing.join(',')

    // 3. 同步更新第一层列表里的对应记录
    const newList = list.map(item => item.logId === record.logId ? record : item)
    this.setData({
      list: newList,
      currentRecord: record,
      currentWord: null,
      currentWordIndex: -1
    })
    const tabCache = this.data.tabCache
    if (tabCache[activeTab]) {
      tabCache[activeTab].list = newList
      this.setData({ tabCache })
    }
  }
})
