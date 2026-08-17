// pages/home/home.js
const { wordApi, audioApi, wordlistApi, aiDictApi, userApi } = require('../../utils/api')

Page({
  data: {
    searchKeyword: '',
    loading: false,
    searchResults: [],
    wordDetail: null,
    recentSearches: ['ありがとう', '桜', '美味しい', '頑張る'],
    expandedSense: [0],
    currentAudio: null,
    statusBarHeight: 20,
    // 加入词单弹窗
    showWordListPopup: false,
    myWordLists: [],
    // AI 查词
    showAiSearch: false,
    aiStreaming: false,
    aiFeedbackDone: false,  // 防止重复提交反馈
    isAiResult: false,      // 当前搜索结果是否来自 AI 查词
    // 释义折叠配置
    collapseDefinitionOnQuery: false,
    // 更多菜单
    showMenu: false,
    // 防重复点击状态
    addingToWordlist: false,
    togglingWordList: false,
    favoriting: false
  },

  async onLoad() {
    // 获取状态栏高度用于自定义导航栏（不依赖登录，立即执行）
    const windowInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: windowInfo.statusBarHeight || 20 })

    // 等待登录完成，再发需要 token 的请求，避免未登录时 401 触发重复登录
    await getApp().waitForLogin()

    this.loadDefaultWordListId()
    this.loadCollapseConfig()
  },

  /** 加载释义折叠配置 */
  async loadCollapseConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        const collapse = res.data.collapseDefinitionOnQuery === 1
        this.setData({ collapseDefinitionOnQuery: collapse })
      }
    } catch (e) {
      console.error('加载释义折叠配置失败:', e)
    }
  },

  /** 加载并缓存默认词单（收藏夹）ID */
  async loadDefaultWordListId() {
    const cached = wx.getStorageSync('defaultWordListId')
    if (cached) {
      this._defaultWordListId = cached
      return
    }
    try {
      const res = await wordlistApi.getDefault()
      if (res.code === 200 && res.data && res.data.id) {
        this._defaultWordListId = res.data.id
        wx.setStorageSync('defaultWordListId', res.data.id)
      }
    } catch (e) {
      console.error('获取默认词单失败:', e)
    }
  },

  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  async handleSearch() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) {
      wx.showToast({
        title: '请输入查询内容',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true, wordDetail: null, searchResults: [], showAiSearch: false, isAiResult: false })

    try {
      const res = await wordApi.search(keyword)
      if (res.code === 200 && res.data.length > 0) {
        // 预处理搜索结果：高亮 + 释义排序
        const processed = this.processSearchResults(res.data, keyword)
        this.setData({
          searchResults: processed
        })

        // 添加到最近搜索
        const recent = [...this.data.recentSearches]
        if (!recent.includes(keyword)) {
          recent.unshift(keyword)
          if (recent.length > 4) recent.pop()
          this.setData({ recentSearches: recent })
        }
      } else {
        this.setData({ searchResults: [], showAiSearch: true })
      }
    } catch (error) {
      console.error('查询失败:', error)
      wx.showToast({
        title: '查询失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  applySearch(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ searchKeyword: keyword })
    this.handleSearch()
  },

  selectWord(e) {
    const index = e.currentTarget.dataset.index
    const word = this.data.searchResults[index]

    // 深拷贝避免引用问题，并确保数据结构完整
    const wordDetail = JSON.parse(JSON.stringify(word))
    // 保存 AI 查词结果中的索引位置，用于反馈接口的 selectedIndex
    wordDetail._resultIndex = index

    // 根据配置决定释义是否默认展开
    const expandAll = !this.data.collapseDefinitionOnQuery
    const definitions = wordDetail.definitions || []
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

    this.setData({
      wordDetail: wordDetail,
      expandedSense: initialExpanded,
      aiFeedbackDone: false // 重置反馈状态
    })
  },

  backToResults() {
    this.setData({ wordDetail: null })
  },

  /** 切换更多菜单 */
  showCorrectionMenu() {
    this.setData({ showMenu: !this.data.showMenu })
  },

  /** 关闭菜单 */
  closeMenu() {
    this.setData({ showMenu: false })
  },

  /** 进入纠错页面 */
  goCorrection() {
    this.setData({ showMenu: false })
    const wordId = this.data.wordDetail && this.data.wordDetail.word && this.data.wordDetail.word.id
    if (!wordId) return
    wx.navigateTo({
      url: `/pages/correction/correction?wordId=${wordId}`
    })
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      wordDetail: null,
      showAiSearch: false,
      isAiResult: false
    })
  },

  toggleSense(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    let expanded = [...this.data.expandedSense]
    const idx = expanded.indexOf(index)

    console.log('点击义项:', index, '当前展开:', expanded)

    if (idx > -1) {
      // 已展开，收起
      expanded.splice(idx, 1)
    } else {
      // 未展开，展开
      expanded.push(index)
    }

    console.log('更新后展开:', expanded)

    this.setData({
      expandedSense: expanded
    })
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
      // 命中缓存，直接播放
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
        // 写入缓存
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
      wx.showToast({
        title: '播放失败',
        icon: 'none'
      })
    }
  },

  // 播放 base64 音频
  _playBase64Audio(base64Data) {
    const innerAudioContext = wx.createInnerAudioContext()
    innerAudioContext.src = `data:audio/mpeg;base64,${base64Data}`

    innerAudioContext.onPlay(() => {
      console.log('开始播放')
    })

    innerAudioContext.onError((err) => {
      console.error('播放失败:', err)
      wx.showToast({
        title: '播放失败',
        icon: 'none'
      })
    })

    innerAudioContext.onEnded(() => {
      console.log('播放结束')
      this.setData({ currentAudio: null })
    })

    innerAudioContext.play()
    this.setData({ currentAudio: innerAudioContext })
  },

  /** 打开加入词单弹窗，加载我的词单列表 */
  async addToWordlist() {
    if (!this.data.wordDetail) return
    if (this.data.addingToWordlist) return
    const wordId = this.data.wordDetail.word.id

    this.setData({ addingToWordlist: true })
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      const res = await wordlistApi.list({ mineOnly: true, wordId })
      if (res.code === 200) {
        this.setData({
          myWordLists: res.data || [],
          showWordListPopup: true
        })
      }
    } catch (e) {
      console.error('加载词单失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ addingToWordlist: false })
    }
  },

  /** 关闭弹窗 */
  closeWordListPopup() {
    this.setData({ showWordListPopup: false })
  },

  /** 切换词单勾选 */
  async toggleWordListSelect(e) {
    if (this.data.togglingWordList) return
    const index = e.currentTarget.dataset.index
    const item = this.data.myWordLists[index]
    if (!item) return

    const wordId = this.data.wordDetail.word.id
    const wordListId = item.id
    const isAdding = !item.containsWord

    this.setData({ togglingWordList: true })
    wx.showLoading({ title: isAdding ? '添加中...' : '移除中...', mask: true })
    try {
      const res = isAdding
        ? await wordlistApi.favorite(wordId, wordListId)
        : await wordlistApi.unfavorite(wordId, wordListId)

      if (res.code === 200) {
        this.setData({
          [`myWordLists[${index}].containsWord`]: isAdding
        })
        wx.showToast({ title: isAdding ? '已加入' : '已移除', icon: 'success' })
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (e) {
      console.error('操作失败:', e)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ togglingWordList: false })
    }
  },

  /** AI 查词 — 同步接口，返回与 search 相同的数据结构 */
  async startAiSearch() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) return

    this.setData({ aiStreaming: true })

    try {
      const res = await aiDictApi.query(keyword, false, 'medium')
      // res.data 结构: { logId, results: [...] }
      if (res.code === 200 && res.data && res.data.results && res.data.results.length > 0) {
        const logId = res.data.logId
        // 复用搜索结果的处理和展示逻辑，并注入 logId 和来源标记
        const processed = this.processSearchResults(res.data.results, keyword)
        processed.forEach(item => {
          item._logId = logId
          item._fromAi = true
        })
        this.setData({
          searchResults: processed,
          showAiSearch: false,
          aiStreaming: false,
          isAiResult: true
        })

        // 添加到最近搜索
        const recent = [...this.data.recentSearches]
        if (!recent.includes(keyword)) {
          recent.unshift(keyword)
          if (recent.length > 4) recent.pop()
          this.setData({ recentSearches: recent })
        }
      } else {
        this.setData({ aiStreaming: false })
        wx.showToast({ title: 'AI 未找到相关释义', icon: 'none' })
      }
    } catch (error) {
      console.error('AI查词失败:', error)
      this.setData({ aiStreaming: false })
      wx.showToast({ title: 'AI查词失败', icon: 'none' })
    }
  },

  async addToReview() {
    if (!this.data.wordDetail) return
    if (this.data.favoriting) return
    const wordId = this.data.wordDetail.word.id
    if (!wordId) {
      wx.showToast({ title: '单词信息异常', icon: 'none' })
      return
    }

    this.setData({ favoriting: true })

    try {
      // 使用缓存的默认词单 ID
      if (!this._defaultWordListId) {
        await this.loadDefaultWordListId()
      }
      const wordListId = this._defaultWordListId
      if (!wordListId) {
        wx.showToast({ title: '操作失败，请重试', icon: 'none' })
        return
      }

      const isFavorited = this.data.wordDetail.isFavorited
      const apiCall = isFavorited
        ? wordlistApi.unfavorite(wordId, wordListId)
        : wordlistApi.favorite(wordId, wordListId)

      wx.showLoading({ title: isFavorited ? '取消收藏中...' : '收藏中...', mask: true })
      const res = await apiCall
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: isFavorited ? '已取消收藏' : '收藏成功', icon: 'success' })
        this.setData({
          'wordDetail.isFavorited': !isFavorited
        })
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ favoriting: false })
    }
  },

  /** AI 反馈：不符合预期 */
  async aiMarkIncorrect() {
    if (this.data.aiFeedbackDone) return
    const logId = this.data.wordDetail._logId
    if (!logId) return

    this.setData({ aiFeedbackDone: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await aiDictApi.markIncorrect(logId)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '已反馈', icon: 'success' })
      } else {
        this.setData({ aiFeedbackDone: false })
        wx.showToast({ title: res.message || '反馈失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({ aiFeedbackDone: false })
      console.error('反馈失败:', error)
      wx.showToast({ title: '反馈失败', icon: 'none' })
    }
  },

  /** AI 反馈：符合预期并加入词库 */
  async aiMarkCorrect() {
    if (this.data.aiFeedbackDone) return
    const wordDetail = this.data.wordDetail
    const logId = wordDetail._logId
    const selectedIndex = wordDetail._resultIndex
    if (!logId) return

    this.setData({ aiFeedbackDone: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await aiDictApi.markCorrect(logId, selectedIndex)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '已加入词库', icon: 'success' })
      } else {
        this.setData({ aiFeedbackDone: false })
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({ aiFeedbackDone: false })
      console.error('反馈失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /**
   * 预处理搜索结果：分词高亮 + 释义排序
   */
  processSearchResults(data, keyword) {
    const lowerKw = keyword.toLowerCase()
    return data.map(item => {
      const word = item.word
      const kanji = word.kanji || ''
      const kana = word.kana || ''

      // 生成高亮分段：kanji
      const kanjiSegments = this.buildHighlightSegments(kanji, lowerKw)

      // 生成高亮分段：kana
      const kanaSegments = this.buildHighlightSegments(kana, lowerKw)

      // 释义排序：包含关键字的排前面
      let definitions = [...(item.definitions || [])]
      const matchDefs = definitions.filter(d =>
        d.definitionCn && d.definitionCn.toLowerCase().includes(lowerKw)
      )
      const otherDefs = definitions.filter(d =>
        !d.definitionCn || !d.definitionCn.toLowerCase().includes(lowerKw)
      )
      definitions = [...matchDefs, ...otherDefs]

      // 给每个释义生成高亮分段
      definitions = definitions.map(d => ({
        ...d,
        _highlightedCn: this.buildHighlightSegments(d.definitionCn || '', lowerKw)
      }))

      // 取第一条释义作为摘要（优先匹配的）
      const summaryDef = definitions[0]

      return {
        ...item,
        word,
        definitions,
        _kanjiSegments: kanjiSegments,
        _kanaSegments: kanaSegments,
        _summaryDef: summaryDef
      }
    })
  },

  /**
   * 将文本按关键字拆分为高亮/非高亮分段
   * 返回 [{ text, highlight }]
   */
  buildHighlightSegments(text, keyword) {
    if (!text || !keyword) return [{ text: text || '', highlight: false }]
    const lower = text.toLowerCase()
    const kw = keyword.toLowerCase()
    const segments = []
    let lastIdx = 0

    let idx = lower.indexOf(kw, lastIdx)
    while (idx !== -1) {
      if (idx > lastIdx) {
        segments.push({ text: text.substring(lastIdx, idx), highlight: false })
      }
      segments.push({ text: text.substring(idx, idx + kw.length), highlight: true })
      lastIdx = idx + kw.length
      idx = lower.indexOf(kw, lastIdx)
    }
    if (lastIdx < text.length) {
      segments.push({ text: text.substring(lastIdx), highlight: false })
    }
    return segments.length > 0 ? segments : [{ text, highlight: false }]
  },

  onUnload() {
    // 页面卸载时停止音频
    if (this.data.currentAudio) {
      this.data.currentAudio.stop()
      this.data.currentAudio.destroy()
    }
  }
})
