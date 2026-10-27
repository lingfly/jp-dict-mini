// pages/review-forecast/review-forecast.js
/**
 * 学习统计（#005）
 * 规范：specs/changes/005-learning-stats/spec.md、design.md
 *
 * 数据来源：GET /api/fsrs/due-forecast → { data: { days: [106 项] } }
 *   days 长度固定 106：今天往前 90 天 + 今天 + 往后 15 天，按日期升序；
 *   今天下标恒为 90（后端保证，前端不重新推算日期序列）。
 *
 * 两个图口径一致、共用纵轴，切换不改任何数值：
 *   认知情况  = 简单 / 认识 / 模糊 / 忘记 / 待学
 *   新学复习  = 新学 / 复习 / 待学
 * 同一天「五段之和」恒等于「三段之和」，因此两图柱高可比。
 *
 * null 与 0 必须区分（backend-api.md §4.6）：
 *   null = 这一天该项不存在（未来日的认知/新学复习、历史日的待学）→ 不画、显示「—」
 *   0    = 学了但确实 0 次 → 不画零高柱，但详情卡显示 0
 */
const { fsrsApi } = require('../../utils/api')

const CHART_HEIGHT = 720 // rpx，绘图区高度
const BAR_WIDTH = 82 // rpx，每列宽度（一屏 7 天：7 × 82 = 574rpx）
const MIN_SEG_HEIGHT = 4 // rpx，极小段的可见高度
const Y_TICK_COUNT = 10 // 刻度条数（含顶与底）
const DAYS_TOTAL = 106 // 后端固定返回的天数（前 90 + 今天 + 后 15）
const TODAY_INDEX = 90 // 后端固定的今天下标

/** 本地时区 yyyy-MM-dd */
function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** yyyy-MM-dd -> 本地时区当天 0 点 */
function parseDate(str) {
  const parts = String(str || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => isNaN(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

/** 相对今天的天数 -> 横坐标与详情卡文案 */
function dayLabel(offset) {
  if (offset === -2) return '前天'
  if (offset === -1) return '昨天'
  if (offset === 0) return '今天'
  if (offset === 1) return '明天'
  if (offset === 2) return '后天'
  if (offset < -2) return `${-offset}天前`
  return `${offset}天后`
}

/** 横坐标竖排标签拆字：连续数字合并成一组（"30天前" -> ["30","天","前"]） */
function splitLabel(label) {
  const groups = []
  let buf = ''
  for (const ch of label) {
    if (/\d/.test(ch)) {
      buf += ch
    } else {
      if (buf) { groups.push(buf); buf = '' }
      groups.push(ch)
    }
  }
  if (buf) groups.push(buf)
  return groups
}

/**
 * 向上取到"好看"的刻度步长（1/2/5 × 10^n），保证刻度是整数、读数不费劲
 * 例：max/9 = 45 -> 50；max/9 = 3.2 -> 5；max/9 = 0.7 -> 1
 */
function niceStep(rawStep) {
  if (rawStep <= 1) return 1
  const exp = Math.floor(Math.log10(rawStep))
  const base = Math.pow(10, exp)
  const f = rawStep / base
  let nice
  if (f <= 1) nice = 1
  else if (f <= 2) nice = 2
  else if (f <= 5) nice = 5
  else nice = 10
  return Math.max(1, Math.round(nice * base))
}

/**
 * 秒 -> 「N 分 N 秒」/「N 秒」
 * null（未来日）由调用方显示「—」，不进入这里
 */
function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  if (total <= 0) return '0 秒'
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m <= 0) return `${s} 秒`
  if (s === 0) return `${m} 分`
  return `${m} 分 ${s} 秒`
}

/** 取数值；null/undefined 统一返回 null（调用方据此区分「不存在」与 0） */
function numOrNull(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

/** 段高度：数值为 null -> 0（不画）；数值 > 0 但过矮 -> 兜底可见 */
function segHeight(value, scale) {
  if (value === null || value <= 0) return 0
  return Math.max(MIN_SEG_HEIGHT, Math.round(value * scale))
}

/** 详情卡某一项的展示值：null -> 「—」，否则原数字 */
function detailValue(v) {
  return v === null ? '—' : v
}

Page({
  data: {
    loadState: 'loading', // loading / ready / empty / error
    activeTab: 'cognitive', // cognitive / reviewNew
    days: [], // 归一化后的 106 天
    barsCognitive: [], // 认知图柱高
    barsReviewNew: [], // 新学复习图柱高
    yTicks: [], // 10 个刻度值，从上到下
    chartWidth: 0, // rpx
    barWidth: BAR_WIDTH,
    todayIndex: -1,
    selectedIndex: -1,
    detail: null, // 详情卡数据
    scrollLeft: 0,
    legendCognitive: [],
    legendReviewNew: []
  },

  onLoad() {
    this.loadStats()
  },

  onPullDownRefresh() {
    this.loadStats().then(() => wx.stopPullDownRefresh())
  },

  async loadStats() {
    this.setData({ loadState: 'loading' })
    try {
      // C-05：需要 token 的请求必须先等静默登录完成，否则 401 会触发重复登录
      await getApp().waitForLogin()
      const res = await fsrsApi.getDueForecast()

      if (!res || res.code !== 200) {
        // 非 200：提示由请求层统一给出一次，这里只切错误态
        this.setData({ loadState: 'error' })
        return
      }

      const days = res.data && Array.isArray(res.data.days) ? res.data.days : null
      if (!days || days.length === 0) {
        this.setData({ loadState: 'empty', days: [], barsCognitive: [], barsReviewNew: [] })
        return
      }

      this.buildChart(days)
    } catch (e) {
      // 网络失败/超时：请求层已提示；页面展示错误态 + 重试入口
      console.error('[review-forecast] 加载学习统计失败:', e)
      this.setData({ loadState: 'error' })
    }
  },

  /**
   * 归一化 + 算柱高 + 一次 setData
   * @param {Array} list 后端 days（已确认是数组）
   */
  buildChart(list) {
    // 先定位「今天」，再用下标差算相对天数。
    // 后��保证今天下标恒为 90；优先按日期匹配，设备时钟与服务器有偏差时回退到 90，
    // 这样即便本地时间不准，也不会出现"找不到今天 → 详情卡空白"。
    const todayStr = formatDate(new Date())
    let todayIndex = list.findIndex((item) => item && item.date === todayStr)
    if (todayIndex < 0) {
      todayIndex = list.length === DAYS_TOTAL ? TODAY_INDEX : this.findNearestIndex(list, todayStr)
    }

    const days = list.map((raw, i) => {
      const item = raw || {}
      const offset = i - todayIndex

      const cognitive = item.cognitive || null
      const reviewAndNew = item.reviewAndNew || null

      return {
        date: item.date || '',
        offset,
        label: dayLabel(offset),
        labelChars: splitLabel(dayLabel(offset)),
        isToday: offset === 0,
        isFuture: offset > 0,
        // 认知四档：块为 null 时全部为 null（未来日）
        easy: cognitive ? numOrNull(cognitive.easy) : null,
        good: cognitive ? numOrNull(cognitive.good) : null,
        hard: cognitive ? numOrNull(cognitive.hard) : null,
        forgot: cognitive ? numOrNull(cognitive.forgot) : null,
        // 新学复习：块为 null 时全部为 null（未来日）
        review: reviewAndNew ? numOrNull(reviewAndNew.review) : null,
        newLearned: reviewAndNew ? numOrNull(reviewAndNew.newLearned) : null,
        // 待学：历史日恒为 null
        due: numOrNull(item.due),
        durationSeconds: numOrNull(item.durationSeconds)
      }
    })

    // 纵轴上限：两图共用，取全期最大值。
    // 同一天「四档之和」恒等于「新学+复习」，因此两张图的最大值一致，无需各算一份。
    const totals = days.map((d) => {
      const cog = (d.easy || 0) + (d.good || 0) + (d.hard || 0) + (d.forgot || 0) + (d.due || 0)
      return cog
    })
    const maxTotal = Math.max(1, ...totals)
    // 步长取整：10 档刻度（9 段），保证刻度值是整数
    const step = niceStep(maxTotal / (Y_TICK_COUNT - 1))
    const niceMax = step * (Y_TICK_COUNT - 1)
    const scale = CHART_HEIGHT / niceMax

    const barsCognitive = days.map((d) => ({
      date: d.date,
      labelChars: d.labelChars,
      isToday: d.isToday,
      easyH: segHeight(d.easy, scale),
      goodH: segHeight(d.good, scale),
      hardH: segHeight(d.hard, scale),
      forgotH: segHeight(d.forgot, scale),
      dueH: segHeight(d.due, scale)
    }))

    const barsReviewNew = days.map((d) => ({
      date: d.date,
      labelChars: d.labelChars,
      isToday: d.isToday,
      newH: segHeight(d.newLearned, scale),
      reviewH: segHeight(d.review, scale),
      dueH: segHeight(d.due, scale)
    }))

    // 10 条刻度：顶部 niceMax，底部 0，按 step 均分
    const yTicks = []
    for (let i = 0; i < Y_TICK_COUNT; i++) {
      yTicks.push(niceMax - step * i)
    }

    this.setData(
      {
        loadState: 'ready',
        days,
        barsCognitive,
        barsReviewNew,
        yTicks,
        chartWidth: days.length * BAR_WIDTH,
        todayIndex,
        // 默认选中今天；切图与刷新都回到今天
        selectedIndex: todayIndex,
        detail: this.buildDetail(days[todayIndex]),
        legendCognitive: [
          { key: 'easy', text: '简单' },
          { key: 'good', text: '认识' },
          { key: 'hard', text: '模糊' },
          { key: 'forgot', text: '忘记' },
          { key: 'due', text: '待学' }
        ],
        legendReviewNew: [
          { key: 'new', text: '新学' },
          { key: 'review', text: '复习' },
          { key: 'due', text: '待学' }
        ]
      },
      () => this.scrollToToday()
    )
  },

  /**
   * 设备日期与后端序列对不上时的兜底：找日期最接近今天的那一项
   * （正常不会走到这里，仅防"本地时钟偏差 → 详情卡空白"）
   */
  findNearestIndex(list, todayStr) {
    const target = parseDate(todayStr)
    if (!target) return 0
    let best = 0
    let bestGap = Infinity
    list.forEach((item, i) => {
      const d = parseDate(item && item.date)
      if (!d) return
      const gap = Math.abs(d - target)
      if (gap < bestGap) {
        bestGap = gap
        best = i
      }
    })
    return best
  },

  /** 详情卡数据：null -> 「—」，未来日给提示 */
  buildDetail(day) {
    if (!day) return null
    const isFuture = day.offset > 0
    return {
      date: day.date,
      label: day.label,
      isFuture,
      // 未来日除待学外均显示「—」
      easy: detailValue(isFuture ? null : day.easy),
      good: detailValue(isFuture ? null : day.good),
      hard: detailValue(isFuture ? null : day.hard),
      forgot: detailValue(isFuture ? null : day.forgot),
      newLearned: detailValue(isFuture ? null : day.newLearned),
      review: detailValue(isFuture ? null : day.review),
      due: detailValue(day.due),
      durationText: day.durationSeconds === null ? '—' : formatDuration(day.durationSeconds)
    }
  },

  /** 点击某一列：选中并刷新详情卡 */
  onTapBar(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (isNaN(idx) || idx < 0 || idx >= this.data.days.length) return
    this.setData({
      selectedIndex: idx,
      detail: this.buildDetail(this.data.days[idx])
    })
  },

  /** 切换图表：两图口径一致、共用纵轴，按 AC-09 把选中日重置为今天并滚回居中 */
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) return
    const todayIndex = this.data.todayIndex
    this.setData(
      {
        activeTab: tab,
        selectedIndex: todayIndex,
        detail: this.buildDetail(this.data.days[todayIndex])
      },
      () => this.scrollToToday()
    )
  },

  /** 错误态重试 */
  onRetry() {
    this.loadStats()
  },

  /** 记录用户真实滚动位置（scroll-left 只在值变化时生效，需要它做对比） */
  onChartScroll(e) {
    this._actualScrollLeft = e.detail.scrollLeft
  },

  /** 初始定位：让"今天"这一列居中 */
  scrollToToday() {
    const idx = this.data.todayIndex
    if (idx < 0) return

    const query = wx.createSelectorQuery()
    query.select('.chart-scroll').boundingClientRect()
    query.exec((res) => {
      if (!res || !res[0]) return
      const viewportWidth = res[0].width // px
      if (viewportWidth <= 0) return

      let rpx2px = 1
      try {
        rpx2px = wx.getWindowInfo().windowWidth / 750
      } catch (e) {
        rpx2px = 1
      }

      const todayCenterPx = (idx + 0.5) * BAR_WIDTH * rpx2px
      const target = Math.max(0, todayCenterPx - viewportWidth / 2)
      const actual = typeof this._actualScrollLeft === 'number' ? this._actualScrollLeft : 0

      if (Math.abs(actual - target) < 1) return // 已在今天，无需移动

      // 目标值与 data 现值相同时 scroll-left 不会触发滚动（用户手动滑过之后常见），
      // 先把 data 同步成真实位置，再设目标值，保证一定生效
      if (this.data.scrollLeft === target) {
        this.setData({ scrollLeft: actual }, () => this.setData({ scrollLeft: target }))
        return
      }
      this.setData({ scrollLeft: target })
    })
  }
})
