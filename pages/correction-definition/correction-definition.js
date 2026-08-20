// pages/correction-definition/correction-definition.js
const { correctionApi, wordApi } = require('../../utils/api')

Page({
  data: {
    wordId: '',
    wordInfo: null,       // { kanji, kana }
    // 释义纠错表单
    defItems: [],         // 现有释义 [{ definitionId, definitionCn, usage, note, sortOrder, dirty, deleted, examples, newExamples }]
    defNewItems: [],      // 新增释义 [{ definitionCn, usage, note, sortOrder, newExamples }]
    defRemark: '',        // 释义纠错整体补充说明
    submitting: false
  },

  onLoad(options) {
    const wordId = options.wordId || ''
    if (!wordId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ wordId })
    this.loadDefinitions(wordId)
  },

  /** 加载单词释义列表 */
  async loadDefinitions(wordId) {
    try {
      const res = await wordApi.getDetail(wordId)
      if (res.code === 200 && res.data) {
        const word = res.data.word || {}
        this.setData({
          wordInfo: { kanji: word.kanji || '', kana: word.kana || '' }
        })
        if (res.data.definitions) {
          const defItems = res.data.definitions.map(d => ({
            definitionId: d.id,
            definitionCn: d.definitionCn || '',
            usage: d.usage || '',
            note: d.note || '',
            sortOrder: d.sortOrder,
            dirty: false,
            deleted: false,
            expanded: false,
            examples: (d.examples || []).map(ex => ({
              id: ex.id,
              sentenceJp: ex.sentenceJp || '',
              sentenceKana: ex.sentenceKana || '',
              sentenceCn: ex.sentenceCn || '',
              sortOrder: ex.sortOrder,
              dirty: false,
              deleted: false
            })),
            newExamples: []
          }))
          this.setData({ defItems })
        }
      }
    } catch (e) {
      console.error('加载释义列表失败:', e)
    }
  },

  /** 编辑现有释义字段 */
  onDefFieldInput(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    this.setData({
      [`defItems[${index}].${field}`]: e.detail.value,
      [`defItems[${index}].dirty`]: true
    })
  },

  /** 切换删除现有释义 */
  toggleDeleteDef(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const current = this.data.defItems[index]
    this.setData({
      [`defItems[${index}].deleted`]: !current.deleted,
      [`defItems[${index}].dirty`]: true
    })
  },

  /** 展开/折叠现有释义 */
  toggleDefExpand(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({ [`defItems[${index}].expanded`]: !this.data.defItems[index].expanded })
  },

  /** 新增一条释义 */
  addNewDef() {
    const defNewItems = [...this.data.defNewItems, { definitionCn: '', usage: '', note: '', newExamples: [] }]
    this.setData({ defNewItems })
  },

  /** 编辑新增释义字段 */
  onNewDefFieldInput(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    this.setData({ [`defNewItems[${index}].${field}`]: e.detail.value })
  },

  /** 移除新增释义 */
  removeNewDef(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const defNewItems = [...this.data.defNewItems]
    defNewItems.splice(index, 1)
    this.setData({ defNewItems })
  },

  // ==================== 例句编辑 ====================

  /** 编辑现有释义下的现有例句字段 */
  onExampleFieldInput(e) {
    const defIndex = parseInt(e.currentTarget.dataset.defIndex)
    const exIndex = parseInt(e.currentTarget.dataset.exIndex)
    const field = e.currentTarget.dataset.field
    this.setData({
      [`defItems[${defIndex}].examples[${exIndex}].${field}`]: e.detail.value,
      [`defItems[${defIndex}].examples[${exIndex}].dirty`]: true
    })
  },

  /** 切换删除现有释义下的现有例句 */
  toggleDeleteExample(e) {
    const defIndex = parseInt(e.currentTarget.dataset.defIndex)
    const exIndex = parseInt(e.currentTarget.dataset.exIndex)
    const current = this.data.defItems[defIndex].examples[exIndex]
    this.setData({
      [`defItems[${defIndex}].examples[${exIndex}].deleted`]: !current.deleted,
      [`defItems[${defIndex}].examples[${exIndex}].dirty`]: true
    })
  },

  /** 在现有释义下新增一条例句 */
  addExample(e) {
    const defIndex = parseInt(e.currentTarget.dataset.defIndex)
    const newExamples = [...this.data.defItems[defIndex].newExamples, this._emptyExample()]
    this.setData({ [`defItems[${defIndex}].newExamples`]: newExamples })
  },

  /** 编辑新增例句字段（用于现有释义下新增例句 或 新增释义下的例句） */
  onNewExampleFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const newExIndex = parseInt(e.currentTarget.dataset.newExIndex)

    if (e.currentTarget.dataset.defIndex !== undefined) {
      // 现有释义下的新增例句
      const defIndex = parseInt(e.currentTarget.dataset.defIndex)
      this.setData({ [`defItems[${defIndex}].newExamples[${newExIndex}].${field}`]: e.detail.value })
    } else {
      // 新增释义下的例句
      const newDefIndex = parseInt(e.currentTarget.dataset.newDefIndex)
      this.setData({ [`defNewItems[${newDefIndex}].newExamples[${newExIndex}].${field}`]: e.detail.value })
    }
  },

  /** 移除新增例句 */
  removeNewExample(e) {
    const newExIndex = parseInt(e.currentTarget.dataset.newExIndex)

    if (e.currentTarget.dataset.defIndex !== undefined) {
      const defIndex = parseInt(e.currentTarget.dataset.defIndex)
      const newExamples = [...this.data.defItems[defIndex].newExamples]
      newExamples.splice(newExIndex, 1)
      this.setData({ [`defItems[${defIndex}].newExamples`]: newExamples })
    } else {
      const newDefIndex = parseInt(e.currentTarget.dataset.newDefIndex)
      const newExamples = [...this.data.defNewItems[newDefIndex].newExamples]
      newExamples.splice(newExIndex, 1)
      this.setData({ [`defNewItems[${newDefIndex}].newExamples`]: newExamples })
    }
  },

  /** 在新增释义下新增一条例句 */
  addNewDefExample(e) {
    const newDefIndex = parseInt(e.currentTarget.dataset.newDefIndex)
    const newExamples = [...this.data.defNewItems[newDefIndex].newExamples, this._emptyExample()]
    this.setData({ [`defNewItems[${newDefIndex}].newExamples`]: newExamples })
  },

  /** 空白例句对象 */
  _emptyExample() {
    return { sentenceJp: '', sentenceKana: '', sentenceCn: '', sortOrder: '' }
  },

  /** 释义纠错整体补充说明输入 */
  onDefRemarkInput(e) {
    this.setData({ defRemark: e.detail.value })
  },

  // ==================== 提交 ====================

  /** 判断某释义下例句是否有修改（现有例句 dirty 或新增例句已填写） */
  _hasExampleChanges(item) {
    const hasDirty = (item.examples || []).some(ex => ex.dirty)
    const hasNew = (item.newExamples || []).some(ex => ex.sentenceJp && ex.sentenceJp.trim())
    return hasDirty || hasNew
  },

  /** 组装某释义下的例句纠错 items（按列表顺序填充 sortOrder） */
  _buildExampleItems(item) {
    const examples = []
    let sortOrder = 0

    // 现有例句：删除 / 修改（未删除的按顺序占位）
    ;(item.examples || []).forEach(ex => {
      if (ex.deleted) {
        if (ex.dirty) {
          examples.push({ operationType: 'DELETE', id: ex.id })
        }
        return
      }
      const currentSort = sortOrder
      sortOrder++
      if (ex.dirty) {
        examples.push({
          operationType: 'UPDATE',
          id: ex.id,
          sentenceJp: ex.sentenceJp.trim(),
          sentenceKana: ex.sentenceKana || undefined,
          sentenceCn: ex.sentenceCn || undefined,
          sortOrder: currentSort
        })
      }
    })

    // 新增例句
    ;(item.newExamples || []).forEach(ex => {
      if (ex.sentenceJp && ex.sentenceJp.trim()) {
        examples.push({
          operationType: 'ADD',
          sentenceJp: ex.sentenceJp.trim(),
          sentenceKana: ex.sentenceKana || undefined,
          sentenceCn: ex.sentenceCn || undefined,
          sortOrder: sortOrder++
        })
      }
    })

    return examples
  },

  /** 提交释义纠错 */
  async submitDefinition() {
    if (this.data.submitting) return
    const { wordId, defItems, defNewItems, defRemark } = this.data

    const items = []
    let sortOrder = 0

    // 现有释义：删除 / 修改（未删除的按顺序占位）
    defItems.forEach(item => {
      if (item.deleted) {
        if (item.dirty) {
          items.push({ operationType: 'DELETE', definitionId: item.definitionId })
        }
        return
      }
      const currentSort = sortOrder
      sortOrder++
      if (item.dirty || this._hasExampleChanges(item)) {
        const examples = this._buildExampleItems(item)
        items.push({
          operationType: 'UPDATE',
          definitionId: item.definitionId,
          definitionCn: item.definitionCn.trim(),
          usage: item.usage || undefined,
          note: item.note || undefined,
          sortOrder: currentSort,
          examples: examples.length > 0 ? examples : undefined
        })
      }
    })

    // 新增释义
    defNewItems.forEach(item => {
      if (item.definitionCn && item.definitionCn.trim()) {
        const examples = this._buildExampleItems(item)
        items.push({
          operationType: 'ADD',
          definitionCn: item.definitionCn.trim(),
          usage: item.usage || undefined,
          note: item.note || undefined,
          sortOrder: sortOrder++,
          examples: examples.length > 0 ? examples : undefined
        })
      }
    })

    if (items.length === 0) {
      wx.showToast({ title: '请至少修改或新增一处释义', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })
    try {
      const data = {
        wordId: wordId,
        remark: defRemark ? defRemark.trim() : undefined,
        items: items
      }
      const res = await correctionApi.submitDefinition(data)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '释义纠错提交成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('提交释义纠错失败:', e)
      wx.showToast({ title: '提交失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
