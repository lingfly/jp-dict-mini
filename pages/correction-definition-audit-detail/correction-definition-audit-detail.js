// pages/correction-definition-audit-detail/correction-definition-audit-detail.js
const { adminApi } = require('../../utils/api')

Page({
  data: {
    correctionId: '',
    item: null,
    loading: true,
    submitting: false,
    // 纠错明细（只读展示，按操作类型分组）
    correctionItems: [],
    // 拒绝原因
    showReject: false,
    rejectComment: ''
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

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const res = await adminApi.getDefinitionCorrection(this.data.correctionId)
      if (res.code === 200) {
        const correctionItems = this.enrichCorrectionItems(res.data)
        this.setData({
          item: res.data,
          correctionItems
        })
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

  // ==================== 提交 ====================

  /** 采纳释义纠错 */
  approve() {
    if (this.data.submitting) return
    const { correctionId, correctionItems } = this.data

    if (correctionItems.length === 0) {
      wx.showToast({ title: '纠错内容为空', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })
    adminApi.approveDefinitionCorrection(correctionId, { items: correctionItems })
      .then((res) => {
        wx.hideLoading()
        if (res.code === 200) {
          wx.showToast({ title: '已采纳', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          wx.showToast({ title: res.message || '操作失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      })
      .catch((e) => {
        wx.hideLoading()
        console.error('采纳失败:', e)
        wx.showToast({ title: '操作失败', icon: 'none' })
        this.setData({ submitting: false })
      })
  },

  /** 展开拒绝输入 */
  openReject() {
    this.setData({ showReject: true, rejectComment: '' })
  },

  /** 取消拒绝 */
  cancelReject() {
    this.setData({ showReject: false, rejectComment: '' })
  },

  /** 拒绝原因输入 */
  onRejectCommentInput(e) {
    this.setData({ rejectComment: e.detail.value })
  },

  /** 确认拒绝 */
  confirmReject() {
    if (this.data.submitting) return
    const { correctionId, rejectComment } = this.data
    if (!rejectComment.trim()) {
      wx.showToast({ title: '请填写拒绝原因', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })
    adminApi.rejectDefinitionCorrection(correctionId, { reviewComment: rejectComment.trim() })
      .then((res) => {
        wx.hideLoading()
        if (res.code === 200) {
          wx.showToast({ title: '已拒绝', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          wx.showToast({ title: res.message || '操作失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      })
      .catch((e) => {
        wx.hideLoading()
        console.error('拒绝失败:', e)
        wx.showToast({ title: '操作失败', icon: 'none' })
        this.setData({ submitting: false })
      })
  }
})
