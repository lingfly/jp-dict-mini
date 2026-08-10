// pages/correction/correction.js
const { correctionApi } = require('../../utils/api')

Page({
  data: {
    wordId: '',
    wordInfo: null,       // { kanji, kana, accent, wordType }
    // 单词纠错表单
    wordForm: {
      kanji: '',
      kana: '',
      accent: '',
      wordType: '',
      remark: ''
    },
    // 词性多选
    selectedWordTypes: [],        // 选中 value 列表（用于提交）
    selectedWordTypeLabels: [],   // 选中 label 列表（用于显示）
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
    // 释义纠错表单
    defFormItems: [],     // [{ definitionId, remark }]
    submitting: false
  },

  onLoad(options) {
    const wordId = options.wordId || ''
    if (!wordId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 从上一页传递的单词数据
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    let wordInfo = null

    if (prevPage && prevPage.data) {
      // 从 home 页进入（wordDetail 结构）
      if (prevPage.data.wordDetail && prevPage.data.wordDetail.word) {
        const wd = prevPage.data.wordDetail
        wordInfo = {
          kanji: wd.word.kanji || '',
          kana: wd.word.kana || '',
          accent: wd.word.accent,
          wordType: wd.word.wordType || ''
        }
      }
      // 从 word-detail 页进入
      if (!wordInfo && prevPage.data.wordDetail && prevPage.data.wordDetail.word) {
        const wd = prevPage.data.wordDetail
        wordInfo = {
          kanji: wd.word.kanji || '',
          kana: wd.word.kana || '',
          accent: wd.word.accent,
          wordType: wd.word.wordType || ''
        }
      }
      // 从 review-list 页进入（wordDetail + currentWord）
      if (!wordInfo && prevPage.data.currentWord) {
        wordInfo = {
          kanji: prevPage.data.currentWord.kanji || '',
          kana: prevPage.data.currentWord.kana || '',
          accent: prevPage.data.currentWord.accent,
          wordType: prevPage.data.currentWord.wordType || ''
        }
      }
    }

    // 解析已有词性（可能是逗号分隔的 value 或 label，兼容处理）
    const rawWordTypes = wordInfo && wordInfo.wordType
      ? wordInfo.wordType.split(',').map(s => s.trim()).filter(Boolean)
      : []

    // 构建双向映射
    const valueLabelMap = {}
    const labelValueMap = {}
    this.data.wordTypeGroups.forEach(group => {
      group.options.forEach(opt => {
        valueLabelMap[opt.value] = opt.label
        labelValueMap[opt.label] = opt.value
      })
    })

    // 统一转为 value（兼容用户未手动选择时可能是 label 的情况）
    const existingWordTypes = rawWordTypes.map(v => labelValueMap[v] || v)
    const existingLabels = existingWordTypes.map(v => valueLabelMap[v] || v)

    this.setData({
      wordId,
      wordInfo,
      selectedWordTypes: existingWordTypes,
      selectedWordTypeLabels: existingLabels,
      wordForm: {
        kanji: wordInfo ? wordInfo.kanji : '',
        kana: wordInfo ? wordInfo.kana : '',
        accent: wordInfo && wordInfo.accent != null ? String(wordInfo.accent) : '',
        wordType: existingWordTypes.join(','),
        remark: ''
      }
    })
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
  },

  /** 提交单词纠错 */
  async submitWord() {
    const { wordId, wordForm } = this.data
    if (!wordForm.kanji.trim()) {
      wx.showToast({ title: '请输入汉字', icon: 'none' })
      return
    }
    if (!wordForm.kana.trim()) {
      wx.showToast({ title: '请输入假名', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const data = {
        wordId: wordId,
        kanji: wordForm.kanji.trim(),
        kana: wordForm.kana.trim(),
        accent: wordForm.accent ? parseInt(wordForm.accent) : undefined,
        wordType: wordForm.wordType || undefined,
        remark: wordForm.remark || undefined
      }
      const res = await correctionApi.submitWord(data)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '纠错提交成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('提交单词纠错失败:', e)
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
