// pages/correction-audit-detail/correction-audit-detail.js
const { correctionApi } = require('../../utils/api')
const accentUtil = require('../../utils/accent')

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
    // 音调校验提示
    editAccentError: '',
    submitting: false
  },

  onLoad(options) {
    if (options.data) {
      try {
        const item = this.decorateItem(JSON.parse(decodeURIComponent(options.data)))
        this.setData({ item })
        this.initEditForm(item)
      } catch (e) {
        console.error('解析纠错数据失败:', e)
        wx.showToast({ title: '数据错误', icon: 'none' })
      }
    }
  },

  /** 补充音调展示字段（后端 accent 为数组，需转文本并判断是否变更） */
  decorateItem(item) {
    if (!item) return item
    const hasCorrection = item.correctionAccent != null
    return {
      ...item,
      wordAccentText: accentUtil.toText(item.wordAccent),
      correctionAccentText: accentUtil.toText(hasCorrection ? item.correctionAccent : item.wordAccent),
      accentChanged: hasCorrection && !accentUtil.equals(item.correctionAccent, item.wordAccent)
    }
  },

  /** 初始化编辑表单 */
  initEditForm(item) {
    this.setData({
      editForm: {
        kanji: item.correctionKanji || item.wordKanji || '',
        kana: item.correctionKana || item.wordKana || '',
        accent: accentUtil.toText(item.correctionAccent != null ? item.correctionAccent : item.wordAccent),
        wordType: item.correctionWordType || item.wordWordType || '',
        remark: item.remark || ''
      }
    })
  },

  /** 切换编辑面板 */
  toggleEdit() {
    this.setData({ showEdit: !this.data.showEdit })
  },

  /** 编辑表单输入（音调实时校验） */
  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const patch = { [`editForm.${field}`]: value }
    if (field === 'accent') {
      patch.editAccentError = accentUtil.validate(value).message
    }
    this.setData(patch)
  },

  /** 音调输入失焦：不合规时提醒 */
  onEditAccentBlur(e) {
    const { ok, message } = accentUtil.validate(e.detail.value)
    this.setData({ editAccentError: ok ? '' : message })
    if (!ok) {
      wx.showToast({ title: message, icon: 'none', duration: 3000 })
    }
  },

  /** 审核通过 */
  async approve() {
    const { item, editForm } = this.data
    if (!item) return
    if (this.data.submitting) return
    const accentCheck = accentUtil.validate(editForm.accent)
    if (!accentCheck.ok) {
      this.setData({ editAccentError: accentCheck.message })
      wx.showToast({ title: accentCheck.message, icon: 'none', duration: 3000 })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })
    try {
      const data = {
        kanji: editForm.kanji.trim() || undefined,
        kana: editForm.kana.trim() || undefined,
        accent: accentUtil.toParam(accentCheck.list),
        wordType: editForm.wordType || undefined,
        remark: editForm.remark || undefined
      }
      const res = await correctionApi.approve(item.id, data)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '已采纳', icon: 'success' })
        // 成功后保持 submitting=true，禁止在返回前的 1.5s 内再次点击
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('审核通过失败:', e)
      wx.showToast({ title: '操作失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  /** 拒绝（后端要求驳回原因非空） */
  reject() {
    const { item } = this.data
    if (!item) return
    if (this.data.submitting) return

    wx.showModal({
      title: '驳回纠错',
      editable: true,
      placeholderText: '请输入驳回原因',
      success: async (modalRes) => {
        if (!modalRes.confirm) return
        const reason = (modalRes.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写驳回原因', icon: 'none' })
          return
        }
        this.setData({ submitting: true })
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          const res = await correctionApi.reject(item.id, reason)
          wx.hideLoading()
          if (res.code === 200) {
            wx.showToast({ title: '已驳回', icon: 'success' })
            // 成功后保持 submitting=true，禁止在返回前的 1.5s 内再次点击
            setTimeout(() => wx.navigateBack(), 1500)
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' })
            this.setData({ submitting: false })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('拒绝失败:', e)
          wx.showToast({ title: '操作失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      }
    })
  }
})
