// pages/review-forecast/review-forecast.js
const { fsrsApi } = require('../../utils/api')

const CHART_HEIGHT = 720 // rpx，绘图区高度
const BAR_WIDTH = 72 // rpx，每根柱子宽度（含列间隔）

/** 本地时区 yyyy-MM-dd */
function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** yyyy-MM-dd -> 本地时区当天 0 点 */
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 相对今天的天数 -> 横坐标标注 */
function dayLabel(offset) {
  if (offset === -2) return '前天'
  if (offset === -1) return '昨天'
  if (offset === 0) return '今天'
  if (offset === 1) return '明天'
  if (offset === 2) return '后天'
  if (offset < -2) return `${-offset}天前`
  return `${offset}天后`
}

/** 将横坐标标签拆组：连续数字合并为一组（"30天前" -> ["30","天","前"]），其余单字 */
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

/** 向上取到"好看"的数（1/2/5 × 10^n），用于纵坐标最大值 */
function niceCeil(n) {
  if (n <= 0) return 1
  const exp = Math.floor(Math.log10(n))
  const base = Math.pow(10, exp)
  const f = n / base
  let nice
  if (f <= 1) nice = 1
  else if (f <= 2) nice = 2
  else if (f <= 5) nice = 5
  else nice = 10
  return nice * base
}

Page({
  data: {
    loading: true,
    bars: [],      // [{ date, label, labelChars, isToday, newH, reviewH, hardH, dueH, forgotH }]
    yTicks: [],    // 10 个 Y 轴刻度值，从上到下（含顶/底）
    chartWidth: 0, // rpx，图表总宽度（= 柱子数 * BAR_WIDTH）
    barWidth: BAR_WIDTH,
    todayIndex: -1, // "今天"在 bars 中的索引
    scrollLeft: 0,  // 初始横向滚动位置（px），使今天居中
    todayStats: { // 今日各项统计，用于图例数字
      forgot: 0,
      hard: 0,
      good: 0,
      easy: 0,
      due: 0
    }
  },

  onLoad() {
    this.loadForecast()
  },

  onPullDownRefresh() {
    this.loadForecast().then(() => wx.stopPullDownRefresh())
  },

  async loadForecast() {
    this.setData({ loading: true })
    try {
      const res = await fsrsApi.getDueForecast()
      if (res.code === 200 && Array.isArray(res.data)) {
        this.buildBars(res.data)
      } else {
        this.setData({ bars: [], yTicks: [], chartWidth: 0 })
      }
    } catch (e) {
      console.error('加载学习情况失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 将后端 DailyReviewStatResponse[] 处理为堆叠柱状图数据
   * 柱体 = 新学 + 复习 + 待学（按 rpx 高度）
   */
  buildBars(list) {
    const todayStr = formatDate(new Date())

    // 找出今日数据（用于底部图例）
    const todayItem = list.find(d => d.date === todayStr) || {}
    const todayStats = {
      forgot: todayItem.forgotCount || 0,
      hard: todayItem.hardCount || 0,
      good: todayItem.goodCount || 0,
      easy: todayItem.easyCount || 0,
      due: todayItem.dueCount || 0
    }

    const items = list.map(d => {
      const newLearned = d.newLearnedCount || 0
      // 过去：reviewCount = 实际复习数
      // 未来：reviewCount = 预计待复习数
      // 今天：reviewCount 为空，用评分之和
      const ratingSum = (d.forgotCount || 0) + (d.hardCount || 0) + (d.goodCount || 0) + (d.easyCount || 0)
      const review = (d.reviewCount != null ? d.reviewCount : ratingSum) || 0
      const due = d.dueCount || 0
      const forgot = d.forgotCount || 0
      const hard = d.hardCount || 0
      const dayOffset = Math.round((parseDate(d.date) - parseDate(todayStr)) / 86400000)
      return {
        date: d.date,
        newLearned,
        review,
        due,
        forgot,
        hard,
        total: newLearned + review + due,
        dayOffset,
        label: dayLabel(dayOffset),
        labelChars: splitLabel(dayLabel(dayOffset)),
        isToday: dayOffset === 0
      }
    })

    const maxTotal = Math.max(1, ...items.map(i => i.total))
    const niceMax = niceCeil(maxTotal)
    const scale = CHART_HEIGHT / niceMax

    const bars = items.map(i => ({
      date: i.date,
      label: i.label,
      labelChars: i.labelChars,
      isToday: i.isToday,
      newH: Math.round(i.newLearned * scale),
      reviewH: Math.round(i.review * scale),
      hardH: Math.round(i.hard * scale),
      dueH: Math.round(i.due * scale),
      forgotH: Math.round(i.forgot * scale)
    }))

    // 10 条刻度线：顶部 niceMax，底部 0，共 9 段均分
    const yTicks = []
    for (let i = 0; i < 10; i++) {
      yTicks.push(Math.round(niceMax * (9 - i) / 9))
    }

    this.setData({
      bars,
      yTicks,
      chartWidth: bars.length * BAR_WIDTH,
      todayIndex: bars.findIndex(b => b.isToday),
      todayStats
    }, () => this.scrollToToday())
  },

  /**
   * 初始定位：让"今天"这一列居中显示
   */
  scrollToToday() {
    const idx = this.data.todayIndex
    if (idx < 0) return

    const query = wx.createSelectorQuery()
    query.select('.chart-scroll').boundingClientRect()
    query.exec((res) => {
      if (!res || !res[0]) return
      const viewportWidth = res[0].width // px
      if (viewportWidth <= 0) return

      // rpx -> px 换算
      let rpx2px = 1
      try {
        rpx2px = wx.getSystemInfoSync().windowWidth / 750
      } catch (e) {
        rpx2px = 1
      }

      const todayCenterPx = (idx + 0.5) * BAR_WIDTH * rpx2px
      const scrollLeft = Math.max(0, todayCenterPx - viewportWidth / 2)
      this.setData({ scrollLeft })
    })
  }
})
