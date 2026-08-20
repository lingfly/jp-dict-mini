// pages/word-detail/word-detail.js
const { wordApi, audioApi, userApi } = require('../../utils/api')

Page({
  data: {
    wordId: '',
    loading: true,
    wordDetail: null,
    expandedSense: [],
    currentAudio: null,
    collapseDefinitionOnQuery: false,
    showMenu: false
  },

  onLoad(options) {
    const wordId = options.wordId || ''
    if (wordId) {
      this.setData({ wordId })
      this.loadCollapseConfig().then(() => this.loadWordDetail(wordId))
    } else {
      this.setData({ loading: false })
      wx.showToast({ title: '参数错误', icon: 'none' })
    }
  },

  /** 加载释义折叠配置 */
  async loadCollapseConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.setData({ collapseDefinitionOnQuery: res.data.collapseDefinitionOnQuery === 1 })
      }
    } catch (e) {
      console.error('加载释义折叠配置失败:', e)
    }
  },

  async loadWordDetail(wordId) {
    this.setData({ loading: true })
    try {
      const res = await wordApi.getDetail(wordId)
      if (res.code === 200 && res.data) {
        const definitions = res.data.definitions || []
        const expandAll = !this.data.collapseDefinitionOnQuery
        const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

        this.setData({
          wordDetail: res.data,
          loading: false,
          expandedSense: initialExpanded
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载单词详情失败:', error)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /** 切换更多菜单 */
  showCorrectionMenu() {
    this.setData({ showMenu: !this.data.showMenu })
  },

  /** 进入单词纠错页面 */
  goCorrection() {
    this.setData({ showMenu: false })
    const wordId = this.data.wordDetail && this.data.wordDetail.word && this.data.wordDetail.word.id
    if (!wordId) return
    wx.navigateTo({
      url: `/pages/correction-word/correction-word?wordId=${wordId}`
    })
  },

  /** 进入释义纠错页面 */
  goDefinitionCorrection() {
    this.setData({ showMenu: false })
    const wordId = this.data.wordDetail && this.data.wordDetail.word && this.data.wordDetail.word.id
    if (!wordId) return
    wx.navigateTo({
      url: `/pages/correction-definition/correction-definition?wordId=${wordId}`
    })
  },

  toggleSense(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    let expanded = [...this.data.expandedSense]
    const idx = expanded.indexOf(index)

    if (idx > -1) {
      expanded.splice(idx, 1)
    } else {
      expanded.push(index)
    }

    this.setData({ expandedSense: expanded })
  },

  async playAudio(e) {
    const audioId = e.currentTarget.dataset.audioId

    // 停止当前播放的音频
    if (this.data.currentAudio) {
      this.data.currentAudio.stop()
    }

    // 尝试从缓存获取 base64
    const cacheKey = `audio_${audioId}`
    let base64Data = null

    try {
      base64Data = wx.getStorageSync(cacheKey)
    } catch (err) {
      console.log('读取音频缓存失败:', err)
    }

    if (base64Data) {
      console.log('音频命中缓存:', audioId)
      this._playBase64Audio(base64Data)
      return
    }

    // 未命中缓存，请求接口
    try {
      wx.showLoading({ title: '加载中...' })
      const res = await audioApi.getBase64(audioId)
      wx.hideLoading()

      if (res.code === 200 && res.data) {
        try {
          wx.setStorageSync(cacheKey, res.data)
          console.log('音频已缓存:', audioId)
        } catch (err) {
          console.log('写入音频缓存失败:', err)
        }
        this._playBase64Audio(res.data)
      }
    } catch (error) {
      wx.hideLoading()
      console.error('播放音频失败:', error)
      wx.showToast({ title: '播放失败', icon: 'none' })
    }
  },

  _playBase64Audio(base64Data) {
    const innerAudioContext = wx.createInnerAudioContext()
    innerAudioContext.src = `data:audio/mpeg;base64,${base64Data}`

    innerAudioContext.onPlay(() => {
      console.log('开始播放')
    })

    innerAudioContext.onError((err) => {
      console.error('播放失败:', err)
      wx.showToast({ title: '播放失败', icon: 'none' })
    })

    innerAudioContext.onEnded(() => {
      console.log('播放结束')
      this.setData({ currentAudio: null })
    })

    innerAudioContext.play()
    this.setData({ currentAudio: innerAudioContext })
  },

  onUnload() {
    if (this.data.currentAudio) {
      this.data.currentAudio.stop()
      this.data.currentAudio.destroy()
    }
  }
})
