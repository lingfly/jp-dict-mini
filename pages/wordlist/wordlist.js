// pages/wordlist/wordlist.js
const { wordlistApi } = require('../../utils/api')

Page({
  data: {
    searchKeyword: '',
    loading: false,
    wordLists: [],
    // 分类相关
    categories: [],
    activeCategory: '', // 空字符串表示"全部"
    mineOnly: false // 是否只看我的词单
  },

  onLoad() {
    this.loadCategories()
    this.loadWordLists()
  },

  /**
   * 加载分类列表
   */
  async loadCategories() {
    try {
      const res = await wordlistApi.getCategories()
      if (res.code === 200 && res.data) {
        this.setData({
          categories: res.data
        })
      }
    } catch (error) {
      console.error('加载分类失败:', error)
    }
  },

  /**
   * 加载词单列表
   */
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
        this.setData({
          wordLists: res.data || []
        })
      } else {
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('加载词单列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  /**
   * 搜索确认
   */
  onSearchConfirm() {
    this.loadWordLists()
  },

  /**
   * 切换分类
   */
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    const mine = e.currentTarget.dataset.mine === 'true'
    this.setData({
      activeCategory: category || '',
      mineOnly: mine
    })
    this.loadWordLists()
  },

  /**
   * 进入词单详情
   */
  goWordListDetail(e) {
    const wordListId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/wordlist-detail/wordlist-detail?wordListId=${wordListId}`
    })
  },

  /**
   * 选择词单（设为当前学习词单）
   */
  async selectWordList(e) {
    const wordListId = e.currentTarget.dataset.id

    const currentList = this.data.wordLists.find(item => item.id === wordListId)
    if (currentList && currentList.isCurrent) {
      wx.showToast({
        title: '已是当前词单',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '切换中...' })

    try {
      const app = getApp()
      const res = await wordlistApi.select(app.globalData.userId, wordListId)

      if (res.code === 200) {
        wx.showToast({
          title: '切换成功',
          icon: 'success'
        })
        // 刷新列表
        this.loadWordLists()
      } else {
        wx.showToast({
          title: res.message || '切换失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('选择词单失败:', error)
      wx.showToast({
        title: '切换失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  }
})
