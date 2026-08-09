// pages/settings/settings.js
const { userApi } = require('../../utils/api')

Page({
  data: {
    learningConfig: {
      dailyNewWords: 10,
      voiceConfig: false,
      collapseDefinitionOnQuery: false,
      collapseDefinitionOnReview: false
    },
    loading: true
  },

  onLoad() {
    this.loadConfig()
  },

  async loadConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.setData({
          learningConfig: {
            dailyNewWords: res.data.dailyNewWords || 10,
            voiceConfig: res.data.voiceConfig != null ? !!res.data.voiceConfig : false,
            collapseDefinitionOnQuery: res.data.collapseDefinitionOnQuery || false,
            collapseDefinitionOnReview: res.data.collapseDefinitionOnReview || false
          },
          loading: false
        })
      }
    } catch (error) {
      console.error('加载学习配置失败:', error)
      this.setData({ loading: false })
    }
  },

  // 修改每日新词数量
  async onChangeDailyNewWords(e) {
    const value = parseInt(e.detail.value)
    if (isNaN(value) || value < 1 || value > 100) {
      wx.showToast({ title: '请输入1-100之间的数字', icon: 'none' })
      return
    }
    try {
      const res = await userApi.updateDailyNewWords(value)
      if (res.code === 200) {
        this.setData({ 'learningConfig.dailyNewWords': value })
        wx.showToast({ title: '已更新', icon: 'success' })
      }
    } catch (error) {
      console.error('更新每日新词数量失败:', error)
    }
  },

  // 切换单词发音
  async onToggleVoiceConfig(e) {
    const value = e.detail.value
    try {
      const res = await userApi.updateVoiceConfig(value ? 1 : 0)
      if (res.code === 200) {
        this.setData({ 'learningConfig.voiceConfig': value })
      }
    } catch (error) {
      console.error('更新发音配置失败:', error)
      this.setData({ 'learningConfig.voiceConfig': !value })
    }
  },

  // 切换查询时释义折叠
  async onToggleCollapseOnQuery(e) {
    const value = e.detail.value
    try {
      const res = await userApi.updateCollapseDefinitionOnQuery(value)
      if (res.code === 200) {
        this.setData({ 'learningConfig.collapseDefinitionOnQuery': value })
      }
    } catch (error) {
      console.error('更新查询时释义折叠失败:', error)
      this.setData({ 'learningConfig.collapseDefinitionOnQuery': !value })
    }
  },

  // 切换复习时释义折叠
  async onToggleCollapseOnReview(e) {
    const value = e.detail.value
    try {
      const res = await userApi.updateCollapseDefinitionOnReview(value)
      if (res.code === 200) {
        this.setData({ 'learningConfig.collapseDefinitionOnReview': value })
      }
    } catch (error) {
      console.error('更新复习时释义折叠失败:', error)
      this.setData({ 'learningConfig.collapseDefinitionOnReview': !value })
    }
  }
})
