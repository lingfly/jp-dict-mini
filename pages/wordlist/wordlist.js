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
    currentWordList: null // 正在学习的词单（通过 /current 接口获取）
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

  /** 加载正在学习的词单 */
  async loadCurrentWordList() {
    try {
      const res = await wordlistApi.getCurrent()
      if (res.code === 200 && res.data) {
        this.setData({ currentWordList: res.data })
      }
    } catch (error) {
      console.error('加载当前词单失败:', error)
    }
  },

  async loadCategories() {
    try {
      const res = await wordlistApi.getCategories()
      if (res.code === 200 && res.data) {
        this.setData({ categories: res.data })
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
      } else if (this.data.activeCategory) {
        params.category = this.data.activeCategory
      }
      if (this.data.searchKeyword.trim()) {
        params.keyword = this.data.searchKeyword.trim()
      }

      const res = await wordlistApi.list(params)
      if (res.code === 200) {
        const lists = res.data || []
        // 过滤掉正在学习的词单（已在上方单独展示）
        const currentId = this.data.currentWordList ? this.data.currentWordList.id : null
        const filtered = currentId ? lists.filter(item => item.id !== currentId) : lists
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
    this.setData({ activeCategory: category || '', mineOnly: mine })
    this.loadWordLists()
  },

  goWordListDetail(e) {
    const wordListId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/wordlist-detail/wordlist-detail?wordListId=${wordListId}`
    })
  },

  async selectWordList(e) {
    const wordListId = e.currentTarget.dataset.id

    if (this.data.currentWordList && this.data.currentWordList.id === wordListId) {
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
  }
})
