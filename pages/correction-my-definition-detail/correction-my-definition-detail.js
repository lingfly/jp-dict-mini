// pages/correction-my-definition-detail/correction-my-definition-detail.js
const { correctionApi } = require('../../utils/api')

Page({
  data: {
    correctionId: '',
    item: null,
    loading: true,
    // 是否显示底部操作按钮（仅 pending/rejected 状态可操作）
    canOperate: false,
    deleting: false,
    // 纠错明细（只读展示，按操作类型分组，含原始内容补充）
    correctionItems: []
  },

  onLoad(options) {
    const correctionId = options.correctionId || ''
    if (!correctionId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ correctionId })
    this.loadDetail()
  },

  onShow() {
    // 从修改页返回后刷新详情
    if (this.data.correctionId && this._loaded) {
      this.loadDetail()
    }
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const res = await correctionApi.getDefinitionDetail(this.data.correctionId)
      if (res.code === 200) {
        const correctionItems = this.enrichCorrectionItems(res.data)
        this.setData({
          item: res.data,
          correctionItems,
          canOperate: res.data.status === 'pending' || res.data.status === 'rejected'
        })
        this._loaded = true
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载释义纠错详情失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 补充纠错明细的原始数据（从 originalDefinitions 中查找） */
  enrichCorrectionItems(data) {
    const originalDefinitions = data.originalDefinitions || []
    const correctionItems = data.correctionItems || []

    // 构建原始释义的 Map，方便查找
    const originalDefMap = {}
    originalDefinitions.forEach(def => {
      originalDefMap[def.id] = def
    })

    return correctionItems.map(ci => {
      const enriched = { ...ci }

      // UPDATE 操作：补充原内容
      if (ci.operationType === 'UPDATE' && ci.definitionId) {
        const originalDef = originalDefMap[ci.definitionId]
        if (originalDef) {
          // 补充原释义内容
          enriched.originalDefinitionCn = originalDef.definitionCn
          enriched.originalUsage = originalDef.usage
          enriched.originalNote = originalDef.note

          // 补充例句的原内容
          if (ci.examples && ci.examples.length > 0) {
            const originalExamplesMap = {}
            ;(originalDef.examples || []).forEach(ex => {
              originalExamplesMap[ex.id] = ex
            })

            enriched.examples = ci.examples.map(ex => {
              if (ex.operationType === 'UPDATE' && ex.id) {
                const originalEx = originalExamplesMap[ex.id]
                if (originalEx) {
                  return {
                    ...ex,
                    originalSentenceJp: originalEx.sentenceJp,
                    originalSentenceKana: originalEx.sentenceKana,
                    originalSentenceCn: originalEx.sentenceCn
                  }
                }
              } else if (ex.operationType === 'DELETE' && ex.id) {
                // DELETE 例句：补充被删除例句的完整内容
                const originalEx = originalExamplesMap[ex.id]
                if (originalEx) {
                  return {
                    ...ex,
                    sentenceJp: originalEx.sentenceJp,
                    sentenceKana: originalEx.sentenceKana,
                    sentenceCn: originalEx.sentenceCn,
                    sortOrder: originalEx.sortOrder
                  }
                }
              }
              return ex
            })
          }
        }
      }

      // DELETE 操作：补充被删除的完整内容
      if (ci.operationType === 'DELETE' && ci.definitionId) {
        const originalDef = originalDefMap[ci.definitionId]
        if (originalDef) {
          enriched.definitionCn = originalDef.definitionCn
          enriched.usage = originalDef.usage
          enriched.note = originalDef.note
          enriched.examples = originalDef.examples
        }
      }

      return enriched
    })
  },

  /** 撤销（删除）纠错 */
  withdraw() {
    const { correctionId, deleting } = this.data
    if (!correctionId || deleting) return

    wx.showModal({
      title: '撤销纠错',
      content: '确定撤销此纠错吗？撤销后将删除该纠错记录。',
      confirmText: '撤销',
      confirmColor: '#F56C6C',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ deleting: true })
        wx.showLoading({ title: '撤销中...', mask: true })
        try {
          const resp = await correctionApi.deleteDefinition(correctionId)
          wx.hideLoading()
          if (resp.code === 200) {
            wx.showToast({ title: '已撤销', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1500)
          } else {
            wx.showToast({ title: resp.message || '撤销失败', icon: 'none' })
            this.setData({ deleting: false })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('撤销释义纠错失败:', e)
          wx.showToast({ title: '撤销失败', icon: 'none' })
          this.setData({ deleting: false })
        }
      }
    })
  },

  /** 进入修改页 */
  goEdit() {
    const { correctionId } = this.data
    if (!correctionId) return
    wx.navigateTo({
      url: `/pages/correction-definition-edit/correction-definition-edit?correctionId=${correctionId}`
    })
  }
})
