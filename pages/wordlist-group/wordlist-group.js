// pages/wordlist-group/wordlist-group.js
// 词单分组管理：分组与「未分组单词」平铺同一列表，浏览态 / 多选批处理双状态
const groupSource = require('../../utils/wordlistGroup')

const UNGROUPED_LIMIT = 8 // 未分组默认渲染条数，避免长列表把分组挤到屏幕外
const NAME_MAX = 20

Page({
  data: {
    wordListId: '',
    wordListName: '',
    loading: true,

    /* 原始数据 */
    groups: [],
    ungrouped: [],

    /* 视图数据 */
    viewGroups: [],
    visibleWords: [],
    totalGroups: 0,
    totalWords: 0,
    totalUngrouped: 0,
    hasMoreUngrouped: false,
    showAllUngrouped: false,

    /* 多选态 */
    selectMode: false,
    selectedGroupIds: [],
    selectedWordIds: [],
    selectedCount: 0,
    groupAllOn: false,
    groupSomeOn: false,
    wordAllOn: false,
    wordSomeOn: false,
    canRename: false,
    canMove: false,
    canDelete: false,

    /* 移动到分组 */
    showMove: false,
    moveTargets: [],
    moveTargetId: '',
    moveCount: 0,

    /* 重命名 */
    showRename: false,
    renameId: '',
    renameName: '',
    renameValid: false,

    /* 新建分组 */
    showCreate: false,
    createName: '',
    createColor: '',
    createValid: false,
    groupColors: groupSource.GROUP_COLORS,
    nameMax: NAME_MAX,

    /* 删除 */
    showDelete: false,
    deleteKeepWords: true,
    delGroupCount: 0,
    delGroupWords: 0,
    delWordCount: 0,

    /* 分组快捷菜单 */
    showAction: false,
    actGroup: null,

    /* 轻提示 */
    toastShow: false,
    toastMsg: '',
    toastUndoable: false
  },

  onLoad(options) {
    const wordListId = options.wordListId || ''
    const wordListName = options.name ? decodeURIComponent(options.name) : ''
    this.setData({ wordListId, wordListName })
    if (wordListName) {
      wx.setNavigationBarTitle({ title: wordListName })
    }
    this.loadGroups()
  },

  onShow() {
    // 从分组详情页返回后刷新（详情页可能改过分组内容）
    let dirty = !!this._dirty
    this._dirty = false
    try {
      const app = getApp()
      if (app && app.globalData && app.globalData.groupDirty) {
        app.globalData.groupDirty = false
        dirty = true
      }
    } catch (e) {
      // ignore
    }
    if (dirty) this.loadGroups()
  },

  onUnload() {
    if (this._toastTimer) clearTimeout(this._toastTimer)
  },

  /* ================= 数据加载 ================= */

  async loadGroups() {
    this.setData({ loading: true })
    try {
      const res = await groupSource.fetchGroups(this.data.wordListId)
      if (res.code === 200 && res.data) {
        this.setData({
          groups: res.data.groups || [],
          ungrouped: res.data.ungrouped || []
        })
      }
    } catch (e) {
      console.error('加载分组失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      this.applyView()
    }
  },

  /** 由原始数据推导全部视图状态 */
  applyView() {
    const { groups, ungrouped, selectedGroupIds, selectedWordIds, showAllUngrouped } = this.data
    const gSet = {}
    selectedGroupIds.forEach(id => { gSet[id] = true })
    const wSet = {}
    selectedWordIds.forEach(id => { wSet[id] = true })

    const viewGroups = groups.map(g => {
      const total = g.words.length
      const learned = g.words.filter(w => w.learned).length
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        wordCount: total,
        selected: !!gSet[g.id],
        isEmpty: total === 0,
        // 空分组用橙色提示，而不是自动删除（自动删除会让分组排序莫名错位）
        meta: total === 0
          ? '0 个单词 · 空分组'
          : `${total} 个单词 · 已掌握 ${Math.round(learned / total * 100)}%`
      }
    })

    const groupWords = groups.reduce((a, g) => a + g.words.length, 0)
    const viewWords = ungrouped.map(w => ({
      wordId: w.wordId,
      kanji: w.kanji,
      kana: w.kana,
      meaning: w.meaning,
      learned: w.learned,
      selected: !!wSet[w.wordId]
    }))
    const visibleWords = showAllUngrouped ? viewWords : viewWords.slice(0, UNGROUPED_LIMIT)

    const selGroupCount = selectedGroupIds.length
    const selWordCount = selectedWordIds.length
    const moveCount = selWordCount + groups
      .filter(g => gSet[g.id])
      .reduce((a, g) => a + g.words.length, 0)

    this.setData({
      viewGroups,
      visibleWords,
      totalGroups: groups.length,
      totalUngrouped: ungrouped.length,
      totalWords: groupWords + ungrouped.length,
      hasMoreUngrouped: ungrouped.length > UNGROUPED_LIMIT,
      groupAllOn: groups.length > 0 && selGroupCount === groups.length,
      groupSomeOn: selGroupCount > 0 && selGroupCount < groups.length,
      wordAllOn: visibleWords.length > 0 && visibleWords.every(w => w.selected),
      wordSomeOn: visibleWords.some(w => w.selected) && !(visibleWords.length > 0 && visibleWords.every(w => w.selected)),
      selectedCount: selGroupCount + selWordCount,
      // 选中项 → 可用操作矩阵
      canRename: selGroupCount === 1 && selWordCount === 0,
      canMove: moveCount > 0,
      canDelete: selGroupCount + selWordCount > 0
    })
  },

  /** 当前待移动的单词 id：直接选中的单词 + 选中分组内的全部单词 */
  collectMoveWordIds() {
    const wSet = {}
    this.data.selectedWordIds.forEach(id => { wSet[id] = true })
    const gSet = {}
    this.data.selectedGroupIds.forEach(id => { gSet[id] = true })
    this.data.groups.forEach(g => {
      if (!gSet[g.id]) return
      g.words.forEach(w => { wSet[w.wordId] = true })
    })
    return Object.keys(wSet)
  },

  /* ================= 多选态 ================= */

  toggleSelectMode() {
    const selectMode = !this.data.selectMode
    this.setData({
      selectMode,
      selectedGroupIds: [],
      selectedWordIds: []
    })
    this.applyView()
  },

  exitSelectMode() {
    this.setData({ selectMode: false, selectedGroupIds: [], selectedWordIds: [] })
    this.applyView()
  },

  onSelectAll(e) {
    const scope = e.currentTarget.dataset.scope
    if (scope === 'group') {
      const allOn = this.data.groupAllOn
      this.setData({ selectedGroupIds: allOn ? [] : this.data.groups.map(g => g.id) })
    } else {
      const allOn = this.data.wordAllOn
      const ids = (this.data.showAllUngrouped
        ? this.data.ungrouped
        : this.data.ungrouped.slice(0, UNGROUPED_LIMIT)).map(w => w.wordId)
      this.setData({ selectedWordIds: allOn ? [] : ids })
    }
    this.applyView()
  },

  onGroupCheck(e) {
    this._toggleId('selectedGroupIds', e.currentTarget.dataset.id)
  },

  onWordCheck(e) {
    this._toggleId('selectedWordIds', e.currentTarget.dataset.id)
  },

  _toggleId(key, id) {
    const list = this.data[key].slice()
    const idx = list.indexOf(id)
    if (idx > -1) list.splice(idx, 1)
    else list.push(id)
    this.setData({ [key]: list })
    this.applyView()
  },

  /* ================= 行点击 ================= */

  onGroupTap(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.selectMode) {
      this._toggleId('selectedGroupIds', id)
      return
    }
    // 浏览态：进入分组详情（在这里做"往组里加词 / 把词从组里拿出来"）
    this._dirty = true
    wx.navigateTo({
      url: `/pages/wordlist-group-words/wordlist-group-words?wordListId=${this.data.wordListId}&groupId=${id}`
    })
  },

  onWordTap(e) {
    const wordId = e.currentTarget.dataset.id
    if (this.data.selectMode) {
      this._toggleId('selectedWordIds', wordId)
      return
    }
    wx.navigateTo({ url: `/pages/word-detail/word-detail?wordId=${wordId}` })
  },

  onToggleUngrouped() {
    this.setData({ showAllUngrouped: !this.data.showAllUngrouped })
    this.applyView()
  },

  /** 未分组分区头的「全部移至分组」：直接选中全部未分组单词并打开移动弹层 */
  onMoveAllUngrouped() {
    if (!this.data.ungrouped.length) return
    this.setData({
      selectMode: true,
      selectedGroupIds: [],
      selectedWordIds: this.data.ungrouped.map(w => w.wordId),
      showAllUngrouped: true
    })
    this.applyView()
    this.openMove()
  },

  /* ================= 新建分组 ================= */

  openCreate() {
    const colors = groupSource.GROUP_COLORS
    this.setData({
      showCreate: true,
      createName: '',
      createValid: false,
      createColor: colors[this.data.groups.length % colors.length]
    })
  },

  closeCreate() {
    this.setData({ showCreate: false })
  },

  onCreateNameInput(e) {
    const v = e.detail.value || ''
    this.setData({ createName: v, createValid: !!v.trim() })
  },

  onColorTap(e) {
    this.setData({ createColor: e.currentTarget.dataset.color })
  },

  async confirmCreate() {
    const name = (this.data.createName || '').trim()
    if (!name) return
    wx.showLoading({ title: '创建中...' })
    try {
      const res = await groupSource.createGroup(this.data.wordListId, name, this.data.createColor)
      wx.hideLoading()
      if (res.code === 200) {
        this.setData({ showCreate: false })
        await this.loadGroups()
        this.showToast(`已创建分组「${name}」`)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '创建失败', icon: 'none' })
    }
  },

  /* ================= 重命名 ================= */

  openRename(group) {
    if (!group) return
    this.setData({
      showRename: true,
      renameId: group.id,
      renameName: group.name,
      renameValid: false
    })
  },

  onRenameTap() {
    const g = this.data.groups.find(x => x.id === this.data.selectedGroupIds[0])
    this.openRename(g)
  },

  closeRename() {
    this.setData({ showRename: false })
  },

  onRenameInput(e) {
    const v = e.detail.value || ''
    const g = this.data.groups.find(x => x.id === this.data.renameId)
    const dup = this.data.groups.some(x => x.id !== this.data.renameId && x.name === v.trim())
    this.setData({
      renameName: v,
      renameValid: !!v.trim() && !dup && v.trim() !== (g ? g.name : '')
    })
  },

  async confirmRename() {
    const name = (this.data.renameName || '').trim()
    if (!name || !this.data.renameValid) return
    wx.showLoading({ title: '保存中...' })
    try {
      const g = this.data.groups.find(x => x.id === this.data.renameId)
      const res = await groupSource.updateGroup(this.data.wordListId, this.data.renameId, name, g ? g.color : groupSource.GROUP_COLORS[0])
      wx.hideLoading()
      if (res.code === 200) {
        this.setData({ showRename: false })
        this.exitSelectMode()
        await this.loadGroups()
        this.showToast(`已重命名为「${name}」`)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  /* ================= 移动 ================= */

  openMove() {
    const wordIds = this.collectMoveWordIds()
    if (!wordIds.length) return
    const gSet = {}
    this.data.selectedGroupIds.forEach(id => { gSet[id] = true })
    // 目标列表排除选中的分组，避免"搬进自己"这种无意义操作
    const moveTargets = this.data.groups
      .filter(g => !gSet[g.id])
      .map(g => ({ id: g.id, name: g.name, color: g.color, wordCount: g.words.length }))
    this.setData({
      showMove: true,
      moveTargets,
      moveTargetId: '',
      moveCount: wordIds.length
    })
  },

  closeMove() {
    this.setData({ showMove: false, moveTargetId: '' })
  },

  onMoveTargetTap(e) {
    const t = e.currentTarget.dataset.t
    if (t === '__new') {
      this.setData({ showMove: false, moveTargetId: '' })
      this.openCreate()
      return
    }
    this.setData({ moveTargetId: t })
  },

  async confirmMove() {
    const target = this.data.moveTargetId
    if (!target) return
    const wordIds = this.collectMoveWordIds()
    const targetId = target === '__none' ? '' : target
    const targetName = targetId
      ? (this.data.groups.find(g => g.id === targetId) || {}).name
      : '未分组'

    this.takeSnapshot()
    this.setData({ showMove: false, moveTargetId: '' })
    wx.showLoading({ title: '移动中...' })
    try {
      const res = await groupSource.moveWords(this.data.wordListId, wordIds, targetId)
      wx.hideLoading()
      if (res.code === 200) {
        this.exitSelectMode()
        await this.loadGroups()
        this.showToast(`已移动 ${wordIds.length} 个单词到「${targetName}」`, true)
      } else {
        this._snapshot = null
      }
    } catch (e) {
      wx.hideLoading()
      this._snapshot = null
      wx.showToast({ title: '移动失败', icon: 'none' })
    }
  },

  /* ================= 删除 ================= */

  openDelete() {
    const gSet = {}
    this.data.selectedGroupIds.forEach(id => { gSet[id] = true })
    const selGroups = this.data.groups.filter(g => gSet[g.id])
    // 删除的语义：分组按分组处理，未分组单词按"移出词单"处理
    const delWordCount = this.data.selectedWordIds.length
    this.setData({
      showDelete: true,
      deleteKeepWords: true,
      delGroupCount: selGroups.length,
      delGroupWords: selGroups.reduce((a, g) => a + g.words.length, 0),
      delWordCount
    })
  },

  closeDelete() {
    this.setData({ showDelete: false })
  },

  onKeepChange(e) {
    this.setData({ deleteKeepWords: e.currentTarget.dataset.keep === '1' })
  },

  async confirmDelete() {
    const { selectedGroupIds, selectedWordIds, deleteKeepWords } = this.data
    this.takeSnapshot()
    this.setData({ showDelete: false })
    wx.showLoading({ title: '删除中...' })
    try {
      for (let i = 0; i < selectedGroupIds.length; i++) {
        await groupSource.removeGroup(this.data.wordListId, selectedGroupIds[i], deleteKeepWords)
      }
      if (selectedWordIds.length) {
        await groupSource.deleteWords(this.data.wordListId, selectedWordIds)
      }
      wx.hideLoading()
      this.exitSelectMode()
      await this.loadGroups()

      const msg = []
      if (selectedGroupIds.length) msg.push(`已删除 ${selectedGroupIds.length} 个分组`)
      if (selectedWordIds.length) msg.push(`已移除 ${selectedWordIds.length} 个单词`)
      this.showToast(msg.join('，'), true)
    } catch (e) {
      wx.hideLoading()
      this._snapshot = null
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  /* ================= 分组快捷菜单 ================= */

  openAction(e) {
    const g = this.data.groups.find(x => x.id === e.currentTarget.dataset.id)
    if (!g) return
    this.setData({
      showAction: true,
      actGroup: { id: g.id, name: g.name, wordCount: g.words.length }
    })
  },

  closeAction() {
    this.setData({ showAction: false })
  },

  onActionTap(e) {
    const a = e.currentTarget.dataset.a
    const g = this.data.actGroup
    this.setData({ showAction: false })
    if (!g) return
    if (a === 'rename') {
      const full = this.data.groups.find(x => x.id === g.id)
      this.openRename(full)
    } else if (a === 'move') {
      this.setData({ selectMode: true, selectedGroupIds: [g.id], selectedWordIds: [] })
      this.applyView()
      this.openMove()
    } else if (a === 'delete') {
      this.setData({ selectMode: true, selectedGroupIds: [g.id], selectedWordIds: [] })
      this.applyView()
      this.openDelete()
    }
  },

  /* ================= 撤销 ================= */

  takeSnapshot() {
    this._snapshot = {
      groups: JSON.parse(JSON.stringify(this.data.groups)),
      ungrouped: JSON.parse(JSON.stringify(this.data.ungrouped))
    }
  },

  async onUndo() {
    const snap = this._snapshot
    this._snapshot = null
    this.hideToast()
    if (!snap) return

    // 检查是否使用 mock 模式
    const groupSource = require('../../utils/wordlistGroup')
    if (!groupSource.USE_MOCK) {
      wx.showToast({ title: '后端暂不支持撤销', icon: 'none' })
      return
    }

    wx.showLoading({ title: '撤销中...' })
    try {
      await groupSource.sync(this.data.wordListId, snap.groups, snap.ungrouped)
      wx.hideLoading()
      this.exitSelectMode()
      await this.loadGroups()
      this.showToast('已撤销')
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '撤销失败', icon: 'none' })
    }
  },

  /* ================= 轻提示 ================= */

  showToast(msg, undoable) {
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this.setData({ toastShow: true, toastMsg: msg, toastUndoable: !!undoable })
    this._toastTimer = setTimeout(() => this.hideToast(), undoable ? 5000 : 2200)
  },

  hideToast() {
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this.setData({ toastShow: false })
  },

  /** 阻止弹层内容区域的点击冒泡到遮罩 */
  noop() {}
})
