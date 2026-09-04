// pages/wordlist-group-words/wordlist-group-words.js
// 分组详情：以分组为主体的第二个管理入口，解决"往组里加词"和"把词从组里拿出来"
const groupSource = require('../../utils/wordlistGroup')

const NAME_MAX = 20

Page({
  data: {
    wordListId: '',
    groupId: '',
    loading: true,
    group: null,        // { id, name, color, wordCount, learnedCount }
    words: [],          // 组内单词（含 selected 标记）
    ungrouped: [],      // 未分组单词（供「添加单词」使用）

    selectMode: false,
    selectedWordIds: [],
    allOn: false,
    someOn: false,
    selectedCount: 0,

    /* 移动到分组 */
    showMove: false,
    moveTargets: [],
    moveTargetId: '',
    moveCount: 0,

    /* 添加单词 */
    showAdd: false,
    addList: [],
    addSelectedIds: [],
    addCount: 0,

    /* 重命名 */
    showRename: false,
    renameName: '',
    renameValid: false,
    nameMax: NAME_MAX,

    /* 删除 */
    showDelete: false,
    deleteScope: 'words',   // words：移出词单 / group：删除分组
    deleteKeepWords: true,
    delWordCount: 0,
    delGroupWords: 0,

    /* 快捷菜单 */
    showAction: false,

    toastShow: false,
    toastMsg: '',
    toastUndoable: false
  },

  onLoad(options) {
    this.setData({
      wordListId: options.wordListId || '',
      groupId: options.groupId || ''
    })
    this.loadData()
  },

  onUnload() {
    if (this._toastTimer) clearTimeout(this._toastTimer)
  },

  onBack() {
    wx.navigateBack()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await groupSource.fetchGroups(this.data.wordListId)
      if (res.code === 200 && res.data) {
        const g = (res.data.groups || []).find(x => x.id === this.data.groupId)
        if (!g) {
          wx.showToast({ title: '分组不存在', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 800)
          return
        }
        this._groups = res.data.groups || []
        this.setData({
          group: {
            id: g.id,
            name: g.name,
            color: g.color,
            wordCount: g.words.length,
            learnedCount: g.words.filter(w => w.learned).length
          },
          ungrouped: res.data.ungrouped || []
        })
        wx.setNavigationBarTitle({ title: g.name })
        this._rawWords = g.words
      }
    } catch (e) {
      console.error('加载分组详情失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      this.applyView()
    }
  },

  /** 由原始单词 + 选中态推导视图数据 */
  applyView() {
    const words = (this._rawWords || []).map(w => ({
      wordId: w.wordId,
      kanji: w.kanji,
      kana: w.kana,
      meaning: w.meaning,
      learned: w.learned,
      selected: this.data.selectedWordIds.indexOf(w.wordId) > -1
    }))
    const group = this.data.group
    this.setData({
      words,
      group: group ? {
        ...group,
        wordCount: words.length,
        learnedCount: words.filter(w => w.learned).length
      } : null,
      selectedCount: this.data.selectedWordIds.length,
      allOn: words.length > 0 && words.every(w => w.selected),
      someOn: words.some(w => w.selected) && !(words.length > 0 && words.every(w => w.selected))
    })
  },

  /** 通知分组列表页：数据有变动，返回时需要刷新 */
  markDirty() {
    try {
      const app = getApp()
      if (app && app.globalData) app.globalData.groupDirty = true
    } catch (e) {
      // ignore
    }
  },

  /* ================= 多选态 ================= */

  toggleSelectMode() {
    this.setData({
      selectMode: !this.data.selectMode,
      selectedWordIds: []
    })
    this.applyView()
  },

  exitSelectMode() {
    this.setData({ selectMode: false, selectedWordIds: [] })
    this.applyView()
  },

  onSelectAll() {
    const allOn = this.data.allOn
    const ids = allOn ? [] : (this._rawWords || []).map(w => w.wordId)
    this.setData({ selectedWordIds: ids })
    this.applyView()
  },

  onWordCheck(e) {
    const id = e.currentTarget.dataset.id
    const list = this.data.selectedWordIds.slice()
    const idx = list.indexOf(id)
    if (idx > -1) list.splice(idx, 1)
    else list.push(id)
    this.setData({ selectedWordIds: list })
    this.applyView()
  },

  onWordTap(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.selectMode) {
      this.onWordCheck(e)
      return
    }
    wx.navigateTo({ url: `/pages/word-detail/word-detail?wordId=${id}` })
  },

  /* ================= 移出分组 / 移动 / 删除 ================= */

  /** 「移出分组」是详情页专属的一键操作，等价于移动到「未分组」 */
  async onRemoveFromGroup() {
    const ids = this.data.selectedWordIds.slice()
    if (!ids.length) return
    this.takeSnapshot()
    wx.showLoading({ title: '处理中...' })
    try {
      const res = await groupSource.moveWords(this.data.wordListId, ids, '')
      wx.hideLoading()
      if (res.code === 200) {
        this.markDirty()
        this.exitSelectMode()
        await this.loadData()
        this.showToast(`已把 ${ids.length} 个单词移出分组`, true)
      } else {
        this._snapshot = null
      }
    } catch (e) {
      wx.hideLoading()
      this._snapshot = null
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  openMove() {
    const ids = this.data.selectedWordIds.slice()
    if (!ids.length) return
    // 目标列表排除当前分组，避免出现搬进自己这种无意义操作
    const moveTargets = (this._groups || [])
      .filter(g => g.id !== this.data.groupId)
      .map(g => ({ id: g.id, name: g.name, color: g.color, wordCount: g.words.length }))
    this.setData({
      showMove: true,
      moveTargets,
      moveTargetId: '',
      moveCount: ids.length
    })
  },

  closeMove() {
    this.setData({ showMove: false, moveTargetId: '' })
  },

  onMoveTargetTap(e) {
    const t = e.currentTarget.dataset.t
    if (t === '__new') {
      this.setData({ showMove: false, moveTargetId: '' })
      wx.showToast({ title: '请返回分组页新建', icon: 'none' })
      return
    }
    this.setData({ moveTargetId: t })
  },

  async confirmMove() {
    const target = this.data.moveTargetId
    if (!target) return
    const ids = this.data.selectedWordIds.slice()
    const targetId = target === '__none' ? '' : target
    const targetName = targetId
      ? ((this._groups || []).find(g => g.id === targetId) || {}).name
      : '未分组'
    this.takeSnapshot()
    this.setData({ showMove: false, moveTargetId: '' })
    wx.showLoading({ title: '移动中...' })
    try {
      const res = await groupSource.moveWords(this.data.wordListId, ids, targetId)
      wx.hideLoading()
      if (res.code === 200) {
        this.markDirty()
        this.exitSelectMode()
        await this.loadData()
        this.showToast(`已移动 ${ids.length} 个单词到「${targetName}」`, true)
      } else {
        this._snapshot = null
      }
    } catch (e) {
      wx.hideLoading()
      this._snapshot = null
      wx.showToast({ title: '移动失败', icon: 'none' })
    }
  },

  /** 底部「删除」：把选中的单词移出词单 */
  openDeleteWords() {
    const ids = this.data.selectedWordIds.slice()
    if (!ids.length) return
    this.setData({
      showDelete: true,
      deleteScope: 'words',
      deleteKeepWords: true,
      delWordCount: ids.length,
      delGroupWords: 0
    })
  },

  closeDelete() {
    this.setData({ showDelete: false })
  },

  onKeepChange(e) {
    this.setData({ deleteKeepWords: e.currentTarget.dataset.keep === '1' })
  },

  async confirmDelete() {
    const scope = this.data.deleteScope
    this.takeSnapshot()
    this.setData({ showDelete: false })
    wx.showLoading({ title: '删除中...' })
    try {
      if (scope === 'group') {
        await groupSource.removeGroup(this.data.wordListId, this.data.groupId, this.data.deleteKeepWords)
        wx.hideLoading()
        this.markDirty()
        this.showToast('已删除分组', true)
        setTimeout(() => wx.navigateBack(), 600)
        return
      }
      const ids = this.data.selectedWordIds.slice()
      await groupSource.deleteWords(this.data.wordListId, ids)
      wx.hideLoading()
      this.markDirty()
      this.exitSelectMode()
      await this.loadData()
      this.showToast(`已移除 ${ids.length} 个单词`, true)
    } catch (e) {
      wx.hideLoading()
      this._snapshot = null
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  /* ================= 添加单词 ================= */

  openAdd() {
    const addList = (this.data.ungrouped || []).map(w => ({
      wordId: w.wordId,
      kanji: w.kanji,
      kana: w.kana,
      meaning: w.meaning,
      selected: false
    }))
    this.setData({
      showAdd: true,
      addList,
      addSelectedIds: [],
      addCount: 0
    })
  },

  closeAdd() {
    this.setData({ showAdd: false })
  },

  onAddItemTap(e) {
    const id = e.currentTarget.dataset.id
    const ids = this.data.addSelectedIds.slice()
    const idx = ids.indexOf(id)
    if (idx > -1) ids.splice(idx, 1)
    else ids.push(id)
    const addList = this.data.addList.map(w => ({ ...w, selected: ids.indexOf(w.wordId) > -1 }))
    this.setData({ addSelectedIds: ids, addList, addCount: ids.length })
  },

  async confirmAdd() {
    const ids = this.data.addSelectedIds.slice()
    if (!ids.length) return
    this.takeSnapshot()
    this.setData({ showAdd: false })
    wx.showLoading({ title: '添加中...' })
    try {
      const res = await groupSource.addWords(this.data.wordListId, this.data.groupId, ids)
      wx.hideLoading()
      if (res.code === 200) {
        this.markDirty()
        await this.loadData()
        this.showToast(`已添加 ${ids.length} 个单词到「${this.data.group.name}」`, true)
      } else {
        this._snapshot = null
      }
    } catch (e) {
      wx.hideLoading()
      this._snapshot = null
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  },

  /* ================= 快捷菜单 ================= */

  openAction() {
    this.setData({ showAction: true })
  },

  closeAction() {
    this.setData({ showAction: false })
  },

  onActionTap(e) {
    const a = e.currentTarget.dataset.a
    this.setData({ showAction: false })
    if (a === 'rename') {
      this.setData({
        showRename: true,
        renameName: this.data.group ? this.data.group.name : '',
        renameValid: false
      })
    } else if (a === 'add') {
      this.openAdd()
    } else if (a === 'delete') {
      this.setData({
        showDelete: true,
        deleteScope: 'group',
        deleteKeepWords: true,
        delWordCount: 0,
        delGroupWords: this.data.group ? this.data.group.wordCount : 0
      })
    }
  },

  /* ================= 重命名 ================= */

  closeRename() {
    this.setData({ showRename: false })
  },

  onRenameInput(e) {
    const v = e.detail.value || ''
    const cur = this.data.group ? this.data.group.name : ''
    this.setData({
      renameName: v,
      renameValid: !!v.trim() && v.trim() !== cur
    })
  },

  async confirmRename() {
    const name = (this.data.renameName || '').trim()
    if (!name || !this.data.renameValid) return
    wx.showLoading({ title: '保存中...' })
    try {
      const color = this.data.group ? this.data.group.color : groupSource.GROUP_COLORS[0]
      const res = await groupSource.updateGroup(this.data.wordListId, this.data.groupId, name, color)
      wx.hideLoading()
      if (res.code === 200) {
        this.markDirty()
        this.setData({ showRename: false })
        await this.loadData()
        this.showToast(`已重命名为「${name}」`)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  /* ================= 撤销 ================= */

  takeSnapshot() {
    this._snapshot = {
      groups: JSON.parse(JSON.stringify(this._groups || [])),
      ungrouped: JSON.parse(JSON.stringify(this.data.ungrouped || []))
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
      this.markDirty()
      this.exitSelectMode()
      await this.loadData()
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

  noop() {}
})
