// pages/wordlist-add-search/wordlist-add-search.js
// #014 词单内查词加词：从某个词单进入，查词后把结果（普通/AI）加入「当前词单」的指定分组。
// 整体复用 pages/home 的查词形态，但底部只有一个「加入当前词单」按钮。
// 约定（宪法/AGENTS.md）：所有 ID（wordId/wordListId/groupId/logId）全程字符串，禁止 Number()；
// 需要 token 的请求在 onLoad 先 await getApp().waitForLogin()。
const { wordApi, audioApi, wordlistApi, wordlistGroupApi, aiDictApi, userApi } = require('../../utils/api')
// #015 分组记忆：按词单记住上次选的分组（方案 B：不同词单互不影响）
const groupMemory = require('../../utils/groupMemory')
// #014 补漏：复用首页的「加入词单」数据源与提交接口（fetchJoinLists / updateRelations）
const groupSource = require('../../utils/wordlistGroup')

// 分组弹层里「无分组」这一固定选项的 key（不是真实分组 id）
const NONE_GROUP_KEY = '__none_group__'

Page({
  data: {
    // 目标词单 id（字符串，来自路由参数）
    wordListId: '',

    // 自定义导航栏
    statusBarHeight: 20,

    // 当前词单分组 [{ id, name }]；失败时为空（弹层只有「无分组」）
    groups: [],

    // 搜索
    searchKeyword: '',
    // #016 进入页面自动聚焦搜索框（由 onReady 延迟置 true，驱动 WXML 的 focus 属性）
    searchAutoFocus: false,
    loading: false,
    searchResults: [],
    wordDetail: null,
    recentSearches: ['ありがとう', '桜', '美味しい', '頑張る'],
    expandedSense: [0],
    currentAudio: null,
    savedScrollTop: 0,

    // 分页
    currentPage: 1,
    pageSize: 20,
    totalResults: 0,
    hasMoreResults: false,
    loadingMore: false,

    // 释义折叠配置
    collapseDefinitionOnQuery: false,

    // AI 查词
    showAiSearch: false,
    aiStreaming: false,
    aiStatus: '',        // '' | generating | failed
    aiPhaseText: '',
    aiError: '',
    isAiResult: false,
    aiQueryLimit: 0,
    aiQueryUsedToday: 0,
    aiQueryRemain: 0,
    aiQueryExhausted: false,
    aiDictModel: null,
    aiDictTemperature: null,
    aiDictThinking: false,
    aiDictReasoningEffort: null,

    // 分组选择弹层（底部 sheet，单选 + 可取消；对齐首页）
    showGroupPicker: false,
    groupOptions: [],       // [{ key, name, groupId }]，首行恒为「无分组」
    groupSelectedKey: NONE_GROUP_KEY,
    /** 该词当前在本词单里的位置 key；null 表示不在词单（没有任何行是「原位置」） */
    origGroupKey: null,
    groupCanConfirm: false, // 没勾选任何行时「确定」置灰

    // #014 补漏：当前单词在当前词单里的归属
    // { loaded, inList, groupId, groupName }
    //   loaded=false 表示还没查到/查询失败（此时不显示状态行）
    //   inList=true + groupId=null → 在词单但未分组
    membership: { loaded: false, inList: false, groupId: null, groupName: '' },
    // 该词当前所在的全部词单关系（含当前词单），提交 update-relations 时需要拼全量
    // [{ wordListId, groupId }]，字符串
    allRelations: [],

    // 防重复提交
    submitting: false
  },

  async onLoad(options) {
    // 自定义导航栏：不依赖登录，立即取状态栏高度
    const windowInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: windowInfo.statusBarHeight || 20 })

    // wordListId 全程字符串，禁止 Number()
    const wordListId = options.wordListId ? String(options.wordListId) : ''
    this.setData({ wordListId })

    // 需要 token 的请求之前先等登录完成，避免 401 触发重复登录
    await getApp().waitForLogin()

    if (!wordListId) {
      wx.showToast({ title: '词单信息缺失', icon: 'none' })
    }

    // 分组列表与配置并行加载，均不阻塞查词（失败降级，AC-03）
    this.loadGroups(wordListId)
    this.loadCollapseConfig()
  },

  /**
   * #016 进入页面自动聚焦搜索框，直接弹出系统输入法键盘。
   * 用户从词单详情点「＋ 添加单词」进入本页后，无需再点输入框即可开始打字。
   *
   * 为什么不在 onLoad / 首帧置 focus：iOS 在页面转场动画期间设置的焦点会被系统丢弃；
   * 等 onReady（首帧渲染完成）后再延迟 300ms，确保转场结束，聚焦最稳。
   * 只在首次进入时执行一次 —— 从单词详情返回列表（页内切换）不会重新触发（AC-02）。
   */
  onReady() {
    this._autoFocusTimer = setTimeout(() => {
      this._autoFocusTimer = null
      this.setData({ searchAutoFocus: true })
    }, 300)
  },

  onUnload() {
    // #016 延迟聚焦的定时器可能还没触发就退出页面，先清掉，避免对已卸载页面 setData
    if (this._autoFocusTimer) {
      clearTimeout(this._autoFocusTimer)
      this._autoFocusTimer = null
    }
    if (this.data.currentAudio) {
      this.data.currentAudio.stop()
      this.data.currentAudio.destroy()
    }
  },

  /** 自定义导航栏返回：列表态才真正返回上一页（词单详情） */
  goBack() {
    wx.navigateBack()
  },

  /**
   * 物理返回键 / 右滑返回（真机）。
   * 详情态时先回到查词页（列表），与首页行为一致；
   * 列表态放行，走默认的 navigateBack 回词单详情。
   * @returns {Boolean} true = 已自行处理，不再执行默认返回
   */
  onBackPress() {
    if (this.data.wordDetail) {
      this.backToResults()
      return true
    }
    return false
  },

  /** 加载当前词单分组（GET /api/wordlist/all-content 取 groups）；失败降级为只有「无分组」 */
  async loadGroups(wordListId) {
    if (!wordListId) {
      this.setData({ groups: [] })
      return
    }
    try {
      const res = await wordlistGroupApi.getAllContent(wordListId)
      if (res.code === 200 && res.data) {
        const groups = (res.data.groups || []).map(g => ({
          id: String(g.id),
          name: g.groupName || g.name || '未命名分组',
          sortOrder: g.sortOrder
        }))
        // 按 sortOrder 升序（仅当后端返回该字段时），否则保持后端顺序（AC-07）
        if (groups.some(g => g.sortOrder !== undefined && g.sortOrder !== null)) {
          groups.sort((a, b) => {
            const sa = a.sortOrder == null ? 0 : a.sortOrder
            const sb = b.sortOrder == null ? 0 : b.sortOrder
            return sa - sb
          })
        }
        this.setData({ groups })
      } else {
        this.setData({ groups: [] })
      }
    } catch (e) {
      console.error('加载词单分组失败，降级为只有无分组:', e)
      this.setData({ groups: [] })
    }
  },

  /** 加载释义折叠配置 + AI 查词配置/次数限制（与 home.loadCollapseConfig 一致） */
  async loadCollapseConfig() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.applyLearningConfig(res.data)
      }
    } catch (e) {
      console.error('加载释义折叠配置失败:', e)
    }
  },

  /** 刷新 AI 查词已用次数（AI 查词成功后调用） */
  async refreshAiQueryUsage() {
    try {
      const res = await userApi.getLearningConfig()
      if (res.code === 200 && res.data) {
        this.applyLearningConfig(res.data)
      }
    } catch (e) {
      console.error('刷新 AI 查词次数失败:', e)
    }
  },

  applyLearningConfig(data) {
    this.setData({
      collapseDefinitionOnQuery: data.collapseDefinitionOnQuery === 1,
      aiQueryLimit: data.aiQueryLimit != null ? data.aiQueryLimit : 0,
      aiQueryUsedToday: data.aiQueryUsedToday != null ? data.aiQueryUsedToday : 0,
      aiDictModel: data.aiDictModel || null,
      aiDictTemperature: data.aiDictTemperature != null ? parseFloat(data.aiDictTemperature) : null,
      aiDictThinking: data.aiDictThinking === 1,
      aiDictReasoningEffort: data.aiDictReasoningEffort || null
    })
    this._updateAiQueryRemain()
  },

  /** 根据 limit 与已用次数计算剩余次数及是否达上限 */
  _updateAiQueryRemain() {
    const { aiQueryLimit, aiQueryUsedToday } = this.data
    const remain = aiQueryLimit > 0 ? Math.max(0, aiQueryLimit - aiQueryUsedToday) : 0
    const exhausted = aiQueryLimit > 0 && aiQueryUsedToday >= aiQueryLimit
    this.setData({ aiQueryRemain: remain, aiQueryExhausted: exhausted })
  },

  /* ================= 普通查词 ================= */

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  async handleSearch() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) {
      wx.showToast({ title: '请输入查询内容', icon: 'none' })
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
        const processed = this.processSearchResults(res.data.data)
        this.setData({
          searchResults: processed,
          currentPage: res.data.page || 1,
          totalResults: res.data.total || 0,
          hasMoreResults: res.data.hasNext || false
        })
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
      // 请求层已弹「请求超时，请重试」；关键词保留，用户可直接再点「查询」重试
      console.error('查询失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  applySearch(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ searchKeyword: keyword })
    this.handleSearch()
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      wordDetail: null,
      showAiSearch: false,
      isAiResult: false,
      currentPage: 1,
      totalResults: 0,
      hasMoreResults: false
    })
  },

  /** 加载更多搜索结果 */
  async loadMoreResults() {
    if (this.data.loadingMore || !this.data.hasMoreResults) return
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) return
    const nextPage = this.data.currentPage + 1
    this.setData({ loadingMore: true })
    try {
      const res = await wordApi.search(keyword, nextPage, this.data.pageSize)
      if (res.code === 200 && res.data && res.data.data && res.data.data.length > 0) {
        const processed = this.processSearchResults(res.data.data)
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
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  /** 进入单词详情（同一页面内切换，非跳转） */
  selectWord(e) {
    const index = e.currentTarget.dataset.index
    const word = this.data.searchResults[index]
    if (!word) return

    const query = wx.createSelectorQuery()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      if (res && res[0]) {
        this.setData({ savedScrollTop: res[0].scrollTop })
      }
    })

    // 深拷贝避免引用问题
    const wordDetail = JSON.parse(JSON.stringify(word))
    // AI 结果中的索引位置，用于 add-word 接口的 selectedIndex
    wordDetail._resultIndex = index

    const expandAll = !this.data.collapseDefinitionOnQuery
    const definitions = wordDetail.definitions || []
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []

    this.setData({
      wordDetail,
      expandedSense: initialExpanded,
      // 切到新词时先清空上一个词的归属，避免闪一下旧状态
      membership: { loaded: false, inList: false, groupId: null, groupName: '' },
      allRelations: []
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    })

    // #014 补漏：异步查该词在当前词单里的归属（不阻塞详情渲染，失败静默降级）
    const wordId = wordDetail.word && wordDetail.word.id
    if (wordId !== undefined && wordId !== null && wordId !== '') {
      this.loadMembership(String(wordId))
    }
  },

  /**
   * #014 补漏：查该词在当前词单里的归属 + 该词所在的全部词单关系。
   *
   * 数据来源复用首页同款 `utils/wordlistGroup.js#fetchJoinLists`（内部调
   * `GET /api/wordlist/list?mineOnly=true&wordId=`），它给了：
   *   - containsWord：该词是否在此词单
   *   - groups[].containsWord：命中项即所在分组
   *
   * 同时把「该词所在的全部词单关系」缓存到 allRelations：
   * 因为普通加词改用了 update-relations（全量替换语义），提交时必须把
   * 其它词单的现有关系原样带上，否则会被后端清除（实测确认会丢数据）。
   *
   * @param {String} wordId 单词 id（字符串）
   */
  async loadMembership(wordId) {
    const wordListId = String(this.data.wordListId || '')
    if (!wordId || !wordListId) return

    // 记录进行中的查询，供 openGroupPicker 等待（避免过快点击丢「原位置」）
    this._membershipLoading = this._doLoadMembership(wordId, wordListId)
      .finally(() => { this._membershipLoading = null })
    return this._membershipLoading
  },

  /** loadMembership 的实际实现（拆分出来便于挂 loading 标记） */
  async _doLoadMembership(wordId, wordListId) {
    try {
      const res = await groupSource.fetchJoinLists(wordId)
      if (!res || res.code !== 200) {
        // 查询失败：不显示状态行，不弹错（辅助信息不该阻塞加词）
        this.setData({ membership: { loaded: false, inList: false, groupId: null, groupName: '' }, allRelations: [] })
        return
      }

      const lists = res.data || []

      // 1) 该词所在的全部关系（字符串 id），供 update-relations 拼全量
      const allRelations = lists
        .filter(w => w.containsWord)
        .map(w => {
          const hitGroup = (w.groups || []).find(g => g.containsWord)
          return {
            wordListId: String(w.id),
            groupId: hitGroup ? String(hitGroup.id) : null,
            // 以下两个仅内部使用，提交时只取 wordListId / groupId
            groupName: hitGroup ? (hitGroup.name || '') : ''
          }
        })

      // 2) 当前词单里的归属
      const current = lists.find(w => String(w.id) === wordListId)
      let membership = { loaded: true, inList: false, groupId: null, groupName: '' }
      if (current && current.containsWord) {
        const hitGroup = (current.groups || []).find(g => g.containsWord)
        membership = {
          loaded: true,
          inList: true,
          groupId: hitGroup ? String(hitGroup.id) : null,
          groupName: hitGroup ? (hitGroup.name || '') : ''
        }
      }

      this.setData({ membership, allRelations })
    } catch (e) {
      console.error('查询单词归属失败（已降级为不显示）:', e)
      this.setData({ membership: { loaded: false, inList: false, groupId: null, groupName: '' }, allRelations: [] })
    }
  },

  backToResults() {
    this.setData({ wordDetail: null }, () => {
      const savedScrollTop = this.data.savedScrollTop
      if (savedScrollTop > 0) {
        wx.pageScrollTo({ scrollTop: savedScrollTop, duration: 0 })
      }
    })
  },

  toggleSense(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const expanded = [...this.data.expandedSense]
    const idx = expanded.indexOf(index)
    if (idx > -1) expanded.splice(idx, 1)
    else expanded.push(index)
    this.setData({ expandedSense: expanded })
  },

  /* ================= 音频 ================= */

  async playAudio(e) {
    const audioId = e.currentTarget.dataset.audioId
    if (this.data.currentAudio) this.data.currentAudio.stop()

    const cacheKey = `audio_${audioId}`
    let base64Data = null
    try {
      base64Data = wx.getStorageSync(cacheKey)
    } catch (err) {
      console.log('读取音频缓存失败:', err)
    }
    if (base64Data) {
      this._playBase64Audio(base64Data)
      return
    }

    try {
      wx.showLoading({ title: '加载中...' })
      const res = await audioApi.getBase64(audioId)
      wx.hideLoading()
      if (res.code === 200 && res.data) {
        try {
          wx.setStorageSync(cacheKey, res.data)
        } catch (err) {
          console.log('写入音频缓存失败:', err)
        }
        this._playBase64Audio(res.data)
      }
    } catch (error) {
      wx.hideLoading()
      console.error('播放音频失败:', error)
    }
  },

  _playBase64Audio(base64Data) {
    const innerAudioContext = wx.createInnerAudioContext()
    innerAudioContext.src = `data:audio/mpeg;base64,${base64Data}`
    innerAudioContext.onError((err) => {
      console.error('播放失败:', err)
    })
    innerAudioContext.onEnded(() => {
      this.setData({ currentAudio: null })
    })
    innerAudioContext.play()
    this.setData({ currentAudio: innerAudioContext })
  },

  /* ================= 加入当前词单（分组弹层 + 提交） ================= */

  /**
   * 打开分组选择弹层：首行恒为「无分组」，其后为当前词单分组。
   *
   * 勾选语义对齐首页 `pages/home` 的 `openJoin`：
   *   - **原位置默认勾选**：该词若当前就在本词单的某分组/未分组，那一行初始就是勾选态，
   *     行尾显示「原位置」标签；再点它一次 = 取消（= 提交时从词单移除）。
   *   - **该词不在词单时，初始不勾选任何行**（`joinSel` 在首页也就是 origKeys，为空）。
   *     #015 的记忆只用来"预选"（给出建议选中项），不改变"这一行是否算原位置"。
   *
   * 为什么把"记忆预选"与"原位置勾选"分开：
   *   若把记忆值当成初始勾选、同时又按"点已勾选=取消"处理，
   *   用户点那个默认项时会变成取消勾选，导致什么都没提交（本页曾踩过）。
   */
  openGroupPicker() {
    // 归属还在查询中：先等它完成再弹层，避免「原位置」因时序丢失
    // （实测过快点击会读到 loaded:false，弹层就没有「原位置」标签、默认勾选也退化成记忆值）
    if (this._membershipLoading) {
      wx.showLoading({ title: '加载中...', mask: true })
      this._membershipLoading.then(() => {
        wx.hideLoading()
        this.buildAndShowPicker()
      }).catch(() => {
        wx.hideLoading()
        this.buildAndShowPicker()
      })
      return
    }
    this.buildAndShowPicker()
  },

  /** 真正构建并展示分组弹层（openGroupPicker 的同步主体） */
  buildAndShowPicker() {
    const options = [{ key: NONE_GROUP_KEY, name: '无分组', groupId: null }]
    this.data.groups.forEach(g => {
      options.push({ key: String(g.id), name: g.name, groupId: String(g.id) })
    })

    const m = this.data.membership
    // 原位置：该词当前在本词单里的位置（用于显示「原位置」标签 + 默认勾选）
    const inList = !!(m.loaded && m.inList)
    const origKey = inList ? (m.groupId === null ? NONE_GROUP_KEY : String(m.groupId)) : null

    // 初始勾选：在词单 → 原位置；不在词单 → 用记忆值做预选（仅预选，不算原位置）
    const preselected = inList ? origKey : this.resolveRememberedGroupKey()

    this.setData({
      showGroupPicker: true,
      groupOptions: options,
      // 记录原位置（null 表示该词不在词单，没有任何行是原位置）
      origGroupKey: origKey,
      groupSelectedKey: preselected,
      groupCanConfirm: !!preselected
    })
  },

  /**
   * 计算弹层默认选中的 key（#015 记忆）。
   * @returns {String} 真实分组 id，或 NONE_GROUP_KEY
   */
  resolveRememberedGroupKey() {
    const wordListId = this.data.wordListId
    if (!wordListId) return NONE_GROUP_KEY

    const { found, groupId } = groupMemory.getRememberedGroupId(wordListId)
    if (!found) return NONE_GROUP_KEY
    // 上次特意选的就是「无分组」
    if (groupId === null) return NONE_GROUP_KEY

    // 记忆的分组必须仍在当前词单的分组列表里，否则视为过期
    const exists = this.data.groups.some(g => String(g.id) === String(groupId))
    if (!exists) {
      // 分组被删/换了词单：静默清理这条记忆，避免下次再判断一次
      groupMemory.forgetGroupId(wordListId)
      return NONE_GROUP_KEY
    }
    return groupId
  },

  /**
   * 点击弹层某行：切换勾选（对齐首页 onJoinTap）。
   * - 点已勾选的行 → 取消勾选（若取消的是原位置 = 提交时移除该词）
   * - 点未勾选的行 → 勾选它，并取消其它行（单选互斥）
   *
   * 注意：这里的"已勾选"判断的是**当前勾选态**，不是"是否原位置"。
   * 该词不在词单、但被 #015 记忆预选时，那一行虽然初始是勾选态，
   * 用户点它仍是"取消预选"（不会误提交），这是符合直觉的。
   */
  onGroupRowTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const current = this.data.groupSelectedKey
    const next = (current === key) ? '' : key
    this.setData({
      groupSelectedKey: next,
      // 没有勾选任何行时「确定」置灰（对齐首页 joinCanGo）
      groupCanConfirm: !!next
    })
  },

  closeGroupPicker() {
    this.setData({ showGroupPicker: false })
  },

  /** 阻止弹层内容区域点击冒泡到遮罩 */
  noop() {},

  /** 当前选中的 groupId：字符串或 null（无分组）。未勾选任何行时返回 undefined */
  getSelectedGroupId() {
    const key = this.data.groupSelectedKey
    if (!key) return undefined // 未勾选
    if (key === NONE_GROUP_KEY) return null
    return String(key)
  },

  /** 确认加入：普通结果走 update-relations，AI 结果走 /api/ai-dict/add-word */
  async confirmAdd() {
    if (this.data.submitting) return
    const wordDetail = this.data.wordDetail
    if (!wordDetail) return

    const wordListId = this.data.wordListId
    if (!wordListId) {
      wx.showToast({ title: '词单信息缺失', icon: 'none' })
      return
    }
    const groupId = this.getSelectedGroupId()

    // AI 结果没有「移除」语义（add-word 只负责入库/提交审核），必须选一行
    if (wordDetail._fromAi && groupId === undefined) {
      wx.showToast({ title: '请选择分组', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '加入中...', mask: true })
    try {
      let res
      let successTitle = '已加入词单'

      if (wordDetail._fromAi) {
        // AI 结果：带 logId + selectedIndex（索引，不是 ID）+ 目标词单/分组
        const logId = wordDetail._logId
        const selectedIndex = wordDetail._resultIndex
        if (!logId || selectedIndex === undefined || selectedIndex === null) {
          wx.hideLoading()
          wx.showToast({ title: 'AI 结果信息缺失', icon: 'none' })
          this.setData({ submitting: false })
          return
        }
        res = await aiDictApi.addWordFromWordlist(logId, selectedIndex, wordListId, groupId)
        if (res.code === 200) {
          // 非管理员（needAudit=true）：提交审核，审核通过后由后端加入目标词单
          const needAudit = !!(res.data && res.data.needAudit)
          successTitle = needAudit
            ? '已提交审核，审核通过后将加入词单'
            : '已加入词单'
        }
      } else {
        // 普通结果：wordId 必须存在（后端雪花 ID 序列化为字符串，全程字符串）
        const rawId = wordDetail.word && wordDetail.word.id
        const wordId = (rawId !== undefined && rawId !== null) ? String(rawId) : ''
        if (!wordId) {
          wx.hideLoading()
          wx.showToast({ title: '单词信息缺失', icon: 'none' })
          this.setData({ submitting: false })
          return
        }
        // #014 补漏：普通加词改用 update-relations（与首页一致，支持加/改分组/移除）。
        // ⚠️ 该接口是**全量替换**：后端会先清空该词在所有本人可修改词单里的关系，
        //    再按 targets 重建。所以必须把「其它词单的现有关系」原样带上，
        //    否则会静默删除那些关系（已实测确认会丢数据）。
        const targets = this.buildRelationsTargets(wordListId, groupId)
        res = await groupSource.updateRelations(wordId, targets)
      }

      wx.hideLoading()
      if (res.code === 200) {
        // #015 只在**成功**时写记忆：失败不记，避免记住一个没真正生效的选择。
        // 勾选被取消（移除）时 getSelectedGroupId() 返回 undefined，此时不写记忆。
        if (groupId !== undefined) {
          groupMemory.rememberGroupId(wordListId, groupId)
        }
        this.setData({ showGroupPicker: false })
        wx.showToast({
          title: successTitle,
          icon: 'none',
          duration: successTitle === '已加入词单' ? 1500 : 2000
        })
        // 加词成功后本地更新归属，避免刚加完仍显示旧状态（不做二次请求）
        this.applyMembershipLocally(wordListId, groupId)
        // 留在页内继续查词（不返回）
      } else {
        // 业务错误请求层已统一弹 toast，页面不重复弹
        console.error('加入词单失败:', res.message)
      }
    } catch (error) {
      wx.hideLoading()
      // 网络/超时请求层已统一弹 toast，页面不重复弹
      console.error('加入词单失败:', error)
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 组装 update-relations 的 targets（全量）。
   *
   * ⚠️ 为什么必须拼全量：`WordListService.updateWordListRelations` 会先
   * `deleteModifiableRelationsByWordId` 清空该词在**所有本人可修改词单**里的关系，
   * 再按 targets 重建。本页弹层只展示「当前词单」，若只传这一项，
   * 该词在其它词单里的关系会被静默删除（已实测确认）。首页之所以安全，
   * 是因为它的弹层列出了该词所在的所有词单、勾选即全量。
   *
   * 拼装规则：
   *   targets = 其它词单的现有关系（原样保留 groupId）
   *           + 当前词单：勾选了 → { wordListId, groupId }
   *                        取消勾选（groupId === undefined）→ 不加（= 移除）
   *
   * @param {String} wordListId 当前词单 id（字符串）
   * @param {String|null|undefined} groupId 当前词单的目标分组；undefined 表示移除
   * @returns {Array<{wordListId:String, groupId:String|null}>}
   */
  buildRelationsTargets(wordListId, groupId) {
    const currentId = String(wordListId)
    const others = (this.data.allRelations || [])
      .filter(r => String(r.wordListId) !== currentId)
      .map(r => ({
        wordListId: String(r.wordListId),
        groupId: (r.groupId === null || r.groupId === undefined) ? null : String(r.groupId)
      }))

    if (groupId === undefined) {
      // 取消勾选 → 该词从当前词单移除，其余词单关系保持不变
      return others
    }
    return others.concat([{
      wordListId: currentId,
      groupId: (groupId === null) ? null : String(groupId)
    }])
  },

  /**
   * 加词/移除成功后，本地更新归属状态与关系缓存（不发二次请求）。
   * @param {String} wordListId 当前词单 id
   * @param {String|null|undefined} groupId 目标分组；undefined 表示已移除
   */
  applyMembershipLocally(wordListId, groupId) {
    const currentId = String(wordListId)
    const others = (this.data.allRelations || [])
      .filter(r => String(r.wordListId) !== currentId)

    // 1) 关系缓存
    let allRelations = others
    if (groupId !== undefined) {
      const gname = (this.data.groups.find(g => String(g.id) === String(groupId)) || {}).name || ''
      allRelations = others.concat([{
        wordListId: currentId,
        groupId: (groupId === null) ? null : String(groupId),
        groupName: (groupId === null) ? '' : gname
      }])
    }

    // 2) 归属状态
    let membership
    if (groupId === undefined) {
      membership = { loaded: true, inList: false, groupId: null, groupName: '' }
    } else {
      const gname = (this.data.groups.find(g => String(g.id) === String(groupId)) || {}).name || ''
      membership = {
        loaded: true,
        inList: true,
        groupId: (groupId === null) ? null : String(groupId),
        groupName: (groupId === null) ? '' : gname
      }
    }

    this.setData({ membership, allRelations })
  },

  /* ================= AI 查词 ================= */

  async startAiSearch() {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) return
    if (this.data.aiQueryExhausted) {
      wx.showToast({ title: '今日 AI 查词次数已用完', icon: 'none' })
      return
    }

    this.setData({
      aiStreaming: true,
      aiStatus: 'generating',
      aiPhaseText: '正在提交查询…',
      aiError: ''
    })

    try {
      const { aiDictModel, aiDictTemperature, aiDictThinking, aiDictReasoningEffort } = this.data
      const thinking = aiDictThinking ? true : false
      const reasoningEffort = aiDictThinking ? (aiDictReasoningEffort || 'medium') : null

      // 1. 提交异步查询，获取 logId
      const submitRes = await aiDictApi.submitAsyncQuery(keyword, thinking, reasoningEffort, aiDictModel, aiDictTemperature)
      if (submitRes.code !== 200 || !submitRes.data || !submitRes.data.logId) {
        throw new Error(submitRes.message || '提交查询失败')
      }
      const logId = submitRes.data.logId
      this.setData({ aiPhaseText: '已提交，生成中…' })

      // 2. 轮询查询结果
      const asyncRes = await this.pollAiQueryResult(logId)

      if (asyncRes.code === 200 && asyncRes.data) {
        const { status, results, errorMessage } = asyncRes.data
        if (status === 'failed') {
          this.setData({
            aiStreaming: false,
            aiStatus: 'failed',
            aiPhaseText: '',
            aiError: errorMessage || 'AI 查词失败，请重试'
          })
          return
        }
        if (status === 'success' && results && results.length > 0) {
          const processed = this.processSearchResults(results)
          processed.forEach(item => {
            item._logId = logId
            item._fromAi = true
          })
          this.setData({
            searchResults: processed,
            showAiSearch: false,
            aiStreaming: false,
            aiStatus: '',
            aiPhaseText: '',
            aiError: '',
            isAiResult: true,
            hasMoreResults: false,
            currentPage: 1,
            totalResults: processed.length
          })
          this.refreshAiQueryUsage()
          const recent = [...this.data.recentSearches]
          if (!recent.includes(keyword)) {
            recent.unshift(keyword)
            if (recent.length > 4) recent.pop()
            this.setData({ recentSearches: recent })
          }
        } else {
          this.setData({
            aiStreaming: false,
            aiStatus: 'failed',
            aiPhaseText: '',
            aiError: 'AI 未找到相关释义，换个关键词试试'
          })
        }
      } else {
        throw new Error(asyncRes.message || '查询结果获取失败')
      }
    } catch (error) {
      console.error('AI查词失败:', error)
      this.setData({
        aiStreaming: false,
        aiStatus: 'failed',
        aiPhaseText: '',
        aiError: (error && error.message) || 'AI 查词失败，请重试'
      })
    }
  },

  /**
   * 轮询异步查词结果（与 home 一致：2s 间隔、总上限 5 分钟、连续失败 3 次放弃）
   * 单次轮询为短请求，规避 iOS 上 wx.request 60s 超时上限
   */
  async pollAiQueryResult(logId) {
    const POLL_INTERVAL = 2000
    const TOTAL_TIMEOUT = 5 * 60 * 1000
    const MAX_CONSECUTIVE_FAILURES = 3

    const deadline = Date.now() + TOTAL_TIMEOUT
    let consecutiveFailures = 0

    while (Date.now() < deadline && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      try {
        const res = await aiDictApi.queryAsyncResult(logId)
        consecutiveFailures = 0
        if (res.code === 200 && res.data && res.data.status) {
          if (res.data.status === 'success' || res.data.status === 'failed') {
            return res
          }
        }
      } catch (e) {
        consecutiveFailures++
        console.warn('轮询失败，继续重试:', consecutiveFailures, e && e.message)
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error('网络不稳定，AI 查词中断，请稍后重试')
    }
    throw new Error('AI 查词超时，请稍后重试')
  },

  /* ================= 搜索结果预处理（复制自 home.js） ================= */

  /**
   * 根据后端返回的 matchType 和 matchContent 进行高亮显示
   * matchType: exact/prefix/contain/conjugation/definition
   */
  processSearchResults(data) {
    return data.map((item, idx) => {
      const word = item.word
      const matchType = item.matchType
      const matchContent = item.matchContent || ''

      let kanjiSegments = [{ text: word.kanji || '', highlight: false }]
      let kanaSegments = [{ text: word.kana || '', highlight: false }]
      let definitions = [...(item.definitions || [])]
      let summaryDef = definitions[0]

      if (matchType === 'definition') {
        const matchedDef = definitions.find(d =>
          d.definitionCn && d.definitionCn.includes(matchContent)
        )
        if (matchedDef) {
          summaryDef = {
            ...matchedDef,
            _highlightedCn: this.buildPrefixHighlightSegments(matchedDef.definitionCn || '', matchContent)
          }
        }
        definitions = definitions.map(d => ({
          ...d,
          _highlightedCn: [{ text: d.definitionCn || '', highlight: false }]
        }))
      } else {
        if (matchContent) {
          kanjiSegments = this.buildPrefixHighlightSegments(word.kanji || '', matchContent)
          kanaSegments = this.buildPrefixHighlightSegments(word.kana || '', matchContent)
        }
        definitions = definitions.map(d => ({
          ...d,
          _highlightedCn: [{ text: d.definitionCn || '', highlight: false }]
        }))
        summaryDef = definitions[0]
      }

      return {
        ...item,
        // 供 wx:key 使用：优先取单词 id，AI 结果无 id 时退回索引，保证列表 key 唯一
        id: (word && word.id != null) ? word.id : (item.id != null ? item.id : idx),
        word,
        definitions,
        _kanjiSegments: kanjiSegments,
        _kanaSegments: kanaSegments,
        _summaryDef: summaryDef
      }
    })
  },

  /** 前缀匹配高亮：在文本中查找能匹配的最佳位置，返回 [{ text, highlight }] */
  buildPrefixHighlightSegments(text, matchContent) {
    if (!text || !matchContent) return [{ text: text || '', highlight: false }]

    let bestMatchPos = -1
    let bestMatchLength = 0
    for (let startPos = 0; startPos < text.length; startPos++) {
      let matchedLength = 0
      const remainingTextLength = text.length - startPos
      const minLength = Math.min(remainingTextLength, matchContent.length)
      for (let i = 0; i < minLength; i++) {
        if (text[startPos + i] === matchContent[i]) matchedLength++
        else break
      }
      if (matchedLength > bestMatchLength) {
        bestMatchLength = matchedLength
        bestMatchPos = startPos
      }
    }

    if (bestMatchLength > 0 && bestMatchPos >= 0) {
      const segments = []
      if (bestMatchPos > 0) {
        segments.push({ text: text.substring(0, bestMatchPos), highlight: false })
      }
      segments.push({
        text: text.substring(bestMatchPos, bestMatchPos + bestMatchLength),
        highlight: true
      })
      if (bestMatchPos + bestMatchLength < text.length) {
        segments.push({
          text: text.substring(bestMatchPos + bestMatchLength),
          highlight: false
        })
      }
      return segments
    }
    return [{ text, highlight: false }]
  }
})
