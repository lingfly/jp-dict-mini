// pages/correction-my-word-detail/correction-my-word-detail.js
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

/** 将纠错 item 中的词性字段转为中文 */
function formatItem(item) {
  if (!item) return item
  return {
    ...item,
    wordWordTypeCn: translateWordType(item.wordWordType),
    correctionWordTypeCn: translateWordType(item.correctionWordType)
  }
}

Page({
  data: {
    item: null,
    // 是否显示底部操作按钮（仅 pending/rejected 状态可操作）
    canOperate: false,
    deleting: false
  },

  onLoad(options) {
    if (options.data) {
      try {
        const raw = JSON.parse(decodeURIComponent(options.data))
        const item = formatItem(raw)
        this.setData({
          item,
          canOperate: item.status === 'pending' || item.status === 'rejected'
        })
      } catch (e) {
        console.error('解析纠错数据失败:', e)
        wx.showToast({ title: '数据错误', icon: 'none' })
      }
    }
  },

  /** 撤销（删除）纠错 */
  withdraw() {
    const { item, deleting } = this.data
    if (!item || deleting) return

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
          const resp = await correctionApi.deleteWord(item.id)
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
          console.error('撤销纠错失败:', e)
          wx.showToast({ title: '撤销失败', icon: 'none' })
          this.setData({ deleting: false })
        }
      }
    })
  },

  /** 进入修改页 */
  goEdit() {
    const { item } = this.data
    if (!item) return
    const data = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({
      url: `/pages/correction-word-edit/correction-word-edit?correctionId=${item.id}&data=${data}`
    })
  },

  /** 供修改页调用，同步修改后的纠错数据 */
  updateItem(newItem) {
    this.setData({ item: formatItem(newItem) })
  }
})
