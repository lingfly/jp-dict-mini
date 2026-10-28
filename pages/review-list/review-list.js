// pages/review-list/review-list.js
const { wordApi, userApi } = require('../../utils/api')
const fsrs = require('../../utils/fsrs/fsrs')
const dataSource = require('../../utils/fsrs/dataSource')
const { formatBadgeText } = require('../../utils/badge')
const { createReviewTimer } = require('../../utils/reviewTimer')

// 单词详情批量预取大小：避免复习时逐词查询详情，按批一次拉取
const WORD_DETAIL_BATCH_SIZE = 20

Page({
  data: {
    loading: false,
    loadError: '',
    submitError: '',      // 提交失败提示（失败后停留当前卡片）
    firstResponseTime: 0, // 首次评分耗时；重试时沿用，避免把等待算进去
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
    // 响应计时不在 data：由 this.timer 持有（utils/reviewTimer.js），生命周期切换不触发 setData
    collapseDefinitionOnReview: false,
    showMenu: false,
    ratingPreviews: [], // 四级评分对应的下次复习时间
    todayView: null, // 今日复习详情（#008）：null = 尚未就绪
    todayLoading: false // 今日详情取数中：用「加载中...」占位，避免闪旧完成页（#008 AC-12）
  },

  // 本地 FSRS 队列调度状态
  queue: [], // [{ wordId, type, fsrsCard, word }]
  queueIndex: 0, // 当前指针
  initialTotal: 0, // 初始队列长度（当天应复习卡片数）
  completedCount: 0, // 已毕业（移出队列）卡片数
  wordDetailCache: {}, // 单词详情缓存 { wordId: WordDetailResponse }，按批预取复用

  onLoad() {
    this.timer = createReviewTimer()
    // 参数未就绪前不展示可评分卡片：先占住 loading，避免闪现"今日已完成"（#004 AC-02 / AC-04）
    this._booting = true
    this.setData({ loading: true })
    this.bootstrap()
  },

  onShow() {
    // 从其他页面 / 后台回来：恢复计时，离开期间不计入响应时间（#003 AC-02）
    if (this.timer) this.timer.resume()

    // 有新词加入复习 → 复习列表已变化，重新向后端拉取队列
    // 首次启动由 bootstrap 串行拉取，这里不重复请求
    const app = getApp()
    if (!this._booting && app.globalData.reviewListChangedAt > (this._lastQueueRefreshAt || 0)) {
      this.initReview()
    }

    // 每次显示时刷新今日复习数量（去重：与上次请求间隔 < 3s 则跳过）
    const now = Date.now()
    if (this._lastFetchAt && now - this._lastFetchAt < 3000) return
    this._lastFetchAt = now
    this.fetchLearningStatus()
  },

  onHide() {
    // 切 tab、进入纠错页、小程序退到后台：暂停计时（#003 AC-01）
    if (this.timer) this.timer.pause()
  },

  /** 下拉刷新：重新拉取当天复习队列与今日统计 */
  async onPullDownRefresh() {
    try {
      this._lastFetchAt = Date.now()
      await this.initReview()
      await this.fetchLearningStatus()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  /**
   * 首屏启动：登录 → 学习配置（FSRS 参数 + 释义折叠）→ 拉取当日队列
   * 串行是必须的：先有参数，才能算首卡的评分预览与调度（#004 AC-01 / AC-02）
   */
  async bootstrap() {
    try {
      await this.loadLearningConfig()
      await this.initReview()
    } finally {
      this._booting = false
    }
  },

  /**
   * 加载学习配置：应用 FSRS 参数与复习时释义折叠
   * 请求失败时保留本机缓存/默认参数继续出卡，不阻塞复习（#004 AC-04 / AC-14）
   */
  async loadLearningConfig() {
    try {
      await getApp().waitForLogin()
      const res = await userApi.getLearningConfig()
      if (res && res.code === 200 && res.data) {
        fsrs.applyServerConfig(res.data)
        this.setData({ collapseDefinitionOnReview: res.data.collapseDefinitionOnReview === 1 })
        return
      }
      // 非 200：请求层已统一提示；参数保持缓存/默认
      console.error('[review-list] 学习配置返回异常，沿用本机参数:', res && res.code)
    } catch (e) {
      // 网络失败：参数用缓存/默认，卡片列表失败会走既有错误态
      console.error('[review-list] 加载学习配置失败，沿用本机参数:', e)
    }
  },

  /**
   * 初始化复习流程：批量拉取当天卡片，构建本地 FSRS 队列
   */
  async initReview() {
    this._lastQueueRefreshAt = Date.now()
    // 新的一轮复习：重置今日详情状态（#008 AC-01 / AC-05 / AC-11）
    this._todayLoaded = false
    this._dueRetried = false
    this._todayDateRetried = false
    this.setData({ loading: true, loadError: '', todayView: null })

    try {
      const res = await dataSource.getDueCards()
      const data = res.data || {}
      const cards = data.cards || []

      // 按 due 升序排序，组成待复习队列
      this.queue = cards.slice().sort((a, b) => (a.fsrsCard.due || 0) - (b.fsrsCard.due || 0))
      this.queueIndex = 0
      this.initialTotal = this.queue.length
      this.completedCount = 0
      this.wordDetailCache = {} // 重新拉取队列时清空详情缓存，避免脏数据

      this.updateStats()

      // 队列为空 → 显示空闲/完成态，并尝试展示今日复习详情（#008 触发点①）
      if (this.queue.length === 0) {
        this.setData({ currentWord: null, wordDetail: null })
        this.loadTodayDetail()
      } else {
        await this.showCurrentCard()
      }
      // 角标由 onShow 统一刷新一次，避免 due-count 重复请求
    } catch (error) {
      console.error('初始化复习失败:', error)
      // 请求层已提示原因；首行只写结果，次行引导下拉刷新（AC-07）
      this.setData({ loadError: '加载失败' })
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
      // 单词详情获取失败，跳过这张卡（与 3001 走同一收尾路径，避免统计与计时不一致）
      this.skipCurrentCard()
      return this.showCurrentCard()
    }

    // 根据配置决定释义是否默认展开
    const definitions = wordDetail.definitions || []
    const expandAll = !this.data.collapseDefinitionOnReview
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

    // 预计算四级评分对应的下次复习时间（用于评分按钮下方展示）
    const ratingPreviews = fsrs.getRatingPreviews(item.fsrsCard, new Date())

    // 新卡开始计时（页面不可见时也安全：隐藏起点从此刻算起）
    this.timer.start()

    this.setData({
      currentWord,
      wordDetail,
      expandedSense: initialExpanded,
      wordType: item.type,
      hint: '',
      showAnswer: false,
      ratingPreviews
    })
    return true
  },

  /**
   * 跳过当前卡片（单词不存在 3001 / 详情获取失败）
   *
   * 三件事必须一起做，漏一件都会让后续数据出错（#003 AC-06 / AC-07）：
   * 1. 移出队列 —— 不参与本地 FSRS 调度，避免短间隔卡被反复插回形成死循环
   * 2. completedCount++ —— 跳过也是"处理完"，分子 +1 进度条才能收敛到 100%
   * 3. 清 firstResponseTime —— 它只在提交成功时才清，不清就会让下一张沿用上一张的耗时
   */
  skipCurrentCard() {
    if (this.queueIndex < this.queue.length) {
      this.queue.splice(this.queueIndex, 1)
    }
    this.completedCount++
    this.setData({ firstResponseTime: 0 })
    this.updateStats()
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

        // 更新 tabBar 角标
        if (dueCount > 0) {
          wx.setTabBarBadge({
            index: 2, // 复习 tab 是第3个（0-based index: 2）
            text: formatBadgeText(dueCount)
          })
        } else {
          wx.removeTabBarBadge({
            index: 2
          })
        }
      }
    } catch (error) {
      console.error('获取学习状态失败:', error)
    }
  },

  /**
   * 批量预取单词详情：以当前队列指针为起点，收集最多 WORD_DETAIL_BATCH_SIZE 个
   * 未缓存的 wordId，通过 POST /api/word/batch 一次拉取并写入缓存
   */
  async prefetchWordDetails() {
    const ids = []
    const seen = new Set()
    for (let i = this.queueIndex; i < this.queue.length && ids.length < WORD_DETAIL_BATCH_SIZE; i++) {
      const id = String(this.queue[i].wordId)
      if (id && !this.wordDetailCache[id] && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    if (ids.length === 0) return

    try {
      const res = await wordApi.getDetailBatch(ids)
      if (res.code === 200 && Array.isArray(res.data)) {
        res.data.forEach(detail => {
          if (detail && detail.word) {
            this.wordDetailCache[String(detail.word.id)] = detail
          }
        })
      }
    } catch (error) {
      console.error('批量获取单词详情失败:', error)
    }
  },

  /**
   * 获取单词详情：优先读缓存，未命中则按批预取后再取（避免逐词请求）
   */
  async fetchWordDetail(wordId) {
    const key = String(wordId)
    if (this.wordDetailCache[key]) {
      return this.wordDetailCache[key]
    }
    await this.prefetchWordDetails()
    return this.wordDetailCache[key] || null
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
   * 加载今日复习详情（#008 AC-01）
   * 只在本地队列清空的完成态调用；同一完成态最多请求一次（AC-11）
   */
  async loadTodayDetail() {
    // 被"due > 0 静默重拉"消费掉的一次调用：避免 拉空 → 查今日 → 再拉空 的循环
    if (this._todaySuppressOnce) {
      this._todaySuppressOnce = false
      return
    }
    if (this._todayLoading || this._todayLoaded) return
    this._todayLoading = true
    // 先占位再 await：保证 initReview 把 loading 置 false 时不会闪到兜底分支（AC-12）
    this.setData({ todayLoading: true, todayView: null })

    try {
      let res = await dataSource.getTodayCognitive()
      let data = res && res.code === 200 ? res.data : null

      // 跨零点：返回日期与本地不一致时重拉一次（AC-05）
      if (data && data.date && data.date !== this.localDateKey() && !this._todayDateRetried) {
        this._todayDateRetried = true
        res = await dataSource.getTodayCognitive()
        data = res && res.code === 200 ? res.data : null
      }

      // 取不到：版式照旧，数值为空（AC-04）
      if (!data) {
        this._todayLoaded = true
        this.setData({ todayView: this.buildEmptyTodayView() })
        return
      }

      // 后端仍有待学：先重拉队列，有卡就直接复习（AC-02）
      const due = Number(data.due) || 0
      if (due > 0) {
        this.setData({ dueCount: due })
        if (!this._dueRetried) {
          this._dueRetried = true
          this._todaySuppressOnce = true
          await this.initReview()
          const remaining = this.queue.length - this.queueIndex
          if (remaining > 0) return
        }
        // due > 0 但无卡可出：统计口径缺陷，留痕后仍展示详情（AC-13）
        console.warn('[review-list] due > 0 但无卡可出，疑似统计口径缺陷（仍展示今日详情）:', {
          due,
          date: data.date,
          queueLength: this.queue.length
        })
      }

      this._todayLoaded = true
      this.setData({ todayView: this.buildTodayView(data) })
    } catch (e) {
      console.error('[review-list] 加载今日复习详情失败:', e)
      this._todayLoaded = true
      this.setData({ todayView: this.buildEmptyTodayView() })
    } finally {
      this._todayLoading = false
      this.setData({ todayLoading: false })
    }
  },

  /**
   * 详情接口失败时的空数据视图：版式与成功态一致，数值为「—」（#008 AC-04）
   */
  buildEmptyTodayView() {
    const placeholder = '—'
    return {
      dateText: this.localDateKey().replace(/-/g, '/'),
      empty: false,
      noData: true,
      rows: [
        { key: 'easy', icon: '😎', label: '简单', value: placeholder, percent: 0, color: '#409EFF' },
        { key: 'good', icon: '🙂', label: '认识', value: placeholder, percent: 0, color: '#5B8C7D' },
        { key: 'hard', icon: '😐', label: '模糊', value: placeholder, percent: 0, color: '#E6A23C' },
        { key: 'forgot', icon: '😕', label: '忘记', value: placeholder, percent: 0, color: '#F56C6C' }
      ],
      newLearned: placeholder,
      review: placeholder,
      durationText: placeholder
    }
  },

  /**
   * 接口日项 → 页面派生数据（#008 AC-06 ~ AC-10）
   */
  buildTodayView(data) {
    const cognitive = data.cognitive || {}
    const easy = Number(cognitive.easy) || 0
    const good = Number(cognitive.good) || 0
    const hard = Number(cognitive.hard) || 0
    const forgot = Number(cognitive.forgot) || 0
    const sum = easy + good + hard + forgot
    // 条长按四档之和归一；和为 0 时不绘制填充（AC-07）
    const percentOf = (value) => (sum > 0 ? Math.round((value / sum) * 1000) / 10 : 0)
    const reviewAndNew = data.reviewAndNew || {}

    return {
      dateText: this.formatDateSlash(data.date),
      empty: sum === 0,
      rows: [
        { key: 'easy', icon: '😎', label: '简单', value: easy, percent: percentOf(easy), color: '#409EFF' },
        { key: 'good', icon: '🙂', label: '认识', value: good, percent: percentOf(good), color: '#5B8C7D' },
        { key: 'hard', icon: '😐', label: '模糊', value: hard, percent: percentOf(hard), color: '#E6A23C' },
        { key: 'forgot', icon: '😕', label: '忘记', value: forgot, percent: percentOf(forgot), color: '#F56C6C' }
      ],
      newLearned: Number(reviewAndNew.newLearned) || 0,
      review: Number(reviewAndNew.review) || 0,
      durationText: this.formatDurationText(Number(data.durationSeconds) || 0)
    }
  },

  /** 接口日期 yyyy-MM-dd → yyyy/MM/dd（#008：日期用斜杠） */
  formatDateSlash(isoDate) {
    if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return isoDate.replace(/-/g, '/')
    }
    return this.localDateKey().replace(/-/g, '/')
  },

  /** 本地当天 yyyy-MM-dd，用于与接口 date 比对（AC-05） */
  localDateKey() {
    const now = new Date()
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  },

  /** 时长文案：0:00 / 0:25 / 17:05 / 1:11:45（#008 AC-08） */
  formatDurationText(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds || 0))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
    return `${minutes}:${pad(seconds)}`
  },

  /**
   * 点击下方空白处（问题阶段）显示答案
   */
  onCardTap() {
    // 只在未显示答案时响应，避免答案阶段误触发
    if (!this.data.showAnswer) {
      // 触感确认（#006 AC-09）：与评分同档，单次 light；空白区本身不变色
      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' })
      }
      this.toggleAnswer()
    }
  },

  /**
   * 切换答案显示
   *
   * 注意：这里故意不碰计时器。看答案（读释义、例句、展开义项）属于同一次作答，
   * 计入 responseTimeMs，仅受 60s 上限约束（#003 AC-05）。
   * 依据：Anki 的计时区间是「题目出现 → 按评分键」，作答时长不参与 FSRS 调度。
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

    // 触感确认（#006 AC-02 / AC-03 / AC-04）
    // 只用 short + light 的单次反馈：长震与双震是"收到消息"的手感，这里要的是"点到了"
    // 不支持震动的环境用存在性判断跳过，失败不影响评分
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' })
    }

    const item = this.queue[this.queueIndex]
    const now = new Date()
    // 首次评分的真实耗时；失败重试时沿用（#001 AC-15）
    // 已扣除页面不可见时长并截断到 60s（#003 AC-03 / AC-04）
    const responseTimeMs = this.data.firstResponseTime || this.timer.elapsed()

    this.setData({ loading: true, submitError: '', firstResponseTime: responseTimeMs })

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

      // 2.1 单词不存在（后端 3001：卡片对应单词已被删除/移出词单）
      //     静默跳过该卡片：移出队列，不参与本地调度（避免短间隔卡被反复插回形成死循环）
      if (res && res.code === dataSource.WORD_NOT_FOUND) {
        console.warn('[handleScore] 单词不存在，直接跳过:', item.wordId)
        this.skipCurrentCard()
        const hasNextAfterSkip = await this.showCurrentCard()
        this.updateBadgeLocally()
        if (!hasNextAfterSkip) {
          wx.showToast({
            title: '今日复习完成',
            icon: 'success'
          })
          // 完成态：加载今日复习详情（#008 触发点③）
          this.loadTodayDetail()
        }
        return
      }

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
      this.setData({ submitError: '', firstResponseTime: 0 })
      const hasNext = await this.showCurrentCard()

      // 评分成功：用本地队列剩余数更新角标（不请求后端 due-count）
      this.updateBadgeLocally()

      if (!hasNext) {
        wx.showToast({
          title: '今日复习完成',
          icon: 'success'
        })
        // 完成态：加载今日复习详情（#008 触发点②）
        this.loadTodayDetail()
      }
    } catch (error) {
      console.error('提交评分失败:', error)
      // 请求层已提示原因；卡片留在原位，直接再点评分即可重试（AC-07）
      this.setData({ submitError: (error && error.message) || '提交失败，请重新选择' })
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

  /** 进入单词纠错页面 */
  goCorrection() {
    this.setData({ showMenu: false })
    const wordId = this.data.currentWord && this.data.currentWord.id
    if (!wordId) return
    wx.navigateTo({
      url: `/pages/correction-word/correction-word?wordId=${wordId}`
    })
  },

  /** 进入释义纠错页面 */
  goDefinitionCorrection() {
    this.setData({ showMenu: false })
    const wordId = this.data.currentWord && this.data.currentWord.id
    if (!wordId) return
    wx.navigateTo({
      url: `/pages/correction-definition/correction-definition?wordId=${wordId}`
    })
  }
})
