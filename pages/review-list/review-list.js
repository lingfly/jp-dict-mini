// pages/review-list/review-list.js
const { wordApi, userApi } = require('../../utils/api')
const fsrs = require('../../utils/fsrs/fsrs')
const dataSource = require('../../utils/fsrs/dataSource')
const { formatBadgeText } = require('../../utils/badge')

Page({
  data: {
    loading: false,
    showAnswer: false,
    currentWord: null,
    wordDetail: null, // 完整单词详情（含 definitions/examples）
    expandedSense: [], // 展开的义项索引
    wordType: '',
    hint: '',
    dueCount: 0,
    todayStats: {
      total: 0,
      completed: 0,
      remaining: 0
    },
    progressPercent: 0,
    startTime: 0,
    collapseDefinitionOnReview: false,
    showMenu: false,
    ratingPreviews: [] // 四级评分对应的下次复习时间
  },

  // 本地 FSRS 队列调度状态
  queue: [], // [{ wordId, type, fsrsCard, word }]
  queueIndex: 0, // 当前指针
  initialTotal: 0, // 初始队列长度（当天应复习卡片数）
  completedCount: 0, // 已毕业（移出队列）卡片数

  onLoad() {
    this.loadCollapseConfig()
    this.initReview()
  },

  onShow() {
    // 每次显示时刷新今日复习数量（去重：与上次请求间隔 < 3s 则跳过）
    const now = Date.now()
    if (this._lastFetchAt && now - this._lastFetchAt < 3000) return
    this._lastFetchAt = now
    this.fetchLearningStatus()
  },

  /** 加载释义折叠配置 */
  async loadCollapseConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.setData({ collapseDefinitionOnReview: res.data.collapseDefinitionOnReview === 1 })
      }
    } catch (e) {
      console.error('加载释义折叠配置失败:', e)
    }
  },

  /**
   * 初始化复习流程：批量拉取当天卡片，构建本地 FSRS 队列
   */
  async initReview() {
    this.setData({ loading: true })

    try {
      const res = await dataSource.getDueCards()
      const data = res.data || {}
      const cards = data.cards || []

      // 按 due 升序排序，组成待复习队列
      this.queue = cards.slice().sort((a, b) => (a.fsrsCard.due || 0) - (b.fsrsCard.due || 0))
      this.queueIndex = 0
      this.initialTotal = this.queue.length
      this.completedCount = 0

      this.updateStats()

      // 队列为空 → 显示空闲/完成态
      if (this.queue.length === 0) {
        this.setData({ currentWord: null, wordDetail: null })
      } else {
        await this.showCurrentCard()
      }
      // 角标由 onShow 统一刷新一次，避免 due-count 重复请求
    } catch (error) {
      console.error('初始化复习失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 展示队列当前卡片
   * @returns {Boolean} 是否有可展示的卡片
   */
  async showCurrentCard() {
    if (this.queueIndex >= this.queue.length) {
      this.setData({ currentWord: null, wordDetail: null })
      this.updateStats()
      return false
    }

    const item = this.queue[this.queueIndex]

    // 单词详情：mock 卡片内嵌平铺结构（word + definitions）；真实接口为 { word, definitions, ... }
    let currentWord = null
    let wordDetail = null
    if (item.word && item.word.definitions) {
      currentWord = item.word
      wordDetail = item.word
    } else {
      const detail = await this.fetchWordDetail(item.wordId)
      if (detail && detail.word) {
        currentWord = detail.word
        wordDetail = detail
      }
    }

    if (!currentWord) {
      // 单词详情获取失败，跳过这张卡
      this.queue.splice(this.queueIndex, 1)
      return this.showCurrentCard()
    }

    // 根据配置决定释义是否默认展开
    const definitions = wordDetail.definitions || []
    const expandAll = !this.data.collapseDefinitionOnReview
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

    // 预计算四级评分对应的下次复习时间（用于评分按钮下方展示）
    const ratingPreviews = fsrs.getRatingPreviews(item.fsrsCard, new Date())

    this.setData({
      currentWord,
      wordDetail,
      expandedSense: initialExpanded,
      wordType: item.type,
      hint: '',
      showAnswer: false,
      startTime: Date.now(),
      ratingPreviews
    })
    return true
  },

  /**
   * 获取学习状态（今日需复习数量）
   */
  async fetchLearningStatus() {
    try {
      const res = await dataSource.getLearningStatus()

      if (res.code === 200) {
        const data = res.data
        const dueCount = data.dueCount || 0
        this.setData({ dueCount })
        console.log('[fetchLearningStatus] 刷新角标:', dueCount)

        // 更新 tabBar 角标
        if (dueCount > 0) {
          wx.setTabBarBadge({
            index: 2, // 复习 tab 是第3个（0-based index: 2）
            text: formatBadgeText(dueCount),
            fail: (err) => console.error('[fetchLearningStatus] setTabBarBadge 失败:', err)
          })
        } else {
          wx.removeTabBarBadge({
            index: 2,
            fail: (err) => console.error('[fetchLearningStatus] removeTabBarBadge 失败:', err)
          })
        }
      }
    } catch (error) {
      console.error('获取学习状态失败:', error)
    }
  },

  /**
   * 获取单词详情
   */
  async fetchWordDetail(wordId) {
    try {
      const res = await wordApi.getDetail(wordId)
      if (res.code === 200) {
        return res.data
      }
      return null
    } catch (error) {
      console.error('获取单词详情失败:', error)
      return null
    }
  },

  /**
   * 更新进度统计
   */
  updateStats() {
    const remaining = Math.max(0, this.queue.length - this.queueIndex)
    const percent = this.initialTotal > 0
      ? Math.round((this.completedCount / this.initialTotal) * 100)
      : 0

    this.setData({
      todayStats: {
        total: this.initialTotal,
        completed: this.completedCount,
        remaining
      },
      progressPercent: percent
    })
  },

  /**
   * 用本地队列剩余数更新 tabBar 角标（评分成功后调用，不请求后端）
   * remaining = 队列中尚未处理的卡片数（含今天还会再次出现的短间隔卡）
   */
  updateBadgeLocally() {
    const remaining = Math.max(0, this.queue.length - this.queueIndex)
    this.setData({ dueCount: remaining })
    console.log('[updateBadgeLocally] 本地剩余复习数:', remaining)

    if (remaining > 0) {
      wx.setTabBarBadge({
        index: 2,
        text: formatBadgeText(remaining),
        fail: (err) => console.error('[updateBadgeLocally] setTabBarBadge 失败:', err)
      })
    } else {
      wx.removeTabBarBadge({
        index: 2,
        fail: (err) => console.error('[updateBadgeLocally] removeTabBarBadge 失败:', err)
      })
    }
  },

  /**
   * 点击下方空白处（问题阶段）显示答案
   */
  onCardTap() {
    // 只在未显示答案时响应，避免答案阶段误触发
    if (!this.data.showAnswer) {
      this.toggleAnswer()
    }
  },

  /**
   * 切换答案显示
   */
  toggleAnswer() {
    // 根据配置决定释义是否默认展开
    const definitions = (this.data.wordDetail && this.data.wordDetail.definitions) || []
    const expandAll = !this.data.collapseDefinitionOnReview
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

    this.setData({
      showAnswer: !this.data.showAnswer,
      expandedSense: initialExpanded
    })
  },

  /**
   * 切换义项展开/收起
   */
  toggleSense(e) {
    const index = e.currentTarget.dataset.index
    const expanded = this.data.expandedSense
    const newExpanded = expanded.includes(index)
      ? expanded.filter(i => i !== index)
      : [...expanded, index]
    this.setData({ expandedSense: newExpanded })
  },

  /**
   * 处理评分（FSRS 核心调度）
   */
  async handleScore(e) {
    // 防重复点击：提交过程中 loading 为 true，忽略后续评分点击
    if (this.data.loading) return
    const rating = parseInt(e.currentTarget.dataset.score) // 0=忘记 1=模糊 2=认识 3=简单
    if (this.queueIndex >= this.queue.length) return

    const item = this.queue[this.queueIndex]
    const now = new Date()
    const responseTimeMs = Date.now() - this.data.startTime

    this.setData({ loading: true })

    try {
      // 1. FSRS 计算新状态
      const result = fsrs.scheduleNext(item.fsrsCard, rating, now)
      const newCard = result.card

      console.log('[handleScore] card:', JSON.stringify(newCard))
      console.log('[handleScore] log:', JSON.stringify(result.log))

      // 2. 上报复习结果到后端（评分 + FSRS 新状态）
      const res = await dataSource.submitReview({
        wordId: item.wordId,
        rating,
        responseTimeMs,
        card: newCard,
        log: result.log
      })

      // 3. 处理后端返回（幂等/冲突），确定本次生效的卡片状态
      //    - 正常：后端 card 即本地提交的 newCard（仅持久化，不重算）
      //    - conflict：跨设备冲突，本地快照已过期，以库中最新 card 为准
      //    - duplicated：幂等命中（网络重试），后端已入库，按成功继续
      const serverData = (res && res.data) || {}
      let effectiveCard = newCard
      if (serverData.card) {
        effectiveCard = serverData.card
        if (serverData.conflict) {
          console.warn('[handleScore] 跨设备冲突，已使用库中最新状态:', JSON.stringify(effectiveCard))
          wx.showToast({
            title: '已同步最新复习状态',
            icon: 'none'
          })
        } else if (serverData.duplicated) {
          console.log('[handleScore] 重复提交（幂等命中），跳过重复处理')
        }
      }

      // 4. 队列调度（基于最终生效的卡片状态）
      //    移出当前卡片
      this.queue.splice(this.queueIndex, 1)

      //    判断：进入 Review 长期记忆 → 当天毕业，移出队列
      //    判断：Learning/Relearning 短间隔（scheduled_days === 0）→ 按"卡片数"重新插入
      const isLongTerm = effectiveCard.state === fsrs.State.Review && effectiveCard.scheduled_days > 0
      const isShortTerm = effectiveCard.state === fsrs.State.Learning || effectiveCard.state === fsrs.State.Relearning

      if (isLongTerm) {
        // 当天毕业
        this.completedCount++
      } else if (isShortTerm || effectiveCard.scheduled_days === 0) {
        // 短间隔：分钟 → 卡片数偏移（1 分钟 = 1 卡片）
        const offset = fsrs.calcCardOffset(effectiveCard, now.getTime())
        // 最近优先：偏移超出剩余卡片数时插入队尾
        const insertPos = Math.min(this.queue.length, this.queueIndex + offset)
        this.queue.splice(insertPos, 0, {
          wordId: item.wordId,
          type: item.type,
          fsrsCard: effectiveCard,
          word: item.word // 保留单词数据，mock 模式下短间隔卡再次出现直接可用
        })
      } else {
        // 其它情况（如 scheduled_days > 0 但非 Review）视为毕业
        this.completedCount++
      }

      this.updateStats()

      // 4. 展示下一张卡片
      const hasNext = await this.showCurrentCard()

      // 评分成功：用本地队列剩余数更新角标（不请求后端 due-count）
      this.updateBadgeLocally()

      if (!hasNext) {
        wx.showToast({
          title: '今日复习完成',
          icon: 'success'
        })
      }
    } catch (error) {
      console.error('提交评分失败:', error)
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 获取类型显示文本
   */
  getTypeDisplay(type) {
    const typeMap = {
      'INTRADAY_TRIGGERED': '短间隔复习',
      'INTRADAY_UPCOMING': '即将复习',
      'REGULAR_REVIEW': '复习',
      'NEW_WORD': '新词',
      'COMPLETED': '完成'
    }
    return typeMap[type] || ''
  },

  /**
   * 获取类型颜色类
   */
  getTypeColorClass(type) {
    const colorMap = {
      'INTRADAY_TRIGGERED': 'danger',
      'INTRADAY_UPCOMING': 'warning',
      'REGULAR_REVIEW': 'primary',
      'NEW_WORD': 'success',
      'COMPLETED': 'info'
    }
    return colorMap[type] || 'info'
  },

  /**
   * 开始复习
   */
  startReview() {
    this.initReview()
  },

  /** 切换更多菜单 */
  showCorrectionMenu() {
    this.setData({ showMenu: !this.data.showMenu })
  },

  /** 进入纠错页面 */
  goCorrection() {
    this.setData({ showMenu: false })
    const wordId = this.data.currentWord && this.data.currentWord.id
    if (!wordId) return
    wx.navigateTo({
      url: `/pages/correction/correction?wordId=${wordId}`
    })
  }
})
