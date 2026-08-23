// pages/correction-my/correction-my.js
const { correctionApi } = require('../../utils/api')

// 词性 value → 中文 label 映射
const WORD_TYPE_MAP = {
  'verb-godan-transitive': '五段他动词',
  'verb-godan-intransitive': '五段自动词',
  'verb-godan-both': '五段自他兼用',
  'verb-ichidan-transitive': '一段他动词',
  'verb-ichidan-intransitive': '一段自动词',
  'verb-ichidan-both': '一段自他兼用',
  'verb-suru-transitive': 'サ変他动词',
  'verb-suru-intransitive': 'サ変自动词',
  'verb-suru-irregular': 'サ変不规则',
  'verb-kuru-irregular': 'カ変不规则',
  'i-adjective': 'い形容词',
  'na-adjective': 'な形容词',
  'noun-common': '普通名词',
  'noun-proper': '专有名词',
  'noun-verbal': 'サ変名词',
  'noun-adjectival': '形容动词词干',
  'noun-temporal': '时间名词',
  'noun-counter': '助数词',
  'adverb': '普通副词',
  'adverb-to': 'と副词',
  'adverb-degree': '程度副词',
  'adverb-frequency': '频率副词',
  'adverb-temporal': '时间副词',
  'particle-case': '格助词',
  'particle-adverbial': '副助词',
  'particle-conjunctive': '接续助词',
  'particle-final': '终助词',
  'conjunction': '接续词',
  'interjection': '感叹词',
  'prefix': '接头词',
  'suffix': '接尾词',
  'pronoun-personal': '人称代词',
  'pronoun-demonstrative': '指示代词',
  'determiner-demonstrative': '指示连体词',
  'expression-idiom': '惯用句/连语',
  'expression-greeting': '寒暄用语'
}

/** 将词性 value 字符串（逗号分隔）转为中文 label */
function translateWordType(typeStr) {
  if (!typeStr) return ''
  return typeStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(v => WORD_TYPE_MAP[v] || v)
    .join('、')
}

/** 为单词纠错列表项补充中文词性字段 */
function formatWordItem(item) {
  return {
    ...item,
    wordWordTypeCn: translateWordType(item.wordWordType),
    correctionWordTypeCn: translateWordType(item.correctionWordType)
  }
}

Page({
  data: {
    // 当前 tab: 'word' | 'definition'
    currentTab: 'word',
    // 单词纠错列表
    wordList: [],
    wordLoading: true,
    // 释义纠错列表
    definitionList: [],
    definitionLoading: false
  },

  onLoad() {
    this.loadWordList()
  },

  onShow() {
    // 返回页面时刷新当前 tab 的列表（首次进入由 onLoad 处理，避免重复加载）
    if (this.data.currentTab === 'word') {
      this.loadWordList()
    } else {
      this.loadDefinitionList()
    }
  },

  /** 切换 tab */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) return
    this.setData({ currentTab: tab })
    if (tab === 'word') {
      this.loadWordList()
    } else {
      this.loadDefinitionList()
    }
  },

  /** 加载单词纠错列表 */
  async loadWordList() {
    this.setData({ wordLoading: true })
    try {
      const res = await correctionApi.listMy()
      if (res.code === 200) {
        const list = (res.data || []).map(formatWordItem)
        this.setData({ wordList: list })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载单词纠错列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ wordLoading: false })
    }
  },

  /** 加载释义纠错列表 */
  async loadDefinitionList() {
    this.setData({ definitionLoading: true })
    try {
      const res = await correctionApi.listMyDefinitions()
      if (res.code === 200) {
        this.setData({ definitionList: res.data || [] })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载释义纠错列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ definitionLoading: false })
    }
  },

  /** 进入单词纠错详情 */
  goWordDetail(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.wordList[index]
    if (!item) return
    const data = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({
      url: `/pages/correction-my-word-detail/correction-my-word-detail?data=${data}`
    })
  },

  /** 进入释义纠错详情 */
  goDefinitionDetail(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.definitionList[index]
    if (!item || !item.id) return
    wx.navigateTo({
      url: `/pages/correction-my-definition-detail/correction-my-definition-detail?correctionId=${item.id}`
    })
  }
})
