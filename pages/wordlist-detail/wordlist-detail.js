// pages/wordlist-detail/wordlist-detail.js
const { wordlistApi, reviewApi } = require('../../utils/api')

Page({
  data: {
    wordListId: '',
    wordList: null,
    words: [],
    page: 1,
    size: 20,
    total: 0,
    loading: false,
    hasMore: true,
    learningStatus: null,
    selectedWordIds: [],
    displayLearnedCount: 0  // 显示用的 n = 接口n + 当前勾选数
  },

  onLoad(options) {
    const wordListId = options.wordListId || ''
    this.setData({ wordListId })
    if (wordListId) {
      this.loadDetail()
      this.loadWords()
      this.loadLearningStatus()
    }
  },

  onShow() {
    if (this.data.wordListId) {
      this.loadLearningStatus()
    }
  },

  async loadLearningStatus() {
    try {
      const res = await reviewApi.getLearningStatus()
      if (res.code === 200 && res.data) {
        const baseN = res.data.newWordsLearned || 0
        this.setData({
          learningStatus: res.data,
          displayLearnedCount: baseN + this.data.selectedWordIds.length
        })
      }
    } catch (error) {
      console.error('加载学习状态失败:', error)
    }
  },

  /** 更新显示数量 = 接口返回n + 当前勾选数 */
  updateDisplayCount() {
    const status = this.data.learningStatus
    const baseN = status ? (status.newWordsLearned || 0) : 0
    this.setData({
      displayLearnedCount: baseN + this.data.selectedWordIds.length
    })
  },

  getRemainCount() {
    const status = this.data.learningStatus
    if (!status) return 20
    return Math.max(0, (status.dailyNewWords || 20) - (status.newWordsLearned || 0))
  },

  async loadDetail() {
    try {
      const res = await wordlistApi.getDetail(this.data.wordListId)
      if (res.code === 200 && res.data) {
        this.setData({ wordList: res.data })
      }
    } catch (error) {
      console.error('加载词单详情失败:', error)
    }
  },

  async loadWords(isLoadMore = false) {
    if (this.data.loading) return
    if (isLoadMore && !this.data.hasMore) return
    const page = isLoadMore ? this.data.page + 1 : 1
    this.setData({ loading: true })
    try {
      const res = await wordlistApi.getWords(this.data.wordListId, page, this.data.size)
      if (res.code === 200 && res.data) {
        const records = (res.data.records || []).map(w => ({ ...w, wordId: String(w.id || w.wordId) }))
        const newWords = isLoadMore ? [...this.data.words, ...records] : records
        this.setData({
          words: newWords, page, total: res.data.total || 0,
          hasMore: newWords.length < (res.data.total || 0)
        })
      }
    } catch (error) {
      console.error('加载单词列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  shuffleArray(arr) {
    const s = [...arr]
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[s[i], s[j]] = [s[j], s[i]]
    }
    return s
  },

  /** 获取本次应选数量：不超上限则按缺口选，超了每次20 */
  getPickCount() {
    const remain = this.getRemainCount()
    return remain <= 0 ? 20 : remain
  },

  /** 从未勾选+未在学的单词中取 N 个（顺序） */
  async startSequentialLearn() {
    const count = this.getPickCount()
    const { newIds, firstPickIndex } = await this.pickAvailableWords(count, false)
    if (newIds.length === 0) {
      wx.showToast({ title: '没有更多可选单词', icon: 'none' })
      return
    }
    this.setData({ selectedWordIds: [...this.data.selectedWordIds, ...newIds] })
    this.updateDisplayCount()
    this.scrollToWord(firstPickIndex)
  },

  /** 从未勾选+未在学的单词中取 N 个（随机） */
  async startRandomLearn() {
    const count = this.getPickCount()
    wx.showLoading({ title: '加载中...' })
    const { newIds, firstPickIndex } = await this.pickAvailableWords(count, true)
    wx.hideLoading()
    if (newIds.length === 0) {
      wx.showToast({ title: '没有更多可选单词', icon: 'none' })
      return
    }
    this.setData({ selectedWordIds: [...this.data.selectedWordIds, ...newIds] })
    this.updateDisplayCount()
    this.scrollToWord(firstPickIndex)
  },

  /** 从未勾选+未在学的单词中凑 count 个，不够则加载更多页
   *  返回 { newIds, firstPickIndex } */
  async pickAvailableWords(count, random) {
    const selectedSet = new Set(this.data.selectedWordIds)
    const isAvailable = w => !selectedSet.has(String(w.wordId)) && w.learningStatus !== 'learning'

    let words = [...this.data.words]
    let available = words.filter(isAvailable)
    let p = this.data.page
    let hasMore = this.data.hasMore

    while (available.length < count && hasMore) {
      p++
      try {
        const res = await wordlistApi.getWords(this.data.wordListId, p, this.data.size)
        if (res.code === 200 && res.data) {
          const records = (res.data.records || []).map(w => ({ ...w, wordId: String(w.id || w.wordId) }))
          words = [...words, ...records]
          hasMore = words.length < (res.data.total || 0)
          available = words.filter(isAvailable)
        } else {
          break
        }
      } catch (e) { break }
    }

    if (words.length > this.data.words.length) {
      this.setData({ words, page: p, hasMore })
    }

    const picked = random ? this.shuffleArray(available).slice(0, count) : available.slice(0, count)
    const newIds = picked.map(w => String(w.wordId))

    // 找到第一个被选中的在 words 中的索引
    let firstPickIndex = -1
    if (newIds.length > 0) {
      firstPickIndex = words.findIndex(w => String(w.wordId) === newIds[0])
    }

    return { newIds, firstPickIndex }
  },

  /** 滚动到指定单词位置 */
  scrollToWord(index) {
    if (index < 0) return
    // 使用 createSelectorQuery 获取元素位置并滚动
    const query = wx.createSelectorQuery()
    query.selectAll('.word-item').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      if (!res || !res[0] || !res[1]) return
      const items = res[0]
      const scrollTop = res[1].scrollTop
      if (index < items.length) {
        wx.pageScrollTo({
          scrollTop: scrollTop + items[index].top - items[0].top,
          duration: 300
        })
      }
    })
  },

  /** 今日待选 / 加入学习 — 根据是否有勾选切换行为 */
  onThirdBtnTap() {
    if (this.data.selectedWordIds.length > 0) {
      this.submitSelection()
    } else {
      this.startSequentialLearn()
    }
  },

  goWordDetail(e) {
    wx.navigateTo({ url: `/pages/word-detail/word-detail?wordId=${e.currentTarget.dataset.wordId}` })
  },

  onCheckboxTap(e) {
    const wordId = String(e.currentTarget.dataset.wordId)
    // 已在学习的单词不可取消
    const word = this.data.words.find(w => String(w.wordId) === wordId)
    if (word && word.learningStatus === 'learning') return

    let selected = [...this.data.selectedWordIds]
    const idx = selected.indexOf(wordId)
    if (idx > -1) {
      selected.splice(idx, 1)
    } else {
      selected.push(wordId)
    }
    this.setData({ selectedWordIds: selected })
    this.updateDisplayCount()
  },

  async submitSelection() {
    if (this.data.selectedWordIds.length === 0) {
      wx.showToast({ title: '请至少选择1个单词', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await reviewApi.selectNewWords(this.data.wordListId, this.data.selectedWordIds)
      if (res.code === 200) {
        wx.hideLoading()
        wx.showToast({ title: '已加入学习', icon: 'success' })
        // 刷新页面数据
        this.setData({ selectedWordIds: [], page: 1, words: [] })
        await this.loadLearningStatus()
        this.loadDetail()
        this.loadWords()
      } else {
        wx.hideLoading()
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('提交选词失败:', error)
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  },

  onPullDownRefresh() {
    this.loadDetail()
    this.loadWords().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadWords(true)
  }
})
