// pages/wordlist-detail/wordlist-detail.js
const { wordlistApi, reviewApi, fsrsApi } = require('../../utils/api')

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
    displayLearnedCount: 0,  // 显示用的 n = 接口n + 当前勾选数
    submitting: false
  },

  onLoad(options) {
    const wordListId = options.wordListId || ''
    this.loadedPages = new Set()  // 每次进入页面重置已加载页码
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
    if (this.loadedPages.has(page)) {
      // 该页已通过随机加载过，跳过 API 调用，只需更新 page 和 hasMore
      this.setData({ page, hasMore: this.data.words.length < this.data.total })
      return
    }
    this.setData({ loading: true })
    try {
      const res = await wordlistApi.getWords(this.data.wordListId, page, this.data.size)
      if (res.code === 200 && res.data) {
        const records = (res.data.records || []).map(w => ({ ...w, wordId: String(w.id || w.wordId) }))
        const newWords = isLoadMore ? [...this.data.words, ...records] : records
        this.loadedPages.add(page)
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

  /** 从未勾选+未在学的单词中取 N 个（顺序），每次重新替换之前的选择 */
  async startSequentialLearn() {
    const count = this.getPickCount()
    const { newIds, firstPickIndex } = await this.pickAvailableWords(count, false)
    if (newIds.length === 0) {
      wx.showToast({ title: '没有更多可选单词', icon: 'none' })
      return
    }
    this.setData({ selectedWordIds: newIds })
    this.updateDisplayCount()
    this.scrollToWord(firstPickIndex)
  },

  /** 从未勾选+未在学的单词中取 N 个（随机），每次重新随机替换之前的选择 */
  async startRandomLearn() {
    const count = this.getPickCount()
    wx.showLoading({ title: '加载中...' })
    const { newIds, firstPickIndex } = await this.pickAvailableWords(count, true)
    wx.hideLoading()
    if (newIds.length === 0) {
      wx.showToast({ title: '没有更多可选单词', icon: 'none' })
      return
    }
    this.setData({ selectedWordIds: newIds })
    this.updateDisplayCount()
    this.scrollToWord(firstPickIndex)
  },

  /** 从未勾选+未在学的单词中凑 count 个，不够则加载更多页
   *  random=true 时：随机加载 n>3 页（非顺序），再从全局池中随机选
   *  random=false 时：按顺序逐页加载
   *  返回 { newIds, firstPickIndex } */
  async pickAvailableWords(count, random) {
    const selectedSet = new Set(this.data.selectedWordIds)
    const isAvailable = w => !selectedSet.has(String(w.wordId)) && w.learningStatus !== 'learning'

    let words = [...this.data.words]
    let available = words.filter(isAvailable)

    if (random) {
      // ========== 随机模式：随机加载多页 ==========
      const totalPages = Math.ceil(this.data.total / this.data.size)
      if (totalPages <= 1) {
        // 只有一页，直接用现有数据随机选
        const picked = this.shuffleArray(available).slice(0, count)
        const newIds = picked.map(w => String(w.wordId))
        let firstPickIndex = newIds.length > 0 ? words.findIndex(w => String(w.wordId) === newIds[0]) : -1
        return { newIds, firstPickIndex }
      }

      // 需要加载的页数：至少 4 页，但不超过总页数；至少覆盖 count 个单词
      const MIN_RANDOM_PAGES = 4
      const pagesNeeded = Math.max(MIN_RANDOM_PAGES, Math.ceil(count / this.data.size))
      const pagesToLoad = Math.min(pagesNeeded, totalPages)

      // 生成候选页码：1..totalPages 中排除已加载的页，随机打乱后取前 pagesToLoad 个
      const unloadedPages = []
      for (let i = 1; i <= totalPages; i++) {
        if (!this.loadedPages.has(i)) unloadedPages.push(i)
      }
      const shuffledPages = this.shuffleArray(unloadedPages)
      const targetPages = shuffledPages.slice(0, Math.min(pagesToLoad, unloadedPages.length))

      if (targetPages.length > 0) {
        // 并行加载所有目标页
        const pageResults = await Promise.all(
          targetPages.map(async (p) => {
            try {
              const res = await wordlistApi.getWords(this.data.wordListId, p, this.data.size)
              if (res.code === 200 && res.data) {
                const records = (res.data.records || []).map(w => ({ ...w, wordId: String(w.id || w.wordId) }))
                return { page: p, records }
              }
            } catch (e) { /* skip failed page */ }
            return null
          })
        )

        // 将加载结果插入 words（按页码排序），并标记已加载
        const pageMap = {} // page -> records
        for (const pr of pageResults) {
          if (pr && pr.records.length > 0) {
            pageMap[pr.page] = pr.records
            this.loadedPages.add(pr.page)
          }
        }

        // 重建 words：按页码顺序合并已有数据和新增页数据
        words = this.mergeWordsByPage(words, pageMap)
        available = words.filter(isAvailable)
      }
    } else {
      // ========== 顺序模式：逐页加载直到凑够 ==========
      let p = this.data.page
      let hasMore = this.data.hasMore

      while (available.length < count && hasMore) {
        p++
        if (this.loadedPages.has(p)) {
          // 已加载过，直接用缓存数据
          hasMore = this.data.words.length < this.data.total
          available = words.filter(isAvailable)
          continue
        }
        try {
          const res = await wordlistApi.getWords(this.data.wordListId, p, this.data.size)
          if (res.code === 200 && res.data) {
            const records = (res.data.records || []).map(w => ({ ...w, wordId: String(w.id || w.wordId) }))
            words = [...words, ...records]
            this.loadedPages.add(p)
            hasMore = words.length < (res.data.total || 0)
            available = words.filter(isAvailable)
          } else { break }
        } catch (e) { break }
      }
    }

    // 更新 words 到 data（如果 words 有变化）
    if (words.length > this.data.words.length) {
      this.setData({ words })
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

  /**
   * 将随机加载的页数据按页码合并到现有 words 数组中
   * existingWords: 当前已顺序加载的单词列表（按页码连续）
   * pageMap: { pageNum: [records] } 新加载的页数据
   * 返回按页码全局排序的新数组
   */
  mergeWordsByPage(existingWords, pageMap) {
    const size = this.data.size

    // 如果没有新增页，直接返回
    const newPageNums = Object.keys(pageMap).map(Number)
    if (newPageNums.length === 0) return existingWords

    // 按页码从大到小插入，避免索引偏移
    const result = [...existingWords]
    const sortedNewPages = newPageNums.sort((a, b) => b - a) // 降序

    for (const pageNum of sortedNewPages) {
      const records = pageMap[pageNum]
      // 该页在全局列表中的起始索引
      const insertIndex = (pageNum - 1) * size
      if (insertIndex >= result.length) {
        result.push(...records)
      } else {
        result.splice(insertIndex, 0, ...records)
      }
    }

    return result
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
    if (this.data.submitting) return
    if (this.data.selectedWordIds.length === 0) {
      wx.showToast({ title: '请至少选择1个单词', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })
    try {
      // 批量创建 FSRS 学习卡：POST /api/fsrs/cards（幂等，已存在的跳过）
      // 保持字符串传参：wordId 可能超 JS 安全整数（后端 ToStringSerializer），Jackson 字符串→Long 无损
      const res = await fsrsApi.addCards(this.data.selectedWordIds)
      wx.hideLoading()
      if (res.code === 200) {
        // FsrsBatchAddCardResponse：{ total, created, skipped, cards }
        const batch = res.data || {}
        const skipped = batch.skipped || 0
        console.log('[submitSelection] 批量加卡成功:', JSON.stringify(batch))
        wx.showToast({
          title: skipped > 0 ? `已加入学习（${skipped}个已在学习中）` : '已加入学习',
          icon: 'none'
        })
        // 刷新页面数据
        this.loadedPages = new Set()
        this.setData({ selectedWordIds: [], page: 1, words: [] })
        await this.loadLearningStatus()
        this.loadDetail()
        this.loadWords()
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('提交选词失败:', error)
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
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
