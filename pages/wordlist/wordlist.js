// pages/wordlist/wordlist.js
const { wordlistApi } = require('../../utils/api')

Page({
  data: {
    searchKeyword: '',
    loading: false,
    wordLists: [],
    categories: [],
    activeCategory: '',
    mineOnly: true,
    favoriteOnly: false,
    currentWordList: null, // 正在学习的词单（通过 /current 接口获取）
    activeMenuId: '',      // 当前展开"更多"菜单的词单 id（空表示关闭）
    activeMenuName: '',    // 当前展开菜单的词单名称
    showCreateDialog: false, // 是否显示创建/编辑词单弹窗
    dialogMode: 'create',    // 弹窗模式：create 创建 / edit 编辑
    editingWordListId: '',   // 编辑时的词单 id
    createName: '',          // 词单名称输入
    createDescription: '',   // 词单描述输入
    createIsPublic: false,   // 词单是否公开
    categoryLabels: [],      // 分类标签列表（用于 picker 展示）
    createCategoryIndex: 0   // 选中的分类索引
  },

  onLoad() {
    this.loadCategories()
    this.loadCurrentWordList()
    this.loadWordLists()
  },

  onShow() {
    this.loadCurrentWordList()
    // 退出词单详情页后回到 tabBar 页面，刷新复习角标（加词后角标在此可靠更新）
    getApp().updateReviewBadge()
  },

  /** 加载正在学习的词单（通过 /current 接口） */
  async loadCurrentWordList() {
    try {
      const res = await wordlistApi.getCurrent()
      if (res.code === 200 && res.data) {
        this.setData({ currentWordList: res.data })
      } else {
        this.setData({ currentWordList: null })
      }
    } catch (error) {
      console.error('加载当前词单失败:', error)
    }
  },

  async loadCategories() {
    try {
      const res = await wordlistApi.getCategories()
      if (res.code === 200 && res.data) {
        const labels = res.data.map(item => item.label)
        this.setData({ categories: res.data, categoryLabels: labels })
      }
    } catch (error) {
      console.error('加载分类失败:', error)
    }
  },

  async loadWordLists() {
    this.setData({ loading: true })
    try {
      const params = {}
      if (this.data.mineOnly) {
        params.mineOnly = true
      } else if (this.data.favoriteOnly) {
        params.favoriteOnly = true
      } else if (this.data.activeCategory) {
        params.category = this.data.activeCategory
      }
      if (this.data.searchKeyword.trim()) {
        params.keyword = this.data.searchKeyword.trim()
      }

      const res = await wordlistApi.list(params)
      if (res.code === 200) {
        const lists = res.data || []
        // 仅"我的"分类下过滤掉正在学习的词单（其已在上方"正在学习"区单独展示）
        let filtered = lists
        if (this.data.mineOnly && this.data.currentWordList) {
          const currentId = String(this.data.currentWordList.id)
          filtered = lists.filter(item => String(item.id) !== currentId)
        }
        this.setData({ wordLists: filtered })
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      console.error('加载词单列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearchConfirm() {
    this.loadWordLists()
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    const mine = e.currentTarget.dataset.mine === 'true'
    const favorite = e.currentTarget.dataset.favorite === 'true'
    this.setData({
      activeCategory: category || '',
      mineOnly: mine,
      favoriteOnly: favorite
    })
    this.loadWordLists()
  },

  goWordListDetail(e) {
    const wordListId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/wordlist-detail/wordlist-detail?wordListId=${wordListId}`
    })
  },

  async selectWordList(wordListId) {
    if (this.data.currentWordList && String(this.data.currentWordList.id) === String(wordListId)) {
      wx.showToast({ title: '已是当前词单', icon: 'none' })
      return
    }

    wx.showLoading({ title: '切换中...' })
    try {
      const app = getApp()
      const res = await wordlistApi.select(app.globalData.userId, wordListId)
      if (res.code === 200) {
        wx.showToast({ title: '切换成功', icon: 'success' })
        await this.loadCurrentWordList()
        this.loadWordLists()
      } else {
        wx.showToast({ title: res.message || '切换失败', icon: 'none' })
      }
    } catch (error) {
      console.error('选择词单失败:', error)
      wx.showToast({ title: '切换失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  /** 点击"更多"按钮：切换显示/隐藏旁边的小菜单 */
  onMoreTap(e) {
    const { id, name } = e.currentTarget.dataset
    if (this.data.activeMenuId === id) {
      // 再次点击同一个按钮则关闭
      this.closeMenu()
      return
    }
    // 保存完整词单对象，供编辑等操作使用
    const all = this.data.currentWordList
      ? [this.data.currentWordList, ...this.data.wordLists]
      : this.data.wordLists
    const wordList = all.find(item => String(item.id) === String(id)) || null
    this._activeWordList = wordList
    this.setData({ activeMenuId: id, activeMenuName: name })
  },

  /** 关闭弹出菜单 */
  closeMenu() {
    if (this.data.activeMenuId) {
      this.setData({ activeMenuId: '', activeMenuName: '' })
    }
    this._activeWordList = null
  },

  /** 点击菜单项 */
  onMenuAction(e) {
    const action = e.currentTarget.dataset.action
    const id = this.data.activeMenuId
    const name = this.data.activeMenuName
    if (!id) return
    // 先取出完整词单对象（closeMenu 会清空 _activeWordList）
    const wordList = this._activeWordList
    this.closeMenu()

    if (action === 'edit') {
      this.openEditDialog({ id, wordList })
    } else if (action === 'delete') {
      this.onDeleteWordList(id, name)
    } else if (action === 'select') {
      this.selectWordList(id)
    } else if (action === 'clear') {
      this.onClearCurrentWordList()
    } else if (action === 'favorite') {
      this.toggleFavorite(id, wordList && wordList.isFavorite)
    }
  },

  /** 收藏/取消收藏词单 */
  async toggleFavorite(id, isFavorite) {
    wx.showLoading({ title: '处理中...' })
    try {
      const res = isFavorite
        ? await wordlistApi.unfavoriteList(id)
        : await wordlistApi.favoriteList(id)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: isFavorite ? '已取消收藏' : '已收藏', icon: 'success' })
        this.loadCurrentWordList()
        this.loadWordLists()
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('收藏操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  /** 取消当前学习词单 */
  onClearCurrentWordList() {
    wx.showModal({
      title: '取消学习',
      content: '确定要取消当前学习词单吗？',
      confirmText: '取消学习',
      confirmColor: '#E64340',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          const result = await wordlistApi.clearCurrent()
          wx.hideLoading()
          if (result.code === 200) {
            wx.showToast({ title: '已取消学习', icon: 'success' })
            this.loadCurrentWordList()
            this.loadWordLists()
          } else {
            wx.showToast({ title: result.message || '操作失败', icon: 'none' })
          }
        } catch (error) {
          wx.hideLoading()
          console.error('取消学习失败:', error)
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  /** 打开编辑弹窗（复用创建弹窗，预填词单数据） */
  openEditDialog({ id, wordList }) {
    const info = wordList || {}
    // 计算分类索引
    let categoryIndex = 0
    if (info.category) {
      const idx = this.data.categories.findIndex(c => c.code === info.category)
      if (idx > -1) categoryIndex = idx
    }
    this.setData({
      showCreateDialog: true,
      dialogMode: 'edit',
      editingWordListId: id,
      createName: info.name || '',
      createDescription: info.description || '',
      createIsPublic: info.isPublic === true || info.isPublic === 1,
      createCategoryIndex: categoryIndex
    })
  },

  /** 更新词单（对齐 UpdateWordListRequest，不传封面图 coverImage） */
  async updateWordList(id, name, description, category, isPublic) {
    wx.showLoading({ title: '保存中...' })
    try {
      const res = await wordlistApi.update(id, name, description, category, isPublic)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.setData({ showCreateDialog: false })
        this.loadCurrentWordList()
        this.loadWordLists()
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('编辑词单失败:', error)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  /** 删除词单 */
  onDeleteWordList(id, name) {
    wx.showModal({
      title: '删除词单',
      content: `确定要删除「${name}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#E64340',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          const result = await wordlistApi.remove(id)
          wx.hideLoading()
          if (result.code === 200) {
            wx.showToast({ title: '删除成功', icon: 'success' })
            this.loadCurrentWordList()
            this.loadWordLists()
          } else {
            wx.showToast({ title: result.message || '删除失败', icon: 'none' })
          }
        } catch (error) {
          wx.hideLoading()
          console.error('删除词单失败:', error)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  /** 点击右下角创建按钮 */
  onCreateTap() {
    this.setData({
      showCreateDialog: true,
      dialogMode: 'create',
      editingWordListId: '',
      createName: '',
      createDescription: '',
      createIsPublic: false,
      createCategoryIndex: 0
    })
  },

  /** 关闭创建弹窗 */
  closeCreateDialog() {
    this.setData({ showCreateDialog: false })
  },

  /** 空方法，用于阻止弹窗冒泡 */
  noop() {},

  /** 输入词单名称（截断超长，最多100字符） */
  onCreateNameInput(e) {
    let value = e.detail.value || ''
    if (value.length > 100) value = value.slice(0, 100)
    this.setData({ createName: value })
  },

  /** 输入词单描述（截断超长，最多500字符） */
  onCreateDescriptionInput(e) {
    let value = e.detail.value || ''
    if (value.length > 500) value = value.slice(0, 500)
    this.setData({ createDescription: value })
  },

  /** 选择分类 */
  onCreateCategoryChange(e) {
    this.setData({ createCategoryIndex: Number(e.detail.value) })
  },

  /** 切换是否公开 */
  togglePublic() {
    this.setData({ createIsPublic: !this.data.createIsPublic })
  },

  /** 提交（创建或编辑） */
  submitCreate() {
    const name = (this.data.createName || '').trim()
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    if (name.length > 100) {
      wx.showToast({ title: '名称最长100字符', icon: 'none' })
      return
    }
    const category = this.data.categories[this.data.createCategoryIndex]
    if (!category || !category.code) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }
    const description = (this.data.createDescription || '').trim()
    if (description.length > 500) {
      wx.showToast({ title: '描述最长500字符', icon: 'none' })
      return
    }
    const isPublic = this.data.createIsPublic ? 1 : 0

    if (this.data.dialogMode === 'edit') {
      this.updateWordList(this.data.editingWordListId, name, description, category.code, isPublic)
    } else {
      this.createWordList(name, category.code, description, isPublic)
    }
  },

  /** 创建词单（不传封面图 coverImage） */
  async createWordList(name, category, description, isPublic) {
    wx.showLoading({ title: '创建中...' })
    try {
      const res = await wordlistApi.create(name, category, description, isPublic)
      wx.hideLoading()
      if (res.code === 200) {
        wx.showToast({ title: '创建成功', icon: 'success' })
        this.setData({ showCreateDialog: false })
        this.loadWordLists()
      } else {
        wx.showToast({ title: res.message || '创建失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('创建词单失败:', error)
      wx.showToast({ title: '创建失败', icon: 'none' })
    }
  }
})
