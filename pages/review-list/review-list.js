// pages/review-list/review-list.js
const { reviewApi, wordApi } = require('../../utils/api')

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
    startTime: 0
  },

  onLoad() {
    this.initReview()
  },

  onShow() {
    // 每次显示时刷新今日复习数量
    this.fetchLearningStatus()
  },

  /**
   * 初始化复习流程
   */
  async initReview() {
    this.setData({ loading: true })

    try {
      // 并行获取学习状态和第一个复习单词
      await Promise.all([
        this.fetchLearningStatus(),
        this.fetchNextWord()
      ])
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
   * 获取学习状态（今日需复习数量）
   */
  async fetchLearningStatus() {
    try {
      const res = await reviewApi.getLearningStatus()

      if (res.code === 200) {
        const data = res.data
        this.setData({
          dueCount: data.dueCount || 0
        })

        // 更新 tabBar 角标
        if (data.dueCount > 0) {
          wx.setTabBarBadge({
            index: 2, // 复习 tab 是第3个（0-based index: 2）
            text: String(data.dueCount)
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
   * 获取下一个复习单词
   */
  async fetchNextWord() {
    try {
      const res = await reviewApi.getNextWord()

      if (res.code === 200) {
        const data = res.data

        // 更新进度统计
        const stats = {
          total: data.progress ? data.progress.total : 0,
          completed: data.progress ? data.progress.completed : 0,
          remaining: data.progress ? data.progress.remaining : 0
        }

        const percent = stats.total > 0
          ? Math.round((stats.completed / stats.total) * 100)
          : 0

        this.setData({
          todayStats: stats,
          progressPercent: percent
        })

        // 检查是否全部完成
        if (data.type === 'COMPLETED' || !data.wordId) {
          this.setData({ currentWord: null })
          return false
        }

        // 加载单词详情
        const detail = await this.fetchWordDetail(data.wordId)
        if (detail && detail.word) {
          this.setData({
            currentWord: detail.word,
            wordDetail: detail,
            expandedSense: [],
            wordType: data.type,
            hint: data.hint || '',
            startTime: Date.now()
          })
          return true
        }
      }

      return false
    } catch (error) {
      console.error('获取下一个单词失败:', error)
      throw error
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
   * 切换答案显示
   */
  toggleAnswer() {
    this.setData({
      showAnswer: !this.data.showAnswer,
      expandedSense: []
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
   * 数字转圆圈数字（音调）
   */
  toCircle(num) {
    const circleNums = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
    if (num >= 0 && num <= 10) return circleNums[num]
    return String(num)
  },

  /**
   * 处理评分
   */
  async handleScore(e) {
    const score = parseInt(e.currentTarget.dataset.score)
    if (!this.data.currentWord) return

    const responseTimeMs = Date.now() - this.data.startTime

    this.setData({ loading: true })

    try {
      const res = await reviewApi.submitReview({
        wordId: this.data.currentWord.id,
        score: score,
        responseTimeMs: responseTimeMs
      })

      if (res.code === 200) {
        // 重置答案显示状态
        this.setData({ showAnswer: false })

        // 刷新学习状态（更新角标）
        this.fetchLearningStatus()

        // 获取下一个单词
        const hasNext = await this.fetchNextWord()
        if (!hasNext) {
          wx.showToast({
            title: '今日复习完成',
            icon: 'success'
          })
        }
      } else {
        wx.showToast({
          title: res.message || '提交失败',
          icon: 'none'
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
  }
})