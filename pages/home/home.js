// pages/home/home.js
const { wordApi, audioApi, wordlistApi, aiDictApi } = require('../../utils/api')

Page({
  data: {
    searchKeyword: '',
    loading: false,
    searchResults: [],
    wordDetail: null,
    recentSearches: ['ありがとう', '桜', '美味しい', '頑張る'],
    expandedSense: [0],
    currentAudio: null,
    // 加入词单弹窗
    showWordListPopup: false,
    myWordLists: [],
    // AI 查词
    showAiSearch: false,
    aiStreaming: false,
    aiMarkdown: '',      // 流式累积的原始 markdown
    aiBlocks: []         // 解析后的渲染块 [{ type, content }]
  },

  onLoad() {
    this.loadDefaultWordListId()
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

    this.setData({ loading: true, wordDetail: null, searchResults: [], showAiSearch: false, aiBlocks: [], aiMarkdown: '' })

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
        this.setData({ searchResults: [], showAiSearch: true, aiBlocks: [], aiMarkdown: '' })
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
    console.log('选中单词:', JSON.stringify(word, null, 2))
    console.log('wordDetail.definitions:', word.definitions)
    console.log('wordDetail.word:', word.word)

    // 深拷贝避免引用问题，并确保数据结构完整
    const wordDetail = JSON.parse(JSON.stringify(word))
    console.log('深拷贝后 wordDetail:', JSON.stringify(wordDetail, null, 2))

    this.setData({
      wordDetail: wordDetail,
      expandedSense: [0] // 默认展开第一个义项
    }, () => {
      // setData 回调中确认数据已更新
      console.log('setData 完成, wordDetail:', this.data.wordDetail)
      console.log('setData 完成, expandedSense:', this.data.expandedSense)
    })
  },

  backToResults() {
    this.setData({ wordDetail: null })
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      wordDetail: null
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
    const wordId = this.data.wordDetail.word.id

    wx.showLoading({ title: '加载中...' })
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
    }
  },

  /** 关闭弹窗 */
  closeWordListPopup() {
    this.setData({ showWordListPopup: false })
  },

  /** 切换词单勾选 */
  async toggleWordListSelect(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.myWordLists[index]
    if (!item) return

    const wordId = this.data.wordDetail.word.id
    const wordListId = item.id
    const isAdding = !item.containsWord

    wx.showLoading({ title: isAdding ? '添加中...' : '移除中...' })
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
    }
  },

  /** AI 流式查词 — 返回 markdown */
  startAiSearch() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) return

    const app = getApp()
    const token = app.globalData.token
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ aiStreaming: true, aiBlocks: [], aiMarkdown: '' })

    const url = aiDictApi.getStreamUrl(keyword, token)
    const that = this
    let sseBuffer = ''

    const requestTask = wx.request({
      url,
      method: 'GET',
      enableChunked: true,
      success() {
        that._parseMarkdown()
        that.setData({ aiStreaming: false })
      },
      fail(err) {
        console.error('AI查词失败:', err)
        that.setData({ aiStreaming: false })
        if (!that.data.aiMarkdown) {
          wx.showToast({ title: 'AI查词请求失败', icon: 'none' })
        }
      }
    })

    if (requestTask && requestTask.onChunkReceived) {
      console.log('onChunkReceived 已注册')
      requestTask.onChunkReceived(res => {
        console.log('收到chunk, 字节数:', res.data && (res.data.byteLength || res.data.length))
        try {
          const text = that._arrayBufferToString(res.data)
          console.log('chunk文本:', text.substring(0, 200))
          sseBuffer += text

          // SSE 事件成对解析：event: xxx \n data: xxx \n\n
          const parts = sseBuffer.split('\n\n')
          sseBuffer = parts.pop() // 最后一段可能不完整

          for (const part of parts) {
            const lines = part.split('\n')
            let eventName = ''
            let dataContent = ''

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.substring(6).trim()
              } else if (line.startsWith('data:')) {
                dataContent = line.substring(5).trim()
              }
            }

            if (eventName === 'chunk' && dataContent) {
              // markdown 文本，处理转义 \n
              let md = dataContent.replace(/\\n/g, '\n')
              that.data.aiMarkdown += md
              that._parseMarkdown()
            } else if (eventName === 'done') {
              // 流结束，success 回调也会触发
            } else if (eventName === 'error') {
              try {
                const errObj = JSON.parse(dataContent)
                wx.showToast({ title: errObj.error || 'AI查词出错', icon: 'none' })
              } catch (e) { /* ignore */ }
              that.setData({ aiStreaming: false })
            }
          }
        } catch (e) {
          console.error('解析chunk失败:', e)
        }
      })
    }

    this._aiRequestTask = requestTask
  },

  /** 将 markdown 解析为渲染块数组 */
  _parseMarkdown() {
    const md = this.data.aiMarkdown
    if (!md) return

    const lines = md.split('\n')
    const blocks = []

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]
      const trimmed = raw.trim()
      if (!trimmed) {
        blocks.push({ type: 'br' })
        continue
      }

      // 标题
      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
      if (hMatch) {
        blocks.push({ type: 'h' + hMatch[1].length, content: hMatch[2] })
        continue
      }

      // 无序列表
      if (/^[-*+]\s/.test(trimmed)) {
        const content = trimmed.replace(/^[-*+]\s+/, '')
        blocks.push({ type: 'li', content })
        continue
      }

      // 普通段落
      blocks.push({ type: 'p', content: trimmed })
    }

    this.setData({ aiBlocks: blocks })
  },

  /** ArrayBuffer 转字符串 */
  _arrayBufferToString(buffer) {
    if (typeof buffer === 'string') return buffer
    if (buffer instanceof ArrayBuffer) {
      const decoder = new TextDecoder('utf-8')
      return decoder.decode(new Uint8Array(buffer))
    }
    return String(buffer)
  },

  async addToReview() {
    if (!this.data.wordDetail) return
    const wordId = this.data.wordDetail.word.id
    if (!wordId) {
      wx.showToast({ title: '单词信息异常', icon: 'none' })
      return
    }

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

    wx.showLoading({ title: isFavorited ? '取消收藏中...' : '收藏中...' })
    try {
      const res = await apiCall
      if (res.code === 200) {
        wx.hideLoading()
        wx.showToast({ title: isFavorited ? '已取消收藏' : '收藏成功', icon: 'success' })
        this.setData({
          'wordDetail.isFavorited': !isFavorited
        })
      } else {
        wx.hideLoading()
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('操作失败:', error)
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
