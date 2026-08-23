// pages/correction-word-edit/correction-word-edit.js
const { correctionApi } = require('../../utils/api')

Page({
  data: {
    correctionId: '',
    wordInfo: null,       // { kanji, kana }
    // 单词纠错表单
    wordForm: {
      kanji: '',
      kana: '',
      accent: '',
      wordType: '',
      remark: ''
    },
    // 词性多选
    selectedWordTypes: [],
    selectedWordTypeLabels: [],
    showWordTypeDropdown: false,
    wordTypeGroups: [
      {
        name: '动词',
        options: [
          { value: 'verb-godan-transitive', label: '五段他动词' },
          { value: 'verb-godan-intransitive', label: '五段自动词' },
          { value: 'verb-godan-both', label: '五段自他兼用' },
          { value: 'verb-ichidan-transitive', label: '一段他动词' },
          { value: 'verb-ichidan-intransitive', label: '一段自动词' },
          { value: 'verb-ichidan-both', label: '一段自他兼用' },
          { value: 'verb-suru-transitive', label: 'サ変他动词' },
          { value: 'verb-suru-intransitive', label: 'サ変自动词' },
          { value: 'verb-suru-irregular', label: 'サ変不规则' },
          { value: 'verb-kuru-irregular', label: 'カ変不规则' }
        ]
      },
      {
        name: '形容词',
        options: [
          { value: 'i-adjective', label: 'い形容词' },
          { value: 'na-adjective', label: 'な形容词' }
        ]
      },
      {
        name: '名词',
        options: [
          { value: 'noun-common', label: '普通名词' },
          { value: 'noun-proper', label: '专有名词' },
          { value: 'noun-verbal', label: 'サ変名词' },
          { value: 'noun-adjectival', label: '形容动词词干' },
          { value: 'noun-temporal', label: '时间名词' },
          { value: 'noun-counter', label: '助数词' }
        ]
      },
      {
        name: '副词',
        options: [
          { value: 'adverb', label: '普通副词' },
          { value: 'adverb-to', label: 'と副词' },
          { value: 'adverb-degree', label: '程度副词' },
          { value: 'adverb-frequency', label: '频率副词' },
          { value: 'adverb-temporal', label: '时间副词' }
        ]
      },
      {
        name: '助词',
        options: [
          { value: 'particle-case', label: '格助词' },
          { value: 'particle-adverbial', label: '副助词' },
          { value: 'particle-conjunctive', label: '接续助词' },
          { value: 'particle-final', label: '终助词' }
        ]
      },
      {
        name: '其他',
        options: [
          { value: 'conjunction', label: '接续词' },
          { value: 'interjection', label: '感叹词' },
          { value: 'prefix', label: '接头词' },
          { value: 'suffix', label: '接尾词' },
          { value: 'pronoun-personal', label: '人称代词' },
          { value: 'pronoun-demonstrative', label: '指示代词' },
          { value: 'determiner-demonstrative', label: '指示连体词' },
          { value: 'expression-idiom', label: '惯用句/连语' },
          { value: 'expression-greeting', label: '寒暄用语' }
        ]
      }
    ],
    submitting: false
  },

  onLoad(options) {
    const correctionId = options.correctionId || ''
    if (!correctionId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 从上一页传递的纠错数据
    let item = null
    if (options.data) {
      try {
        item = JSON.parse(decodeURIComponent(options.data))
      } catch (e) {
        console.error('解析纠错数据失败:', e)
      }
    }
    if (!item) {
      wx.showToast({ title: '数据错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 保存原始纠错数据，用于修改成功后同步回详情页
    this._originalItem = item
    this.initForm(correctionId, item)
  },

  /** 初始化表单（纠错内容优先，回退原单词信息） */
  initForm(correctionId, item) {
    // 构建 value/label 双向映射
    const valueLabelMap = {}
    const labelValueMap = {}
    this.data.wordTypeGroups.forEach(group => {
      group.options.forEach(opt => {
        valueLabelMap[opt.value] = opt.label
        labelValueMap[opt.label] = opt.value
      })
    })

    const rawWordType = item.correctionWordType || item.wordWordType || ''
    const rawTypes = rawWordType ? rawWordType.split(',').map(s => s.trim()).filter(Boolean) : []
    const existingValues = rawTypes.map(v => labelValueMap[v] || v)
    const existingLabels = existingValues.map(v => valueLabelMap[v] || v)

    this.setData({
      correctionId,
      wordInfo: { kanji: item.wordKanji || '', kana: item.wordKana || '' },
      selectedWordTypes: existingValues,
      selectedWordTypeLabels: existingLabels,
      wordForm: {
        kanji: item.correctionKanji || item.wordKanji || '',
        kana: item.correctionKana || item.wordKana || '',
        accent: item.correctionAccent != null ? String(item.correctionAccent) : (item.wordAccent != null ? String(item.wordAccent) : ''),
        wordType: existingValues.join(','),
        remark: item.remark || ''
      }
    })
    this.syncSelectedFlags()
  },

  /** 根据 selectedWordTypes 同步所有选项的 selected 标记 */
  syncSelectedFlags() {
    const selected = this.data.selectedWordTypes
    const groups = this.data.wordTypeGroups.map(group => ({
      ...group,
      options: group.options.map(opt => ({
        ...opt,
        selected: selected.indexOf(opt.value) > -1
      }))
    }))
    this.setData({ wordTypeGroups: groups })
  },

  /** 单词表单输入 */
  onWordInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`wordForm.${field}`]: e.detail.value })
  },

  /** 切换词性下拉 */
  toggleWordTypeDropdown() {
    this.setData({ showWordTypeDropdown: !this.data.showWordTypeDropdown })
  },

  /** 切换词性选项 */
  toggleWordType(e) {
    const value = e.currentTarget.dataset.value
    const label = e.currentTarget.dataset.label
    let values = [...this.data.selectedWordTypes]
    let labels = [...this.data.selectedWordTypeLabels]
    const idx = values.indexOf(value)
    if (idx > -1) {
      values.splice(idx, 1)
      labels.splice(idx, 1)
    } else {
      values.push(value)
      labels.push(label)
    }
    this.setData({
      selectedWordTypes: values,
      selectedWordTypeLabels: labels,
      'wordForm.wordType': values.join(',')
    })
    this.syncSelectedFlags()
  },

  /** 提交修改 */
  async submitUpdate() {
    if (this.data.submitting) return
    const { correctionId, wordForm } = this.data
    if (!wordForm.kanji.trim()) {
      wx.showToast({ title: '请输入汉字', icon: 'none' })
      return
    }
    if (!wordForm.kana.trim()) {
      wx.showToast({ title: '请输入假名', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })
    try {
      const data = {
        kanji: wordForm.kanji.trim(),
        kana: wordForm.kana.trim(),
        accent: wordForm.accent ? parseInt(wordForm.accent) : undefined,
        wordType: wordForm.wordType || undefined,
        remark: wordForm.remark || undefined
      }
      const res = await correctionApi.updateWord(correctionId, data)
      wx.hideLoading()
      if (res.code === 200) {
        // 构造更新后的纠错数据，同步回详情页
        const original = this._originalItem || {}
        const updatedItem = {
          ...original,
          correctionKanji: wordForm.kanji.trim(),
          correctionKana: wordForm.kana.trim(),
          correctionAccent: wordForm.accent ? parseInt(wordForm.accent) : null,
          correctionWordType: wordForm.wordType || '',
          remark: wordForm.remark || ''
        }
        const pages = getCurrentPages()
        const detailPage = pages[pages.length - 2]
        if (detailPage && typeof detailPage.updateItem === 'function') {
          detailPage.updateItem(updatedItem)
        }

        wx.showToast({ title: '修改成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.message || '修改失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('修改单词纠错失败:', e)
      wx.showToast({ title: '修改失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
