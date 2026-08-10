// pages/correction-audit-detail/correction-audit-detail.js
const { correctionApi } = require('../../utils/api')

Page({
  data: {
    item: null,
    // 编辑表单
    showEdit: false,
    editForm: {
      kanji: '',
      kana: '',
      accent: '',
      wordType: '',
      remark: ''
    },
    submitting: false
  },

  onLoad(options) {
    if (options.data) {
      try {
        const item = JSON.parse(decodeURIComponent(options.data))
        this.setData({ item })
        this.initEditForm(item)
      } catch (e) {
        console.error('解析纠错数据失败:', e)
        wx.showToast({ title: '数据错误', icon: 'none' })
      }
    }
  },

  /** 初始化编辑表单 */
  initEditForm(item) {
    this.setData({
      editForm: {
        kanji: item.correctionKanji || item.wordKanji || '',
        kana: item.correctionKana || item.wordKana || '',
        accent: item.correctionAccent != null ? String(item.correctionAccent) : (item.wordAccent != null ? String(item.wordAccent) : ''),
        wordType: item.correctionWordType || item.wordWordType || '',
        remark: item.remark || ''
      }
    })
  },

  /** 切换编辑面板 */
  toggleEdit() {
    this.setData({ showEdit: !this.data.showEdit })
  },

  /** 编辑表单输入 */
  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  /** 审核通过 */
  async approve() {
    const { item, editForm } = this.data
    if (!item) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const data = {
        kanji: editForm.kanji.trim() || undefined,
        kana: editForm.kana.trim() || undefined,
        accent: editForm.accent ? parseInt(editForm.accent) : undefined,
        wordType: editForm.wordType || undefined,
        remark: editForm.remark || undefined
      }
      const res = await correctionApi.approve(item.id, data)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '已通过', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('审核通过失败:', e)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 拒绝 */
  reject() {
    const { item } = this.data
    if (!item) return

    wx.showModal({
      title: '驳回纠错',
      content: '确认驳回此纠错？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return
        this.setData({ submitting: true })
        wx.showLoading({ title: '处理中...' })
        try {
          const res = await correctionApi.reject(item.id, '')
          wx.hideLoading()
          if (res.code === 200) {
            wx.showToast({ title: '已驳回', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1500)
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('拒绝失败:', e)
          wx.showToast({ title: '操作失败', icon: 'none' })
        } finally {
          this.setData({ submitting: false })
        }
      }
    })
  }
})
