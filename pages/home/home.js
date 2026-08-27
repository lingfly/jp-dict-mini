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
    aiFeedbackType: '',     // 反馈类型：'correct' 符合预期 / 'incorrect' 不符合预期 / '' 未反馈
    isAiResult: false,      // 当前搜索结果是否来自 AI 查词
    // AI 查词次数限制
    aiQueryLimit: 0,        // 每日 AI 查词限制次数
    aiQueryUsedToday: 0,    // 当日已使用的 AI 查词次数
    aiQueryRemain: 0,       // 剩余 AI 查词次数（limit - used）
    aiQueryExhausted: false, // 是否已达 AI 查词次数上限
    // 释义折叠配置
    collapseDefinitionOnQuery: false,
    // AI 查词配置
    aiDictModel: null,
    aiDictTemperature: null,
    aiDictThinking: false,
    aiDictReasoningEffort: null,
    // 更多菜单
    showMenu: false,
    // 防重复点击状态
    addingToWordlist: false,
    togglingWordList: false,
    favoriting: false,
    // 保存结果列表的滚动位置
    savedScrollTop: 0,
    // 分页相关
    currentPage: 1,
    pageSize: 20,
    totalResults: 0,
    hasMoreResults: false,
    loadingMore: false
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

  onShow() {
    // 返回首页时重新加载配置，确保设置修改后能及时生效
    this.loadCollapseConfig()
  },

  /** 加载释义折叠配置及 AI 查词次数限制 */
  async loadCollapseConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        const collapse = res.data.collapseDefinitionOnQuery === 1
        this.setData({
          collapseDefinitionOnQuery: collapse,
          aiQueryLimit: res.data.aiQueryLimit != null ? res.data.aiQueryLimit : 0,
          aiQueryUsedToday: res.data.aiQueryUsedToday != null ? res.data.aiQueryUsedToday : 0,
          aiDictModel: res.data.aiDictModel || null,
          aiDictTemperature: res.data.aiDictTemperature != null ? parseFloat(res.data.aiDictTemperature) : null,
          aiDictThinking: res.data.aiDictThinking === 1,
          aiDictReasoningEffort: res.data.aiDictReasoningEffort || null
        })
        this._updateAiQueryRemain()
      }
    } catch (e) {
      console.error('加载释义折叠配置失败:', e)
    }
  },

  /** 刷新 AI 查词已用次数 */
  async refreshAiQueryUsage() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.setData({
          aiQueryLimit: res.data.aiQueryLimit != null ? res.data.aiQueryLimit : 0,
          aiQueryUsedToday: res.data.aiQueryUsedToday != null ? res.data.aiQueryUsedToday : 0,
          aiDictModel: res.data.aiDictModel || null,
          aiDictTemperature: res.data.aiDictTemperature != null ? parseFloat(res.data.aiDictTemperature) : null,
          aiDictThinking: res.data.aiDictThinking === 1,
          aiDictReasoningEffort: res.data.aiDictReasoningEffort || null
        })
        this._updateAiQueryRemain()
      }
    } catch (e) {
      console.error('刷新 AI 查词次数失败:', e)
    }
  },

  /** 根据 limit 与已用次数计算剩余次数及是否达上限 */
  _updateAiQueryRemain() {
    const { aiQueryLimit, aiQueryUsedToday } = this.data
    const remain = aiQueryLimit > 0 ? Math.max(0, aiQueryLimit - aiQueryUsedToday) : 0
    const exhausted = aiQueryLimit > 0 && aiQueryUsedToday >= aiQueryLimit
    this.setData({
      aiQueryRemain: remain,
      aiQueryExhausted: exhausted
    })
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

    this.setData({
      loading: true,
      wordDetail: null,
      searchResults: [],
      showAiSearch: false,
      isAiResult: false,
      currentPage: 1,
      totalResults: 0,
      hasMoreResults: false
    })

    try {
      const res = await wordApi.search(keyword, 1, this.data.pageSize)
      if (res.code === 200 && res.data && res.data.data && res.data.data.length > 0) {
        // 预处理搜索结果：使用后端返回的 matchType 和 matchContent 进行高亮
        const processed = this.processSearchResults(res.data.data)
        this.setData({
          searchResults: processed,
          currentPage: res.data.page || 1,
          totalResults: res.data.total || 0,
          hasMoreResults: res.data.hasNext || false
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

    // 保存当前滚动位置
    const query = wx.createSelectorQuery()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      if (res && res[0]) {
        this.setData({ savedScrollTop: res[0].scrollTop })
      }
    })

    // 深拷贝避免引用问题，并确保数据结构完整
    const wordDetail = JSON.parse(JSON.stringify(word))
    // 保存 AI 查词结果中的索引位置，用于反馈接口的 selectedIndex
    wordDetail._resultIndex = index

    // 根据配置决定释义是否默认展开
    const expandAll = !this.data.collapseDefinitionOnQuery
    const definitions = wordDetail.definitions || []
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

    // 从本地缓存恢复该单词的 AI 反馈状态，返回后再进入仍保留
    const feedback = this.getCachedAiFeedback(wordDetail._logId, index)

    this.setData({
      wordDetail: wordDetail,
      expandedSense: initialExpanded,
      aiFeedbackDone: !!feedback,
      aiFeedbackType: feedback || ''
    }, () => {
      // 进入单词详情，滚动到顶部
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 0
      })
    })
  },

  backToResults() {
    this.setData({ wordDetail: null }, () => {
      // 返回结果列表，恢复之前保存的滚动位置
      const savedScrollTop = this.data.savedScrollTop
      if (savedScrollTop > 0) {
        wx.pageScrollTo({
          scrollTop: savedScrollTop,
          duration: 0
        })
      }
    })
  },

  /** 切换更多菜单 */
  showCorrectionMenu() {
    this.setData({ showMenu: !this.data.showMenu })
  },

  /** 关闭菜单 */
  closeMenu() {
    this.setData({ showMenu: false })
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

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      wordDetail: null,
      showAiSearch: false,
      isAiResult: false,
      aiFeedbackDone: false,
      aiFeedbackType: '',
      currentPage: 1,
      totalResults: 0,
      hasMoreResults: false
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

    // 次数限制：已达上限则不允许继续查询
    if (this.data.aiQueryExhausted) {
      wx.showToast({ title: '今日 AI 查词次数已用完', icon: 'none' })
      return
    }

    this.setData({ aiStreaming: true })

    try {
      const { aiDictModel, aiDictTemperature, aiDictThinking, aiDictReasoningEffort } = this.data
      // 只有开启思维模式时才传递 thinking 和 reasoningEffort
      const thinking = aiDictThinking ? true : false
      const reasoningEffort = aiDictThinking ? (aiDictReasoningEffort || 'medium') : null
      const res = await aiDictApi.query(keyword, thinking, reasoningEffort, aiDictModel, aiDictTemperature)
      // res.data 结构: { logId, results: [...] }
      if (res.code === 200 && res.data && res.data.results && res.data.results.length > 0) {
        const logId = res.data.logId
        // 复用搜索结果的处理和展示逻辑，并注入 logId 和来源标记
        const processed = this.processSearchResults(res.data.results)
        processed.forEach(item => {
          item._logId = logId
          item._fromAi = true
        })
        this.setData({
          searchResults: processed,
          showAiSearch: false,
          aiStreaming: false,
          isAiResult: true,
          hasMoreResults: false,
          currentPage: 1,
          totalResults: processed.length
        })

        // AI 查词成功后刷新已用次数
        this.refreshAiQueryUsage()

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

  /** 构建 AI 反馈本地缓存 key */
  _aiFeedbackKey(logId, index) {
    return `ai_feedback_${logId}_${index}`
  },

  /** 读取缓存的 AI 反馈类型（'correct' / 'incorrect' / ''） */
  getCachedAiFeedback(logId, index) {
    if (!logId) return ''
    try {
      return wx.getStorageSync(this._aiFeedbackKey(logId, index)) || ''
    } catch (e) {
      console.error('读取 AI 反馈缓存失败:', e)
      return ''
    }
  },

  /** 写入 AI 反馈类型到本地缓存 */
  setCachedAiFeedback(logId, index, type) {
    if (!logId) return
    try {
      wx.setStorageSync(this._aiFeedbackKey(logId, index), type)
    } catch (e) {
      console.error('写入 AI 反馈缓存失败:', e)
    }
  },

  /** AI 反馈：不符合预期 */
  async aiMarkIncorrect() {
    if (this.data.aiFeedbackDone) return
    const wordDetail = this.data.wordDetail
    const logId = wordDetail._logId
    const selectedIndex = wordDetail._resultIndex
    if (!logId) return

    this.setData({ aiFeedbackDone: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await aiDictApi.markIncorrect(logId)
      wx.hideLoading()
      if (res.code === 200) {
        this.setData({ aiFeedbackType: 'incorrect' })
        this.setCachedAiFeedback(logId, selectedIndex, 'incorrect')
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
        this.setData({ aiFeedbackType: 'correct' })
        this.setCachedAiFeedback(logId, selectedIndex, 'correct')
        wx.showToast({ title: '已加入审核，审核通过后会加入词库及默认收藏夹', icon: 'none', duration: 2000 })
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
   * 预处理搜索结果：根据后端返回的 matchType 和 matchContent 进行高亮显示
   * matchType: exact/prefix/contain/conjugation/definition
   * matchContent: 匹配的具体内容
   */
  processSearchResults(data) {
    return data.map(item => {
      const word = item.word
      const matchType = item.matchType
      const matchContent = item.matchContent || ''

      let kanjiSegments = [{ text: word.kanji || '', highlight: false }]
      let kanaSegments = [{ text: word.kana || '', highlight: false }]
      let definitions = [...(item.definitions || [])]
      let summaryDef = definitions[0]

      // 根据匹配类型进行不同的高亮处理
      if (matchType === 'definition') {
        // 释义匹配：找到匹配的释义作为预览，并高亮匹配内容
        const matchedDef = definitions.find(d =>
          d.definitionCn && d.definitionCn.includes(matchContent)
        )
        if (matchedDef) {
          summaryDef = {
            ...matchedDef,
            _highlightedCn: this.buildPrefixHighlightSegments(matchedDef.definitionCn || '', matchContent)
          }
        }
        // 保留所有释义用于详情页展示
        definitions = definitions.map(d => ({
          ...d,
          _highlightedCn: [{ text: d.definitionCn || '', highlight: false }]
        }))
      } else {
        // 汉字/假名匹配：前缀高亮（从左到右逐字符匹配）
        if (matchContent) {
          const kanji = word.kanji || ''
          const kana = word.kana || ''

          // 高亮 kanji 中从左边开始匹配的部分
          kanjiSegments = this.buildPrefixHighlightSegments(kanji, matchContent)

          // 高亮 kana 中从左边开始匹配的部分
          kanaSegments = this.buildPrefixHighlightSegments(kana, matchContent)
        }

        // 给所有释义生成普通分段（不高亮）
        definitions = definitions.map(d => ({
          ...d,
          _highlightedCn: [{ text: d.definitionCn || '', highlight: false }]
        }))
        summaryDef = definitions[0]
      }

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
   * 前缀匹配高亮：在文本中查找匹配位置，从左边开始逐字符比对，匹配的部分高亮
   * 例如："移り変わる" 匹配 "変わって"，高亮 "変わ"
   * 返回 [{ text, highlight }]
   */
  buildPrefixHighlightSegments(text, matchContent) {
    if (!text || !matchContent) return [{ text: text || '', highlight: false }]

    // 在文本中查找能匹配的最佳位置
    let bestMatchPos = -1
    let bestMatchLength = 0

    for (let startPos = 0; startPos < text.length; startPos++) {
      let matchedLength = 0
      const remainingTextLength = text.length - startPos
      const minLength = Math.min(remainingTextLength, matchContent.length)

      // 从当前位置开始逐字符比对
      for (let i = 0; i < minLength; i++) {
        if (text[startPos + i] === matchContent[i]) {
          matchedLength++
        } else {
          break
        }
      }

      // 记录最长的匹配
      if (matchedLength > bestMatchLength) {
        bestMatchLength = matchedLength
        bestMatchPos = startPos
      }
    }

    // 如果找到匹配的部分，构建分段
    if (bestMatchLength > 0 && bestMatchPos >= 0) {
      const segments = []

      // 前面未匹配的部分
      if (bestMatchPos > 0) {
        segments.push({ text: text.substring(0, bestMatchPos), highlight: false })
      }

      // 匹配的部分（高亮）
      segments.push({
        text: text.substring(bestMatchPos, bestMatchPos + bestMatchLength),
        highlight: true
      })

      // 后面未匹配的部分
      if (bestMatchPos + bestMatchLength < text.length) {
        segments.push({
          text: text.substring(bestMatchPos + bestMatchLength),
          highlight: false
        })
      }

      return segments
    }

    return [{ text, highlight: false }]
  },

  /**
   * 将文本按关键字拆分为高亮/非高亮分段（精确匹配，区分大小写）
   * 返回 [{ text, highlight }]
   */
  buildHighlightSegments(text, keyword) {
    if (!text || !keyword) return [{ text: text || '', highlight: false }]
    const segments = []
    let lastIdx = 0

    let idx = text.indexOf(keyword, lastIdx)
    while (idx !== -1) {
      if (idx > lastIdx) {
        segments.push({ text: text.substring(lastIdx, idx), highlight: false })
      }
      segments.push({ text: text.substring(idx, idx + keyword.length), highlight: true })
      lastIdx = idx + keyword.length
      idx = text.indexOf(keyword, lastIdx)
    }
    if (lastIdx < text.length) {
      segments.push({ text: text.substring(lastIdx), highlight: false })
    }
    return segments.length > 0 ? segments : [{ text, highlight: false }]
  },

  /** 加载更多搜索结果 */
  async loadMoreResults() {
    if (this.data.loadingMore || !this.data.hasMoreResults) {
      return
    }

    const keyword = this.data.searchKeyword.trim()
    if (!keyword) return

    const nextPage = this.data.currentPage + 1

    this.setData({ loadingMore: true })

    try {
      const res = await wordApi.search(keyword, nextPage, this.data.pageSize)
      if (res.code === 200 && res.data && res.data.data && res.data.data.length > 0) {
        // 预处理新数据
        const processed = this.processSearchResults(res.data.data)
        // 追加到现有结果
        this.setData({
          searchResults: [...this.data.searchResults, ...processed],
          currentPage: res.data.page || nextPage,
          hasMoreResults: res.data.hasNext || false
        })
      } else {
        this.setData({ hasMoreResults: false })
      }
    } catch (error) {
      console.error('加载更多失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  onUnload() {
    // 页面卸载时停止音频
    if (this.data.currentAudio) {
      this.data.currentAudio.stop()
      this.data.currentAudio.destroy()
    }
  }
})
