// pages/wordlist-detail/wordlist-detail.js
// 词单详情：全量展示词单内单词，按分组分区展示，支持「未选 / 已选 / 全部」三个栏目切换
const { wordlistApi, wordlistGroupApi, reviewApi, fsrsApi } = require('../../utils/api')

// 未分组分区使用的固定 key
const UNGROUPED_KEY = '__ungrouped__'
// 分组标识色（/all-content 未返回颜色，按顺序循环取色）
const GROUP_COLORS = ['#5B8C7D', '#4C8DAE', '#E6A23C', '#8B7CC8', '#D4756B', '#67A86A']

Page({
  data: {
    wordListId: '',
    loading: false,

    /* 全量原始数据 */
    groups: [],   // [{ id, name, color }]
    words: [],    // [{ wordId, kanji, kana, learningStatus, groupId }]

    /* 视图：按分组切分出的分区 */
    sections: [],

    /* 栏目：unselected 未选 / selected 已选 / all 全部 */
    activeTab: 'unselected',
    total: 0,             // 全部单词数
    learnedCount: 0,      // 已选（已加入学习）
    unselectedCount: 0,   // 未选
    learnedPercent: 0,    // 已选百分比

    /* 本次待加入学习的本地勾选 */
    selectedWordIds: [],
    displayLearnedCount: 0,  // 显示用的 n = 接口n + 当前勾选数
    learningStatus: null,
    submitting: false,

    /* 高亮脉冲：可见的选中单词 + 含选中单词但未展开的分组 */
    flashWordIds: [],
    flashGroupIds: []
  },

  onLoad(options) {
    const wordListId = options.wordListId || ''
    this._expanded = {}   // 分组展开状态 { [groupId]: true }，默认收起
    this.setData({ wordListId })
    if (wordListId) {
      this.initAndLoad()
    }
  },

  onShow() {
    if (this.data.wordListId) {
      this.loadLearningStatus()
    }
  },

  onUnload() {
    if (this._flashTimer) clearTimeout(this._flashTimer)
  },

  /** 确定排序方式后加载数据：收藏夹按添加时间降序，其他词单按假名升序 */
  async initAndLoad() {
    const isFavorite = await this.isDefaultWordList()
    this.sortParams = isFavorite
      ? { sort: 'addedAt', order: 'desc' }
      : { sort: 'kana', order: 'asc' }
    this.loadDetail()
    this.loadAllContent()
    this.loadLearningStatus()
  },

  /** 判断当前词单是否为默认收藏夹 */
  async isDefaultWordList() {
    const defaultId = await this.getDefaultWordListId()
    return defaultId != null && String(defaultId) === String(this.data.wordListId)
  },

  /** 获取默认收藏夹 ID（优先缓存，否则调用接口） */
  getDefaultWordListId() {
    return new Promise((resolve) => {
      const cached = wx.getStorageSync('defaultWordListId')
      if (cached) {
        resolve(cached)
        return
      }
      wordlistApi.getDefault()
        .then(res => {
          if (res.code === 200 && res.data && res.data.id) {
            wx.setStorageSync('defaultWordListId', res.data.id)
            resolve(res.data.id)
          } else {
            resolve(null)
          }
        })
        .catch(() => resolve(null))
    })
  },

  /** 词单详情仅用于设置导航栏标题（顶部信息栏已移除） */
  async loadDetail() {
    try {
      const res = await wordlistApi.getDetail(this.data.wordListId)
      if (res.code === 200 && res.data && res.data.name) {
        wx.setNavigationBarTitle({ title: res.data.name })
      }
    } catch (error) {
      console.error('加载词单详情失败:', error)
    }
  },

  async loadLearningStatus() {
    try {
      const res = await reviewApi.getLearningStatus()
      if (res.code === 200 && res.data) {
        const baseN = this.getTodaySelectedCount(res.data)
        this.setData({
          learningStatus: res.data,
          displayLearnedCount: baseN + this.data.selectedWordIds.length
        })
      }
    } catch (error) {
      console.error('加载学习状态失败:', error)
    }
  },

  /** 今日已选单词数：优先取接口新增的 todaySelectedCount，兼容旧的 newWordsLearned */
  getTodaySelectedCount(status) {
    if (!status) return 0
    const v = status.todaySelectedCount
    if (v !== null && v !== undefined) return v
    return status.newWordsLearned || 0
  },

  /** 加载词单全量内容（所有分组 + 所有单词，不分页） */
  async loadAllContent() {
    this.setData({ loading: true })
    try {
      const params = this.sortParams || {}
      const res = await wordlistGroupApi.getAllContent(this.data.wordListId, params.sort, params.order)
      if (res.code === 200 && res.data) {
        const groups = (res.data.groups || []).map((g, i) => ({
          id: String(g.id),
          name: g.groupName || g.name || '未命名',
          color: GROUP_COLORS[i % GROUP_COLORS.length]
        }))
        const words = (res.data.words || []).map(w => ({
          wordId: String(w.id !== undefined && w.id !== null ? w.id : w.wordId),
          kanji: w.kanji || w.kana || '',
          kana: w.kana || '',
          learningStatus: w.learningStatus || null,
          groupId: w.groupId != null ? String(w.groupId) : null
        }))
        const total = words.length
        const learnedCount = words.filter(w => w.learningStatus === 'learning').length
        this.setData({
          groups,
          words,
          total,
          learnedCount,
          unselectedCount: total - learnedCount,
          learnedPercent: total > 0 ? Math.round(learnedCount * 100 / total) : 0
        })
        this.buildSections()
      }
    } catch (error) {
      console.error('加载词单内容失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 按当前栏目 + 分组归属切分出展示用的分区列表 */
  buildSections(cb) {
    const tab = this.data.activeTab
    const { groups, words } = this.data
    const groupIdSet = {}
    groups.forEach(g => { groupIdSet[g.id] = true })

    const byGroup = {}
    const ungrouped = []
    words.forEach(w => {
      if (tab === 'selected' && w.learningStatus !== 'learning') return
      if (tab === 'unselected' && w.learningStatus === 'learning') return
      if (w.groupId && groupIdSet[w.groupId]) {
        if (!byGroup[w.groupId]) byGroup[w.groupId] = []
        byGroup[w.groupId].push(w)
      } else {
        ungrouped.push(w)
      }
    })

    const sections = []
    groups.forEach(g => {
      const list = byGroup[g.id] || []
      if (!list.length) return
      sections.push({
        id: g.id,
        name: g.name,
        color: g.color,
        isGroup: true,
        expanded: !!this._expanded[g.id],
        count: list.length,
        words: list
      })
    })
    // 未分组单词直接展示在所有分组下方（不折叠）
    if (ungrouped.length) {
      sections.push({
        id: UNGROUPED_KEY,
        name: '未分组',
        color: '#C0C4CC',
        isGroup: false,
        expanded: true,
        count: ungrouped.length,
        words: ungrouped
      })
    }
    this.setData({ sections }, cb)
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    this.buildSections()
  },

  /** 分组下拉展开 / 收起 */
  onToggleGroup(e) {
    const id = e.currentTarget.dataset.id
    if (id === UNGROUPED_KEY) return
    this._expanded[id] = !this._expanded[id]
    this.buildSections()
  },

  /** 更新显示数量 n = 今日已选（todaySelectedCount） + 本次勾选数 */
  updateDisplayCount() {
    const baseN = this.getTodaySelectedCount(this.data.learningStatus)
    this.setData({
      displayLearnedCount: baseN + this.data.selectedWordIds.length
    })
  },

  getRemainCount() {
    const status = this.data.learningStatus
    if (!status) return 20
    return Math.max(0, (status.dailyNewWords || 20) - this.getTodaySelectedCount(status))
  },

  /** 获取本次应选数量：不超上限则按缺口选，超了每次20 */
  getPickCount() {
    const remain = this.getRemainCount()
    return remain <= 0 ? 20 : remain
  },

  /** 从未勾选 + 未在学的单词中取 N 个（顺序），每次重新替换之前的选择 */
  startSequentialLearn() {
    const count = this.getPickCount()
    const picked = this.pickAvailableWords(count, false)
    if (picked.length === 0) {
      wx.showToast({ title: '没有更多可选单词', icon: 'none' })
      return
    }
    this.setData({ selectedWordIds: picked.map(w => w.wordId) })
    this.updateDisplayCount()
    this.revealPicked(picked)
  },

  /** 从未勾选 + 未在学的单词中取 N 个（随机），每次重新随机替换之前的选择 */
  startRandomLearn() {
    const count = this.getPickCount()
    const picked = this.pickAvailableWords(count, true)
    if (picked.length === 0) {
      wx.showToast({ title: '没有更多可选单词', icon: 'none' })
      return
    }
    this.setData({ selectedWordIds: picked.map(w => w.wordId) })
    this.updateDisplayCount()
    this.revealPicked(picked)
  },

  /**
   * 从「未勾选且未在学」的全量单词中取 N 个
   * - random=false：从最前面的分组开始，按分组顺序依次取词；前面分组若已全部选完则自动
   *                 跳到下一个分组，最后取未分组单词（组内保持当前排序）
   * - random=true ：按分组分桶（未分组单独一桶），桶内先随机打乱，再跨桶轮流取词，
   *                 保证选出的单词在各分组间分布更平均（避免集中在某个分组）
   * @param {Number} count 取词数量
   * @param {Boolean} random 是否随机
   */
  pickAvailableWords(count, random) {
    const selectedSet = new Set(this.data.selectedWordIds.map(String))
    const available = this.data.words.filter(w =>
      !selectedSet.has(String(w.wordId)) && w.learningStatus !== 'learning')

    if (!random) {
      return this.sortByGroupOrder(available).slice(0, count)
    }

    // 按分组分桶：groupId 为空归入「未分组」桶
    const buckets = {}
    const order = []
    available.forEach(w => {
      const key = w.groupId ? String(w.groupId) : UNGROUPED_KEY
      if (!buckets[key]) {
        buckets[key] = []
        order.push(key)
      }
      buckets[key].push(w)
    })

    // 桶顺序随机 + 桶内随机打乱
    const keys = this.shuffleArray(order)
    keys.forEach(k => { buckets[k] = this.shuffleArray(buckets[k]) })

    // 跨桶轮流取词，直到凑够 count 或全部取完
    const picked = []
    let round = 0
    while (picked.length < count) {
      let added = false
      for (let i = 0; i < keys.length && picked.length < count; i++) {
        const bucket = buckets[keys[i]]
        if (round < bucket.length) {
          picked.push(bucket[round])
          added = true
        }
      }
      if (!added) break
      round++
    }
    return picked
  },

  /**
   * 按分组顺序重排单词：分组按其在词单中的顺序排列，未分组单词排在最后；
   * 组内保持传入时的相对顺序。分组已无可用单词时会自然被跳过。
   */
  sortByGroupOrder(list) {
    const groupIdSet = {}
    const byGroup = {}
    const ungrouped = []
    this.data.groups.forEach(g => { groupIdSet[g.id] = true })

    list.forEach(w => {
      if (w.groupId && groupIdSet[w.groupId]) {
        if (!byGroup[w.groupId]) byGroup[w.groupId] = []
        byGroup[w.groupId].push(w)
      } else {
        ungrouped.push(w)
      }
    })

    const ordered = []
    this.data.groups.forEach(g => {
      const arr = byGroup[g.id]
      if (arr && arr.length) ordered.push(...arr)
    })
    ordered.push(...ungrouped)
    return ordered
  },

  /**
   * 选词后的高亮与定位：
   * - 只展开「列表中最靠前的被选中单词」所在的分组（其余分组保持原状），并滚动定位到该单词
   * - 其余被选中单词：所在分组已展开 → 高亮对应单词；分组未展开 → 只脉冲高亮分组标题
   */
  revealPicked(picked) {
    const groupIdSet = {}
    this.data.groups.forEach(g => { groupIdSet[g.id] = true })

    // 定位目标：渲染顺序最靠前的被选中单词；仅展开它所在的分组
    const first = this.firstInDisplayOrder(picked)
    const firstKey = (first.groupId && groupIdSet[first.groupId]) ? first.groupId : UNGROUPED_KEY
    if (firstKey !== UNGROUPED_KEY) this._expanded[firstKey] = true

    // 被选中的都是「未选」单词，若当前停留在「已选」栏目则切回「未选」以便看到选中项
    if (this.data.activeTab === 'selected') {
      this.setData({ activeTab: 'unselected' })
    }

    this.buildSections(() => {
      // 已展开的分区（未分组恒为展开）
      const expandedMap = {}
      expandedMap[UNGROUPED_KEY] = true
      this.data.groups.forEach(g => { expandedMap[g.id] = !!this._expanded[g.id] })

      const flashWordIds = []
      const flashGroupIds = []
      const seenGroup = {}
      picked.forEach(w => {
        const key = (w.groupId && groupIdSet[w.groupId]) ? w.groupId : UNGROUPED_KEY
        if (expandedMap[key]) {
          // 分组已展开：高亮对应单词
          flashWordIds.push(String(w.wordId))
        } else if (!seenGroup[key]) {
          // 分组未展开：不展开，只高亮分组标题
          seenGroup[key] = true
          flashGroupIds.push(key)
        }
      })

      this.flash(flashWordIds, flashGroupIds)
      setTimeout(() => this.scrollToWord(String(first.wordId)), 50)
    })
  },

  /** 高亮脉冲：可见的选中单词 + 含选中单词但未展开的分组标题 */
  flash(flashWordIds, flashGroupIds) {
    if (this._flashTimer) clearTimeout(this._flashTimer)
    // 先清空再设置，保证重复选中同一目标时动画能重新播放
    this.setData({ flashWordIds: [], flashGroupIds: [] }, () => {
      this.setData({
        flashWordIds: flashWordIds || [],
        flashGroupIds: flashGroupIds || []
      })
    })
    this._flashTimer = setTimeout(() => {
      this._flashTimer = null
      this.setData({ flashWordIds: [], flashGroupIds: [] })
    }, 1800)
  },

  /** 取渲染顺序最靠前的单词：先按分组顺序，再按单词在词单内的顺序 */
  firstInDisplayOrder(list) {
    if (!list || !list.length) return null
    const groupRank = {}
    this.data.groups.forEach((g, i) => { groupRank[g.id] = i })
    const wordIndex = {}
    this.data.words.forEach((w, i) => { wordIndex[String(w.wordId)] = i })
    const ungroupedRank = this.data.groups.length

    const rankOf = (w) => {
      const g = (w.groupId && groupRank[w.groupId] !== undefined) ? groupRank[w.groupId] : ungroupedRank
      const i = wordIndex[String(w.wordId)] || 0
      return g * 100000 + i
    }

    let best = list[0]
    let bestRank = rankOf(best)
    for (let i = 1; i < list.length; i++) {
      const r = rankOf(list[i])
      if (r < bestRank) {
        best = list[i]
        bestRank = r
      }
    }
    return best
  },

  shuffleArray(arr) {
    const s = [...arr]
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[s[i], s[j]] = [s[j], s[i]]
    }
    return s
  },

  /**
   * 滚动定位到指定单词，使其显示在吸顶栏目下方
   * 随机选词会同时展开多个分组：页面高度变化大、节点渲染慢，
   * 因此取不到位置时重试，取到位置滚动后再校正几次，直到位置稳定
   * @param {String} wordId  目标单词 id
   * @param {Number} attempt 元素未渲染时的重试次数
   * @param {Number} correct 滚动后的校正次数
   */
  scrollToWord(wordId, attempt = 0, correct = 0) {
    const query = wx.createSelectorQuery()
    query.select('#word-' + wordId).boundingClientRect()
    query.select('.tabs').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      const rect = res && res[0]
      const tabsRect = res && res[1]
      const viewport = res && res[2]

      // 目标节点还没渲染出来（分组刚展开），稍后重试
      if (!rect || !viewport) {
        if (attempt < 10) {
          setTimeout(() => this.scrollToWord(wordId, attempt + 1, correct), 100)
        }
        return
      }

      // 吸顶栏目高度，避免目标被栏目遮挡
      const offset = (tabsRect && tabsRect.height ? tabsRect.height : 56) + 8
      const current = viewport.scrollTop
      const target = Math.max(0, current + rect.top - offset)
      // 首次平滑滚动，后续校正直接跳转，避免画面抖动
      if (Math.abs(target - current) >= 2) {
        wx.pageScrollTo({
          scrollTop: target,
          duration: correct === 0 ? 260 : 0
        })
      }

      // 其余分组可能还在展开、页面高度仍在变化，再校正几次
      if (correct < 3) {
        setTimeout(() => this.scrollToWord(wordId, 0, correct + 1), 240)
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
        // 标记复习列表已变化（有新词加入复习），review-list 页 onShow 时据此重新向后端拉取
        getApp().globalData.reviewListChangedAt = Date.now()
        wx.showToast({
          title: skipped > 0 ? `已加入学习（${skipped}个已在学习中）` : '已加入学习',
          icon: 'none'
        })
        // 刷新页面数据
        this.setData({ selectedWordIds: [] })
        await this.loadLearningStatus()
        this.loadDetail()
        this.loadAllContent()
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
    this.loadLearningStatus()
    this.loadAllContent().then(() => wx.stopPullDownRefresh())
  }
})
