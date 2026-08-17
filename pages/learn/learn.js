// pages/learn/learn.js
const { reviewApi, wordApi } = require('../../utils/api')

Page({
  data: {
    loading: false,
    showAnswer: false,
    currentWord: null,
    wordType: '',
    hint: '',
    todayStats: {
      total: 0,
      completed: 0,
      remaining: 0
    },
    progressPercent: 0,
    startTime: 0 // 记录开始时间，用于计算响应时间
  },

  onLoad() {
    this.initLearn()
  },

  /**
   * 初始化学习流程
   */
  async initLearn() {
    this.setData({ loading: true })

    try {
      const hasWords = await this.fetchNextWord()
      if (!hasWords) {
        wx.showToast({
          title: '今日学习已完成',
          icon: 'success'
        })
      }
    } catch (error) {
      console.error('初始化学习失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 获取下一个单词
   */
  async fetchNextWord() {
    try {
      const res = await reviewApi.getNextWord()

      if (res.code === 200) {
        const data = res.data

        // 更新进度统计
        const stats = {
          total: data.progress.total,
          completed: data.progress.completed,
          remaining: data.progress.remaining
        }

        const percent = stats.total > 0
          ? Math.round((stats.completed / stats.total) * 100)
          : 0

        this.setData({
          todayStats: stats,
          progressPercent: percent
        })

        // 检查是否完成
        if (data.type === 'COMPLETED' || !data.wordId) {
          this.setData({ currentWord: null })
          return false
        }

        // 加载单词详情
        const word = await this.fetchWordDetail(data.wordId)
        if (word) {
          this.setData({
            currentWord: word,
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
        return res.data.word
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
      showAnswer: !this.data.showAnswer
    })
  },

  /**
   * 处理评分
   */
  async handleScore(e) {
    // 防重复点击：提交过程中 loading 为 true，忽略后续评分点击
    if (this.data.loading) return
    const score = parseInt(e.currentTarget.dataset.score)
    if (!this.data.currentWord) return

    // 计算响应时间
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

        // 获取下一个单词
        const hasNext = await this.fetchNextWord()
        if (!hasNext) {
          wx.showToast({
            title: '今日学习完成',
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
      'INTRADAY_TRIGGERED': '🔥 短间隔复习',
      'INTRADAY_UPCOMING': '⏰ 即将复习',
      'REGULAR_REVIEW': '📖 复习',
      'NEW_WORD': '✨ 新词',
      'COMPLETED': '✅ 完成'
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
   * 返回上一页
   */
  goBack() {
    wx.navigateBack()
  },

  /**
   * 返回首页
   */
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
