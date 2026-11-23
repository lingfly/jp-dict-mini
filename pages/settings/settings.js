// pages/settings/settings.js
const { userApi } = require('../../utils/api')
const fsrs = require('../../utils/fsrs/fsrs')
const fsrsParams = require('../../utils/fsrs/params')
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
    tempReasoningIndex: 0,
    // FSRS 用户参数（#004）：先按缓存/默认渲染，服务端返回后覆盖
    fsrsRetention: 0.9,
    fsrsMaximumInterval: 36500,
    fsrsRetentionIndex: 2,
    fsrsIntervalIndex: 5,
    retentionLabels: fsrsParams.RETENTION_LABELS,
    intervalLabels: fsrsParams.INTERVAL_LABELS,
    showRetentionPicker: false,
    tempRetentionIndex: 2,
    showIntervalPicker: false,
    tempIntervalIndex: 5
  },

  onLoad() {
    this.checkAdmin()
    this.syncFsrsView(fsrsParams.getCurrent())
    this.loadConfig()
  },

  /** 把 FSRS 参数同步到界面（值 + picker 下标） */
  syncFsrsView(parameters) {
    this.setData({
      fsrsRetention: parameters.requestRetention,
      fsrsMaximumInterval: parameters.maximumInterval,
      fsrsRetentionIndex: fsrsParams.indexOfRetention(parameters.requestRetention),
      fsrsIntervalIndex: fsrsParams.indexOfInterval(parameters.maximumInterval)
    })
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
        // 应用服务端 FSRS 参数；字段缺失/非法会逐项回落默认（#004 AC-13）
        this.syncFsrsView(fsrs.applyServerConfig(res.data))
      }
    } catch (error) {
      console.error('加载学习配置失败:', error)
      // 保留 onLoad 时按缓存/默认渲染的 FSRS 参数，不阻塞页面
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
  },

  // ===== FSRS 参数（#004）=====

  /**
   * 提交参数：部分更新，只传本次改动的字段
   * 失败时提示由 request.js 统一给出；本方法不重复 toast，也不改显示值
   * @param {Object} patch 发给后端的字段（1~2 项）
   * @param {Object} nextValues 保存成功后的完整本机参数
   * @returns {Promise<Boolean>}
   */
  async saveFsrsPatch(patch, nextValues) {
    try {
      const res = await userApi.updateFsrsConfig(patch)
      if (res && res.code === 200) {
        this.syncFsrsView(fsrs.applyLocalParameters(nextValues))
        return true
      }
      return false
    } catch (e) {
      // 网络失败：显示值保持不变即为回滚
      console.error('更新 FSRS 参数失败:', e)
      return false
    }
  },

  // 显示目标保持率选择器
  showRetentionPicker() {
    this.setData({
      showRetentionPicker: true,
      tempRetentionIndex: this.data.fsrsRetentionIndex
    })
  },

  onRetentionPickerChange(e) {
    this.setData({ tempRetentionIndex: e.detail.value[0] })
  },

  cancelRetentionPicker() {
    this.setData({ showRetentionPicker: false })
  },

  // 确认目标保持率：只提交本项
  async confirmRetentionPicker() {
    const index = this.data.tempRetentionIndex
    const value = fsrsParams.RETENTION_VALUES[index]
    this.setData({ showRetentionPicker: false })
    if (value === undefined || value === this.data.fsrsRetention) return

    const nextValues = Object.assign({}, fsrs.getParameters(), { requestRetention: value })
    const ok = await this.saveFsrsPatch({ fsrsRequestRetention: value }, nextValues)
    if (ok) {
      wx.showToast({ title: '已更新', icon: 'success' })
    }
  },

  // 显示最大间隔选择器
  showIntervalPicker() {
    this.setData({
      showIntervalPicker: true,
      tempIntervalIndex: this.data.fsrsIntervalIndex
    })
  },

  onIntervalPickerChange(e) {
    this.setData({ tempIntervalIndex: e.detail.value[0] })
  },

  cancelIntervalPicker() {
    this.setData({ showIntervalPicker: false })
  },

  // 确认最大间隔：只提交本项
  async confirmIntervalPicker() {
    const index = this.data.tempIntervalIndex
    const value = fsrsParams.INTERVAL_VALUES[index]
    this.setData({ showIntervalPicker: false })
    if (value === undefined || value === this.data.fsrsMaximumInterval) return

    const nextValues = Object.assign({}, fsrs.getParameters(), { maximumInterval: value })
    const ok = await this.saveFsrsPatch({ fsrsMaximumInterval: value }, nextValues)
    if (ok) {
      wx.showToast({ title: '已更新', icon: 'success' })
    }
  },

  // 恢复默认：显式提交两项（部分更新接口下必须两项都传）
  onRestoreFsrsDefaults() {
    wx.showModal({
      title: '恢复默认',
      content: '将目标保持率、最大间隔恢复为默认值（90% / 不限）？已排好的到期日不会改变。',
      confirmText: '恢复',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        const defaults = fsrsParams.DEFAULTS
        const ok = await this.saveFsrsPatch(
          {
            fsrsRequestRetention: defaults.requestRetention,
            fsrsMaximumInterval: defaults.maximumInterval
          },
          defaults
        )
        if (ok) {
          wx.showToast({ title: '已恢复默认', icon: 'success' })
        }
      }
    })
  }
})
