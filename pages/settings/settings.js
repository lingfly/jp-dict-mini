// pages/settings/settings.js
const { userApi } = require('../../utils/api')
const app = getApp()

Page({
  data: {
    isAdmin: false,
    learningConfig: {
      dailyNewWords: 10,
      voiceConfig: false,
      collapseDefinitionOnQuery: false,
      collapseDefinitionOnReview: false,
      aiDictModel: '',
      aiDictTemperature: '',
      aiDictThinking: false,
      aiDictReasoningEffort: ''
    },
    loading: true,
    modelOptions: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    showModelPicker: false,
    tempModelIndex: 0,
    reasoningEffortOptions: ['low', 'medium', 'high', 'xhigh', 'max'],
    showReasoningPicker: false,
    tempReasoningIndex: 0
  },

  onLoad() {
    this.checkAdmin()
    this.loadConfig()
  },

  checkAdmin() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
    const isAdmin = userInfo && userInfo.userType === 1
    this.setData({ isAdmin })
  },

  async loadConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.setData({
          learningConfig: {
            dailyNewWords: res.data.dailyNewWords || 10,
            voiceConfig: res.data.voiceConfig != null ? !!res.data.voiceConfig : false,
            collapseDefinitionOnQuery: res.data.collapseDefinitionOnQuery === 1,
            collapseDefinitionOnReview: res.data.collapseDefinitionOnReview === 1,
            aiDictModel: res.data.aiDictModel || '',
            aiDictTemperature: res.data.aiDictTemperature != null ? String(res.data.aiDictTemperature) : '',
            aiDictThinking: res.data.aiDictThinking === 1,
            aiDictReasoningEffort: res.data.aiDictReasoningEffort || ''
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
    const boolValue = e.detail.value
    const intValue = boolValue ? 1 : 0
    try {
      const res = await userApi.updateCollapseDefinitionOnQuery(intValue)
      if (res.code === 200) {
        this.setData({ 'learningConfig.collapseDefinitionOnQuery': boolValue })
      }
    } catch (error) {
      console.error('更新查询时释义折叠失败:', error)
      this.setData({ 'learningConfig.collapseDefinitionOnQuery': !boolValue })
    }
  },

  // 切换复习时释义折叠
  async onToggleCollapseOnReview(e) {
    const boolValue = e.detail.value
    const intValue = boolValue ? 1 : 0
    try {
      const res = await userApi.updateCollapseDefinitionOnReview(intValue)
      if (res.code === 200) {
        this.setData({ 'learningConfig.collapseDefinitionOnReview': boolValue })
      }
    } catch (error) {
      console.error('更新复习时释义折叠失败:', error)
      this.setData({ 'learningConfig.collapseDefinitionOnReview': !boolValue })
    }
  },

  // 显示模型选择器
  showModelPicker() {
    const currentModel = this.data.learningConfig.aiDictModel
    const modelOptions = this.data.modelOptions
    const tempModelIndex = currentModel ? modelOptions.indexOf(currentModel) : 0
    this.setData({
      showModelPicker: true,
      tempModelIndex: tempModelIndex >= 0 ? tempModelIndex : 0
    })
  },

  // 模型选择器变化
  onModelPickerChange(e) {
    this.setData({ tempModelIndex: e.detail.value })
  },

  // 取消模型选择
  cancelModelPicker() {
    this.setData({ showModelPicker: false })
  },

  // 确认模型选择
  async confirmModelPicker() {
    const modelIndex = this.data.tempModelIndex
    const selectedModel = this.data.modelOptions[modelIndex]
    this.setData({ showModelPicker: false })

    try {
      const { aiDictTemperature, aiDictThinking, aiDictReasoningEffort } = this.data.learningConfig
      const res = await userApi.updateAiDictConfig(
        selectedModel,
        aiDictTemperature ? parseFloat(aiDictTemperature) : null,
        aiDictThinking ? 1 : 0,
        aiDictReasoningEffort || null
      )
      if (res.code === 200) {
        this.setData({ 'learningConfig.aiDictModel': selectedModel })
        wx.showToast({ title: '已更新', icon: 'success' })
      }
    } catch (error) {
      console.error('更新模型配置失败:', error)
    }
  },

  // 修改温度参数
  async onChangeTemperature(e) {
    const value = e.detail.value.trim()

    // 允许为空
    if (value === '') {
      try {
        const { aiDictModel, aiDictThinking, aiDictReasoningEffort } = this.data.learningConfig
        const res = await userApi.updateAiDictConfig(
          aiDictModel || null,
          null,
          aiDictThinking ? 1 : 0,
          aiDictReasoningEffort || null
        )
        if (res.code === 200) {
          this.setData({ 'learningConfig.aiDictTemperature': '' })
          wx.showToast({ title: '已清除', icon: 'success' })
        }
      } catch (error) {
        console.error('清除温度参数失败:', error)
      }
      return
    }

    const numValue = parseFloat(value)
    if (isNaN(numValue) || numValue < 0 || numValue > 2) {
      wx.showToast({ title: '请输入0.00-2.00之间的数字', icon: 'none' })
      // 恢复原值
      this.setData({ 'learningConfig.aiDictTemperature': this.data.learningConfig.aiDictTemperature })
      return
    }

    try {
      const { aiDictModel, aiDictThinking, aiDictReasoningEffort } = this.data.learningConfig
      const res = await userApi.updateAiDictConfig(
        aiDictModel || null,
        numValue,
        aiDictThinking ? 1 : 0,
        aiDictReasoningEffort || null
      )
      if (res.code === 200) {
        this.setData({ 'learningConfig.aiDictTemperature': String(numValue) })
        wx.showToast({ title: '已更新', icon: 'success' })
      }
    } catch (error) {
      console.error('更新温度参数失败:', error)
    }
  },

  // 切换思维模式
  async onToggleThinking(e) {
    const value = e.detail.value
    try {
      const { aiDictModel, aiDictTemperature, aiDictReasoningEffort } = this.data.learningConfig
      const res = await userApi.updateAiDictConfig(
        aiDictModel || null,
        aiDictTemperature ? parseFloat(aiDictTemperature) : null,
        value ? 1 : 0,
        aiDictReasoningEffort || null
      )
      if (res.code === 200) {
        this.setData({ 'learningConfig.aiDictThinking': value })
      }
    } catch (error) {
      console.error('更新思维模式失败:', error)
      this.setData({ 'learningConfig.aiDictThinking': !value })
    }
  },

  // 显示推理强度选择器
  showReasoningPicker() {
    const currentReasoning = this.data.learningConfig.aiDictReasoningEffort
    const reasoningEffortOptions = this.data.reasoningEffortOptions
    const tempReasoningIndex = currentReasoning ? reasoningEffortOptions.indexOf(currentReasoning) : 1 // 默认 medium
    this.setData({
      showReasoningPicker: true,
      tempReasoningIndex: tempReasoningIndex >= 0 ? tempReasoningIndex : 1
    })
  },

  // 推理强度选择器变化
  onReasoningPickerChange(e) {
    this.setData({ tempReasoningIndex: e.detail.value })
  },

  // 取消推理强度选择
  cancelReasoningPicker() {
    this.setData({ showReasoningPicker: false })
  },

  // 确认推理强度选择
  async confirmReasoningPicker() {
    const reasoningIndex = this.data.tempReasoningIndex
    const selectedReasoning = this.data.reasoningEffortOptions[reasoningIndex]
    this.setData({ showReasoningPicker: false })

    try {
      const { aiDictModel, aiDictTemperature, aiDictThinking } = this.data.learningConfig
      const res = await userApi.updateAiDictConfig(
        aiDictModel || null,
        aiDictTemperature ? parseFloat(aiDictTemperature) : null,
        aiDictThinking ? 1 : 0,
        selectedReasoning
      )
      if (res.code === 200) {
        this.setData({ 'learningConfig.aiDictReasoningEffort': selectedReasoning })
        wx.showToast({ title: '已更新', icon: 'success' })
      }
    } catch (error) {
      console.error('更新推理强度失败:', error)
    }
  }
})
