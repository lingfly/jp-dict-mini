// pages/correction-definition-edit/correction-definition-edit.js
const { correctionApi } = require('../../utils/api')

Page({
  data: {
    correctionId: '',
    wordInfo: null,       // { kanji, kana }
    // 释义纠错表单
    defItems: [],         // 现有释义 [{ definitionId, definitionCn, usage, note, sortOrder, dirty, deleted, expanded, examples, newExamples }]
    defNewItems: [],      // 新增释义 [{ definitionCn, usage, note, sortOrder, newExamples }]
    defRemark: '',        // 释义纠错整体补充说明
    loading: true,
    submitting: false
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

  /** 加载纠错详情，并还原用户上次提交后的释义状态 */
  async loadDetail() {
    this.setData({ loading: true })
    try {
      const res = await correctionApi.getDefinitionDetail(this.data.correctionId)
      if (res.code === 200 && res.data) {
        this.buildFormData(res.data)
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('加载释义纠错详情失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 根据 originalDefinitions + correctionItems 还原编辑表单 */
  buildFormData(data) {
    const wordKanji = data.wordKanji || ''
    const wordKana = data.wordKana || ''
    const remark = data.remark || ''
    const originalDefinitions = data.originalDefinitions || []
    const correctionItems = data.correctionItems || []

    // 1. 以原始释义为基准构建 defItems
    const defItems = originalDefinitions.map(def => ({
      definitionId: def.id,
      definitionCn: def.definitionCn || '',
      usage: def.usage || '',
      note: def.note || '',
      sortOrder: def.sortOrder,
      dirty: false,
      deleted: false,
      expanded: false,
      examples: (def.examples || []).map(ex => ({
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

    // 便于按 definitionId 查找
    const defIndexMap = {}
    defItems.forEach((item, idx) => {
      defIndexMap[item.definitionId] = idx
    })

    const defNewItems = []

    // 2. 应用 correctionItems
    correctionItems.forEach(ci => {
      if (ci.operationType === 'DELETE') {
        // 删除释义
        const idx = defIndexMap[ci.definitionId]
        if (idx !== undefined) {
          defItems[idx].deleted = true
          defItems[idx].dirty = true
        }
      } else if (ci.operationType === 'UPDATE') {
        // 修改释义
        const idx = defIndexMap[ci.definitionId]
        if (idx !== undefined) {
          const item = defItems[idx]
          if (ci.definitionCn !== undefined) item.definitionCn = ci.definitionCn || ''
          if (ci.usage !== undefined) item.usage = ci.usage || ''
          if (ci.note !== undefined) item.note = ci.note || ''
          item.dirty = true

          // 处理例句
          ;(ci.examples || []).forEach(ex => {
            if (ex.operationType === 'DELETE') {
              const exItem = item.examples.find(e => e.id === ex.id)
              if (exItem) {
                exItem.deleted = true
                exItem.dirty = true
              }
            } else if (ex.operationType === 'UPDATE') {
              const exItem = item.examples.find(e => e.id === ex.id)
              if (exItem) {
                if (ex.sentenceJp !== undefined) exItem.sentenceJp = ex.sentenceJp || ''
                if (ex.sentenceKana !== undefined) exItem.sentenceKana = ex.sentenceKana || ''
                if (ex.sentenceCn !== undefined) exItem.sentenceCn = ex.sentenceCn || ''
                exItem.dirty = true
              }
            } else if (ex.operationType === 'ADD') {
              item.newExamples.push({
                sentenceJp: ex.sentenceJp || '',
                sentenceKana: ex.sentenceKana || '',
                sentenceCn: ex.sentenceCn || '',
                sortOrder: ex.sortOrder
              })
            }
          })
        }
      } else if (ci.operationType === 'ADD') {
        // 新增释义
        defNewItems.push({
          definitionCn: ci.definitionCn || '',
          usage: ci.usage || '',
          note: ci.note || '',
          sortOrder: ci.sortOrder,
          newExamples: (ci.examples || []).map(ex => ({
            sentenceJp: ex.sentenceJp || '',
            sentenceKana: ex.sentenceKana || '',
            sentenceCn: ex.sentenceCn || '',
            sortOrder: ex.sortOrder
          }))
        })
      }
    })

    this.setData({
      wordInfo: { kanji: wordKanji, kana: wordKana },
      defItems,
      defNewItems,
      defRemark: remark
    })
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

  /** 编辑新增例句字段 */
  onNewExampleFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const newExIndex = parseInt(e.currentTarget.dataset.newExIndex)

    if (e.currentTarget.dataset.defIndex !== undefined) {
      const defIndex = parseInt(e.currentTarget.dataset.defIndex)
      this.setData({ [`defItems[${defIndex}].newExamples[${newExIndex}].${field}`]: e.detail.value })
    } else {
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

  /** 判断某释义下例句是否有修改 */
  _hasExampleChanges(item) {
    const hasDirty = (item.examples || []).some(ex => ex.dirty)
    const hasNew = (item.newExamples || []).some(ex => ex.sentenceJp && ex.sentenceJp.trim())
    return hasDirty || hasNew
  },

  /** 组装某释义下的例句纠错 items */
  _buildExampleItems(item) {
    const examples = []
    let sortOrder = 0

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

  /** 提交修改 */
  async submitUpdate() {
    if (this.data.submitting) return
    const { correctionId, defItems, defNewItems } = this.data

    const items = []
    let sortOrder = 0

    // 现有释义：删除 / 修改
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
      const res = await correctionApi.updateDefinition(correctionId, items)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '修改成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.message || '修改失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('修改释义纠错失败:', e)
      wx.showToast({ title: '修改失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
