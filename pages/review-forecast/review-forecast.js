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

const BAR_WIDTH = 82 // rpx，列宽初值；首帧渲染后按可视宽度重算（见 layoutChart）
const VISIBLE_DAYS = 7 // 一屏天数：前 3 + 今天 + 后 3
const SIDE_DAYS = 3 // 今天左右各展示几天
const PLOT_HEIGHT_FALLBACK = 360 // rpx，绘图区高度兜底值（量到剩余高度前先用它渲染）
const LABEL_BLOCK_HEIGHT = 86 // rpx，横轴标签区高度（.bar-label 的 margin-top 12 + height 74）
const MIN_PLOT_HEIGHT = 200 // rpx，绘图区最小高度（小屏兜底，宁可略超一屏也不压扁柱子）
const MAX_TICK_COUNT = 10 // 刻度条数上限（含顶与底，含顶空后实际 6~10 条）
const HEADROOM = 0.9 // 最高柱最多用到绘图区 90% 高度，顶部留 10% 空（#011）
const STEP_LADDER = [1, 2, 3, 4, 5, 6, 8, 10] // 刻度步长取档（#010）
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
 * 向上取到"好看"的刻度步长，保证刻度是整数、读数不费劲
 *
 * 阶梯为 1/2/3/4/5/6/8/10 × 10^n（#010）：
 *   只有 1/2/5 时，max/9 = 27.8 会被抬到 50，顶刻度虚高到 1.8 倍（250 的要画到 450）；
 *   补上 3/4/6/8 后最坏虚高从 2.5 倍降到 1.33 倍，刻度仍是整数。
 * 例：max/9 = 45 -> 50；max/9 = 27.8 -> 30；max/9 = 3.2 -> 4；max/9 = 0.7 -> 1
 */
function niceStep(rawStep) {
  if (rawStep <= 1) return 1
  const exp = Math.floor(Math.log10(rawStep))
  const base = Math.pow(10, exp)
  const f = rawStep / base
  const nice = STEP_LADDER.find((v) => f <= v) || 10
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

/**
 * 段高度：按纵轴上限换算成绘图区百分比（0.1% 粒度）
 * 用百分比而不是 rpx：绘图区高度由 CSS 弹性撑开（一屏不滚动），JS 不必知道像素高度。
 * null / 0 -> 0（不画）；过矮的段由 .bar-seg 的 min-height 兜底可见
 */
function segPct(value, niceMax) {
  if (value === null || value <= 0) return 0
  return Math.max(0.1, Math.round((value / niceMax) * 1000) / 10)
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
    barsCognitive: [], // 认知图柱段高度（占绘图区的百分比）
    barsReviewNew: [], // 新学复习图柱段高度（百分比）
    yTicks: [], // 刻度值，从上到下（6~10 个）
    gridPct: 11.111, // 背景横线间距（%，随刻度段数变化）
    chartWidth: 0, // rpx
    barWidth: BAR_WIDTH,
    barHeightRpx: PLOT_HEIGHT_FALLBACK, // 绘图区高度（按一屏剩余空间算，见 layoutChart）
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
    // 顶刻度：先按「最高柱只用 90% 高度」反推需要的上限，再向上取成整数步长。
    // 刻度条数不再写死 10 条：步长取整后按需等分（6~10 条），顶刻度才能同时贴近数据又留出顶空。
    const targetMax = maxTotal / HEADROOM
    const step = niceStep(targetMax / (MAX_TICK_COUNT - 1))
    const intervals = Math.max(1, Math.ceil(targetMax / step))
    const niceMax = step * intervals

    const barsCognitive = days.map((d) => ({
      date: d.date,
      labelChars: d.labelChars,
      isToday: d.isToday,
      easyPct: segPct(d.easy, niceMax),
      goodPct: segPct(d.good, niceMax),
      hardPct: segPct(d.hard, niceMax),
      forgotPct: segPct(d.forgot, niceMax),
      duePct: segPct(d.due, niceMax)
    }))

    const barsReviewNew = days.map((d) => ({
      date: d.date,
      labelChars: d.labelChars,
      isToday: d.isToday,
      newPct: segPct(d.newLearned, niceMax),
      reviewPct: segPct(d.review, niceMax),
      duePct: segPct(d.due, niceMax)
    }))

    // 刻度：顶部 niceMax，底部 0，按 step 均分（共 intervals + 1 条）
    const yTicks = []
    for (let i = 0; i <= intervals; i++) {
      yTicks.push(niceMax - step * i)
    }
    // 背景横线间距：与刻度一一对齐（intervals 格）
    const gridPct = Math.round((100 / intervals) * 1000) / 1000

    this.setData(
      {
        loadState: 'ready',
        days,
        barsCognitive,
        barsReviewNew,
        yTicks,
        gridPct,
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
      () => this.layoutChart()
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
    this.setData(
      {
        selectedIndex: idx,
        detail: this.buildDetail(this.data.days[idx])
      },
      // 未来日会多一行「这一天还没到」，详情卡变高 → 图表可用高度变矮，需要重算
      () => this.resizeChart()
    )
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
      () => this.layoutChart()
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

  /** rpx -> px 的换算比例（拿不到窗口信息时按 1:1 兜底） */
  getRpx2Px() {
    try {
      return wx.getWindowInfo().windowWidth / 750 || 1
    } catch (e) {
      return 1
    }
  },

  /**
   * 只重算绘图区高度，不动横向滚动位置。
   * 详情卡内容变化（未来日多一行提示）会改变图表可用高度，需要跟着调。
   */
  resizeChart() {
    const query = wx.createSelectorQuery()
    query.select('.chart-wrap').boundingClientRect()
    query.exec((res) => {
      const wrapHeight = res && res[0] && res[0].height > 0 ? res[0].height : 0
      if (!wrapHeight) return
      const barHeightRpx = Math.max(
        MIN_PLOT_HEIGHT,
        Math.floor(wrapHeight / this.getRpx2Px()) - LABEL_BLOCK_HEIGHT
      )
      if (barHeightRpx !== this.data.barHeightRpx) this.setData({ barHeightRpx })
    })
  },

  /**
   * 布局（宽 + 高）与初始定位：让"今天"居中，一屏正好是「前 3 天 + 今天 + 后 3 天」，
   * 纵向也一屏装完（图表吃掉剩余高度，页面不上下滚动）。
   *
   * 宽度：列宽不能写死（可用宽度随机型浮动），由可视宽度反推（viewportRpx ÷ 7），
   *       "今天居中"就等于"把今天左侧第 3 列贴住视口左边缘"。
   * 高度：绘图区 = 图表区可用高度 − 横轴标签区高度，量出来写回 data（行内 style）。
   */
  layoutChart() {
    const idx = this.data.todayIndex
    if (idx < 0) return

    const query = wx.createSelectorQuery()
    query.select('.chart-scroll').boundingClientRect()
    query.select('.chart-wrap').boundingClientRect()
    query.exec((res) => {
      if (!res || !res[0]) return
      const viewportWidth = res[0].width // px
      if (viewportWidth <= 0) return

      const rpx2px = this.getRpx2Px()

      // 列宽反推：保留 1 位小数即可铺满，误差 < 0.05px
      const barWidth = Math.round((viewportWidth / rpx2px / VISIBLE_DAYS) * 10) / 10
      const chartWidth = Math.round(barWidth * this.data.days.length)
      // 今天居中 <=> 今天左侧第 SIDE_DAYS 列对齐视口左边缘
      const target = Math.max(0, (idx - SIDE_DAYS) * barWidth * rpx2px)

      // 绘图区高度：图表区（.chart-wrap 由 flex 分配）减去标签区，保证整页一屏。
      // 向下取整：宁可少 1rpx，也不要让柱区内容比可用高度高出一点而挤出滚动
      const wrapHeight = res[1] && res[1].height > 0 ? res[1].height : 0
      const barHeightRpx = wrapHeight > 0
        ? Math.max(MIN_PLOT_HEIGHT, Math.floor(wrapHeight / rpx2px) - LABEL_BLOCK_HEIGHT)
        : this.data.barHeightRpx

      const sizeChanged =
        this.data.barWidth !== barWidth ||
        this.data.chartWidth !== chartWidth ||
        this.data.barHeightRpx !== barHeightRpx

      const actual = typeof this._actualScrollLeft === 'number' ? this._actualScrollLeft : 0
      if (!sizeChanged && Math.abs(actual - target) < 1) return // 尺寸与位置都对，无需动

      const alignScroll = () => {
        this._actualScrollLeft = target
        // scroll-left 只在值变化时生效：目标值与 data 现值相同（用户手动滑过之后）时先归零再下发
        if (Math.abs(this.data.scrollLeft - target) < 1) {
          this.setData({ scrollLeft: 0 }, () => this.setData({ scrollLeft: target }))
          return
        }
        this.setData({ scrollLeft: target })
      }

      if (sizeChanged) {
        this.setData({ barWidth, chartWidth, barHeightRpx }, alignScroll)
      } else {
        alignScroll()
      }
    })
  }
})
