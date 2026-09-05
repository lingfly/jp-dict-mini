// pages/word-detail/word-detail.js
const { wordApi, audioApi, userApi, wordlistApi } = require('../../utils/api')
const groupSource = require('../../utils/wordlistGroup')

Page({
  data: {
    wordId: '',
    loading: true,
    wordDetail: null,
    expandedSense: [],
    currentAudio: null,
    collapseDefinitionOnQuery: false,
    showMenu: false,
    // 收藏状态（是否在默认收藏夹中）
    isFavorited: false,
    favoriting: false,

    /* ===== 加入词单弹层 ===== */
    showJoin: false,
    joinLoading: false,
    joinSubmitting: false,
    joinLists: [],        // 词单列表 [{ id, name, wordCount, containsWord }]
    joinView: [],         // 视图树 [{ id, name, wordCount, selected, isOrig, expanded, groups:[{id,name,color,selected}] }]
    joinGroupsMap: {},    // { wordListId: [{ id, name, color, wordCount }] }
    joinExpanded: {},     // { wordListId: true } 展开的分组
    joinSel: [],          // 选中的目标 key：'w:词单id'（未分组）或 'g:分组id'
    joinHint: '',
    joinGoText: '确定',
    joinCanGo: false,
    // 原位置（该单词当前所在的词单/分组），key 集合
    joinOrigKeys: []
  },

  onLoad(options) {
    const wordId = options.wordId || ''
    if (wordId) {
      this.setData({ wordId })
      this.loadCollapseConfig().then(() => {
        this.loadWordDetail(wordId)
        this.loadFavoriteState(wordId)
      })
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

  /** 加载收藏状态：该单词是否已在默认收藏夹中 */
  async loadFavoriteState(wordId) {
    try {
      await this.loadDefaultWordListId()
      const defaultId = this._defaultWordListId
      if (!defaultId) return
      // 查询该单词在哪些词单中，判断默认收藏夹是否包含
      const res = await wordlistApi.list({ mineOnly: true, wordId })
      if (res.code === 200) {
        const lists = res.data || []
        const def = lists.find(w => String(w.id) === String(defaultId))
        this.setData({ isFavorited: !!(def && def.containsWord) })
      }
    } catch (e) {
      console.error('加载收藏状态失败:', e)
    }
  },

  /** 收藏 / 取消收藏（加入默认收藏夹） */
  async toggleFavorite() {
    if (this.data.favoriting) return
    const wordId = this.getWordId()
    if (!wordId) {
      wx.showToast({ title: '单词信息缺失', icon: 'none' })
      return
    }

    this.setData({ favoriting: true })
    try {
      if (!this._defaultWordListId) {
        await this.loadDefaultWordListId()
      }
      const wordListId = this._defaultWordListId
      if (!wordListId) {
        wx.showToast({ title: '操作失败，请重试', icon: 'none' })
        return
      }

      const isFavorited = this.data.isFavorited
      const apiCall = isFavorited
        ? wordlistApi.unfavorite(wordId, wordListId)
        : wordlistApi.favorite(wordId, wordListId)

      wx.showLoading({ title: isFavorited ? '取消收藏中...' : '收藏中...', mask: true })
      const res = await apiCall
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: isFavorited ? '已取消收藏' : '收藏成功', icon: 'success' })
        this.setData({ isFavorited: !isFavorited })
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('收藏操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ favoriting: false })
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

  /* ================= 加入词单 ================= */

  /** 当前单词 id（wordDetail.word.id，后端可能序列化为字符串） */
  getWordId() {
    return this.data.wordDetail && this.data.wordDetail.word
      ? String(this.data.wordDetail.word.id)
      : this.data.wordId
  },

  /** 打开加入词单弹层：加载我的词单列表，原位置默认勾选 */
  async openJoin() {
    const wordId = this.getWordId()
    if (!wordId) {
      wx.showToast({ title: '单词信息缺失', icon: 'none' })
      return
    }
    this.setData({ showJoin: true, joinLoading: true })
    try {
      const res = await groupSource.fetchJoinLists(wordId)
      if (res.code === 200) {
        const lists = res.data || []

        // 预取的分组信息填充到 joinGroupsMap（供视图树与 key 反查使用）
        const groupsMap = {}
        lists.forEach(w => { groupsMap[w.id] = w.groups || [] })

        // 原位置：containsWord 的词单；若单词落在某分组内（该分组 containsWord）则精确到分组，否则为词单未分组
        const origKeys = lists.filter(w => w.containsWord).map(w => {
          const inGroup = (w.groups || []).find(g => g.containsWord)
          return inGroup ? ('g:' + inGroup.id) : ('w:' + w.id)
        })

        // 只有单词加入了某个分组时，该词单的分组才默认展开
        const joinExpanded = {}
        lists.forEach(w => {
          if (w.containsWord && (w.groups || []).some(g => g.containsWord)) {
            joinExpanded[w.id] = true
          }
        })

        this.setData({
          joinLists: lists,
          joinSel: origKeys.slice(),
          joinOrigKeys: origKeys,
          joinExpanded,
          joinGroupsMap: groupsMap
        })
      } else {
        wx.showToast({ title: res.message || '获取词单失败', icon: 'none' })
        this.setData({ showJoin: false })
      }
    } catch (e) {
      console.error('打开加入词单失败:', e)
      wx.showToast({ title: '获取词单失败', icon: 'none' })
      this.setData({ showJoin: false })
    } finally {
      this.setData({ joinLoading: false })
      this.buildJoinView()
    }
  },

  /** 展开/收起词单分组（分组已预取，仅切换展开态） */
  onJoinExpand(e) {
    const wordListId = e.currentTarget.dataset.id
    const expanded = { ...this.data.joinExpanded }
    if (expanded[wordListId]) {
      delete expanded[wordListId]
    } else {
      expanded[wordListId] = true
    }
    this.setData({ joinExpanded: expanded })
    this.buildJoinView()
  },

  /** key -> { wordListId }：g:分组id 需要反查所属词单（用于同词单互斥） */
  joinWordListIdOfKey(key) {
    if (key.slice(0, 2) === 'w:') return key.slice(2)
    if (key.slice(0, 2) === 'g:') {
      const gid = key.slice(2)
      const map = this.data.joinGroupsMap
      for (const wid in map) {
        if (map[wid].some(g => g.id === gid)) return wid
      }
    }
    return null
  },

  /** 点击词单行 / 分组行：切换勾选（同词单内互斥，可取消原位置） */
  onJoinTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const wid = this.joinWordListIdOfKey(key)
    let sel = this.data.joinSel.slice()

    if (sel.indexOf(key) > -1) {
      // 再点一次 = 取消勾选（含原位置，表示从该词单移除）
      sel = sel.filter(k => k !== key)
    } else {
      // 勾选新位置：同词单内互斥，先移除该词单已有勾选（未分组 / 其他分组），再落新勾
      sel = sel.filter(k => this.joinWordListIdOfKey(k) !== wid)
      sel.push(key)
    }
    this.setData({ joinSel: sel })
    this.buildJoinView()
  },

  /** 根据 joinSel 推导视图树 + chips + 提示 + 按钮状态 */
  buildJoinView() {
    const sel = this.data.joinSel
    const origKeys = this.data.joinOrigKeys
    const lists = this.data.joinLists
    const groupsMap = this.data.joinGroupsMap
    const expanded = this.data.joinExpanded

    const selSet = {}
    sel.forEach(k => { selSet[k] = true })
    const origSet = {}
    origKeys.forEach(k => { origSet[k] = true })

    // 视图树：词单行 + 内嵌分组行（仅展开时）
    const joinView = lists.map(wl => {
      const loaded = groupsMap[wl.id] || []
      const groups = expanded[wl.id] ? loaded.map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        selected: !!selSet['g:' + g.id],
        isOrig: !!origSet['g:' + g.id]
      })) : []
      return {
        id: wl.id,
        name: wl.name,
        wordCount: wl.wordCount,
        selected: !!selSet['w:' + wl.id],
        isOrig: !!origSet['w:' + wl.id],
        expanded: !!expanded[wl.id],
        // 有分组才显示展开箭头
        hasGroups: loaded.length > 0,
        groups
      }
    })

    // 变更判定：当前勾选集合与初始原位置集合是否有差异（增或删都算变更）
    const hasChange = sel.length !== origKeys.length || sel.some(k => !origSet[k])

    // 提示：只保留「加入 n 个词单」（n = 当前选中的词单数）
    const hint = `加入 ${sel.length} 个词单`

    this.setData({
      joinView,
      joinHint: hint,
      joinCanGo: hasChange,
      joinGoText: '确定'
    })
  },

  /** 关闭弹层 */
  closeJoin() {
    this.setData({ showJoin: false })
  },

  /** 提交加入词单（全量替换） */
  async confirmJoin() {
    if (this.data.joinSubmitting) return
    if (!this.data.joinCanGo) return
    const wordId = this.getWordId()

    // 把选中的 key 转成 targets: [{ wordListId, groupId }]
    const targets = this.data.joinSel.map(key => {
      const wid = this.joinWordListIdOfKey(key)
      const groupId = key.slice(0, 2) === 'g:' ? key.slice(2) : null
      return { wordListId: wid, groupId }
    }).filter(t => t.wordListId)

    this.setData({ joinSubmitting: true })
    wx.showLoading({ title: '加入中...', mask: true })
    try {
      const res = await groupSource.updateRelations(wordId, targets)
      wx.hideLoading()
      if (res.code === 200) {
        this.setData({ showJoin: false })
        wx.showToast({ title: '已更新词单', icon: 'success' })
      } else {
        wx.showToast({ title: res.message || '加入失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('加入词单失败:', e)
      wx.showToast({ title: '加入失败', icon: 'none' })
    } finally {
      this.setData({ joinSubmitting: false })
    }
  },

  /** 阻止弹层内容区域点击冒泡到遮罩 */
  noop() {},

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
