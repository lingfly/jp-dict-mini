// pages/word-detail/word-detail.js
const { wordApi, audioApi, userApi, wordlistApi, authApi } = require('../../utils/api')
const groupSource = require('../../utils/wordlistGroup')
// #013：重新学习（重置卡片）。wordId 字符串边界与 FSRS 字段转换都在 dataSource 内部处理
const dataSource = require('../../utils/fsrs/dataSource')
// #017：左右滑动切换上一个 / 下一个单词。序列由列表页暂存，这里按令牌取一次
const wordNav = require('../../utils/wordNav')

/* ===== #017 左右滑动切换参数 =====
   跟手拖动（AC-11）+ 松手判定 + 滑出/滑入（AC-12） */
const SWIPE_MIN_DX = 60        // 松手后「够远」的最小横向位移
const SWIPE_FAR_DX = 100       // 拖到这个距离以上，不看到达时长，一定算数
const SWIPE_FLICK_DX = 30      // 快速甩动的位移下限
const SWIPE_FLICK_SPEED = 0.35 // 快速甩动的速度下限（px/ms）
const SWIPE_RATIO = 1.5        // 横向必须明显大于纵向，否则算纵向滚动
const SWIPE_MAX_MS = 900       // 短促滑动的时间上限（超过则只按距离判定）
// 跟手阻尼：拖到卡片宽度的 45% 之后开始变「重」，避免卡片被拉出屏幕
const DRAG_RATIO = 0.45
const DRAG_DAMP = 0.3
// 序列到头时的整体阻尼，做出「拉不动」的手感
const DRAG_EDGE_DAMP = 0.28
// 松手后滑出到「换内容」的等待时间（略大于 0.18s 的 transition，让卡片走完再换）
const EXIT_MS = 180

Page({
  data: {
    wordId: '',
    loading: true,
    wordDetail: null,
    expandedSense: [],
    currentAudio: null,
    collapseDefinitionOnQuery: false,
    showMenu: false,
    // 是否为管理员（可删除单词）
    isAdmin: false,
    // 收藏状态（是否在默认收藏夹中）
    isFavorited: false,
    favoriting: false,

    /* ===== #017 左右滑动切换 ===== */
    navIds: [],        // 列表当前展示顺序的单词 id（全程字符串，C-03）
    navIndex: -1,      // 当前单词在 navIds 中的下标；-1 = 没有导航上下文（不响应滑动）
    /* 跟手拖动（AC-11）：手指按住卡片左右拖动时，卡片实时跟着走 */
    dragging: false,   // 正在跟手拖动（此时关掉 transition，卡片才跟得上手指）
    dragX: 0,          // 卡片当前横向位移（px）；>0 向右、<0 向左
    dragOpacity: 1,    // 拖动时卡片淡出，越拖越淡

    /* ===== 重新学习二次确认（#013 AC-14） ===== */
    showResetConfirm: false,
    resetting: false,

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
    joinOrigKeys: [],
    // 上次加入定位：滚动到的行 id（jlw-词单id / jlg-分组id）
    joinScrollInto: ''
  },

  onLoad(options) {
    const wordId = options.wordId || ''
    // #017：取列表页暂存的单词顺序（只在本页 onLoad 同步取一次，取完即删）
    this.initNavContext(wordId, options.navToken)
    // #017：滑动阻尼按屏幕宽度算，先量一次（量不到时用 375 兜底）
    this.measurePageWidth()
    this.checkAdmin()
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

  /** 量一次页面宽度（滑动距离/阻尼都按它算），量不到时用 375 兜底 */
  measurePageWidth() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      if (info && info.windowWidth) this._pageWidth = info.windowWidth
    } catch (e) {
      console.error('获取窗口宽度失败:', e)
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
      // #017：切换单词后，上一个单词的收藏查询可能才回来 —— 结果对不上当前单词就丢弃
      if (this.data.wordId && String(this.data.wordId) !== String(wordId)) return
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

  /* ================= #017 左右滑动切换上一个 / 下一个单词 ================= */

  /**
   * 取得列表页暂存的单词顺序
   * 没有令牌 / 令牌过期 / 当前单词不在序列里 → navIndex 保持 -1，滑动不响应（AC-05）
   */
  initNavContext(wordId, token) {
    const ctx = wordNav.take(token)
    if (!ctx || !ctx.ids || ctx.ids.length < 2) return
    const index = ctx.ids.indexOf(String(wordId))
    if (index < 0) return
    this.setData({ navIds: ctx.ids, navIndex: index })
  },

  /* -------- 手势：跟手拖动 + 松手判定（AC-11 / AC-12） -------- */

  /**
   * 按下：记起点，并清掉上一次还没走完的过渡
   *
   * 这里**不**阻止页面纵向滚动：只在判定为「横向拖动」之前不做任何位移，
   * 所以纵向滚动照旧是原生行为（AC-08）。
   */
  onSwipeTouchStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    if (!this.canSwipe()) {
      this._swipe = null
      return
    }
    // 上一次滑入动画还没结束就再次按下：直接定格，避免和跟手位移打架
    if (this._animTimer) {
      clearTimeout(this._animTimer)
      this._animTimer = null
      this._animToken = (this._animToken || 0) + 1
    }
    this._swipe = {
      x: touch.clientX,
      y: touch.clientY,
      at: Date.now(),
      axis: '',        // '' 未判定 / 'x' 横向拖动 / 'y' 纵向滚动
      lastX: touch.clientX,
      prevAt: Date.now(),
      speed: 0
    }
  },

  /**
   * 移动：判定为横向后，卡片实时跟手（AC-11）
   *
   * 用 `bindtouchmove` 而非 `catchtouchmove`：只有判定为横向、并且确实调了 setData，
   * 才在视觉上「接管」这次手势；判定为纵向时什么都不做，页面继续按原生的方式滚。
   */
  onSwipeTouchMove(e) {
    const s = this._swipe
    if (!s) return
    const touch = e.touches && e.touches[0]
    if (!touch) return

    const dx = touch.clientX - s.x
    const dy = touch.clientY - s.y

    // 轴判定只在位移超过阈值时做一次，之后锁定，避免拖动中途在横/纵之间来回切换
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.axis = Math.abs(dx) >= Math.abs(dy) * SWIPE_RATIO ? 'x' : 'y'
      if (s.axis === 'y') {
        // 判定为纵向：放弃本次手势，交还给原生滚动
        this._swipe = null
        return
      }
      // 确定为横向拖动 → 立刻预取相邻单词。
      // 用户还在拖（通常 200~800ms），请求多半已经回来，松手后滑出/滑入中间就没有空窗。
      this.prefetchAdjacent()
    }

    const now = Date.now()
    const dt = now - s.prevAt
    if (dt > 0) {
      // 速度用最近一帧的瞬时值，松手时用它区分「慢慢拖到底」和「快速甩一下」
      s.speed = (touch.clientX - s.lastX) / dt
    }
    s.lastX = touch.clientX
    s.prevAt = now

    this.applyDrag(dx)
  },

  /**
   * 松手：够远或够快就切到下一个/上一个，否则弹回原位（AC-12）
   */
  onSwipeTouchEnd(e) {
    const s = this._swipe
    this._swipe = null
    if (!s) return
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) {
      this.springBack()
      return
    }

    const dx = touch.clientX - s.x
    const dy = touch.clientY - s.y
    const dt = Date.now() - s.at
    const speed = Math.abs(s.speed || 0)

    // 轴还没判定（极快的甩动可能 touchmove 只上来一两个、甚至没有）：在这里补判一次，
    // 否则「快速甩一下」会静默失效。方向偏纵就当作滚动，什么都不做。
    let axis = s.axis
    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) axis = ''   // 基本没动 = 点击
      else axis = Math.abs(dx) >= Math.abs(dy) * SWIPE_RATIO ? 'x' : 'y'
    }

    // 点击 / 纵向滚动：什么都不做（若之前拖过一点，把卡片弹回去）
    if (axis !== 'x') {
      if (this.data.dragging) this.springBack()
      return
    }

    const far = Math.abs(dx) >= SWIPE_FAR_DX
    const flick = Math.abs(dx) >= SWIPE_FLICK_DX && speed >= SWIPE_FLICK_SPEED
    const settled = Math.abs(dx) >= SWIPE_MIN_DX && dt <= SWIPE_MAX_MS
    if (!(far || flick || settled)) {
      this.springBack()
      return
    }

    // 手指向左 → 下一个；向右 → 上一个
    const delta = dx < 0 ? 1 : -1
    this.slideOutAndSwitch(delta)
  },

  onSwipeTouchCancel() {
    this._swipe = null
    if (this.data.dragging) this.springBack()
  },

  /** 当前是否允许滑动（弹层打开 / 加载中 / 没有上下文 / 正在切换 → 不允许） */
  canSwipe() {
    if (this._swiping || this.data.loading) return false
    if (this.data.showMenu || this.data.showJoin || this.data.showResetConfirm) return false
    const ids = this.data.navIds
    return !!(ids && ids.length > 1 && this.data.navIndex >= 0)
  },

  /**
   * 预取相邻单词（AC-12：让「滑出 → 滑入」之间没有空窗）
   *
   * 判定为横向拖动的那一刻就发请求，用户还在拖的时候数据通常已经回来。
   * 结果按 wordId 存在内存里，松手时直接取用；失败也只是没缓存，松手后照常走正常请求。
   */
  prefetchAdjacent() {
    const ids = this.data.navIds
    const index = this.data.navIndex
    if (!ids || index < 0) return
    this._prefetch = this._prefetch || {}
    ;[index - 1, index + 1].forEach((i) => {
      if (i < 0 || i >= ids.length) return
      const id = ids[i]
      if (this._prefetch[id] !== undefined) return // 已请求过（含失败标记）
      this._prefetch[id] = null
      wordApi.getDetail(id)
        .then((res) => {
          const ok = res && res.code === 200 && res.data
          this._prefetch[id] = ok ? res.data : false
        })
        .catch(() => { this._prefetch[id] = false })
    })
  },

  /** 取预取到的详情（没有就返回 null，调用方走正常请求） */
  takePrefetched(wordId) {
    const cache = this._prefetch || {}
    const hit = cache[wordId]
    // 用完即删：同一个词再次滑到时重取，避免看到过期数据
    if (hit) delete cache[wordId]
    return hit || null
  },

  /** 按阻尼曲线算出实际位移，并把卡片移过去 */
  applyDrag(dx) {
    const target = this.data.navIndex + (dx < 0 ? 1 : -1)
    const atEdge = target < 0 || target >= this.data.navIds.length
    const width = this._pageWidth || 375
    const limit = width * DRAG_RATIO

    let offset
    if (atEdge) {
      // 到头了：阻尼更大，做出「拉不动」的手感
      offset = dx * DRAG_EDGE_DAMP
    } else if (Math.abs(dx) <= limit) {
      offset = dx
    } else {
      // 超出 45% 宽度后逐渐变重，避免卡片被整块拉出屏幕
      const over = Math.abs(dx) - limit
      const damped = limit + over * DRAG_DAMP
      offset = dx < 0 ? -damped : damped
    }

    // 越拖越淡：位移达到 55% 宽度时约剩下 20% 不透明度
    const fade = Math.min(Math.abs(offset) / (width * 0.55), 1)
    const opacity = 1 - fade * 0.8

    this.setData({
      dragging: true,
      dragX: Math.round(offset),
      dragOpacity: Math.round(opacity * 100) / 100
    })
  },

  /**
   * 弹回原位（条件不满足 / 用户反悔）
   * 先关掉 dragging 让 transition 生效，卡片就平滑回弹。
   */
  springBack() {
    this.setData({ dragging: false, dragX: 0, dragOpacity: 1 })
  },

  /**
   * 顺着手指方向把卡片滑出去，然后装载相邻单词（AC-12）
   *
   * 滑出立刻发生（不等网络），旧内容从当前跟手位置继续滑走；
   * 数据回来后再把新内容从另一侧滑入。慢网时中间这一段是「卡片已滑走」的短空窗，
   * 比原来的「停住不动再跳一下」更接近原生翻页手感。
   */
  slideOutAndSwitch(delta) {
    const target = this.data.navIndex + delta
    const ids = this.data.navIds

    if (target < 0 || target >= ids.length) {
      // 到头：弹回 + 提示（AC-03 / AC-04）
      this.springBack()
      wx.showToast({
        title: delta > 0 ? '已经是最后一个单词' : '已经是第一个单词',
        icon: 'none'
      })
      return
    }

    const width = this._pageWidth || 375
    const outX = delta > 0 ? -width : width
    this._swiping = true

    // 1) 从当前跟手位置顺着方向继续滑出。
    //    这里不能先把 dragX 归零——那会让卡片「弹回中间再滑走」，松手瞬间会看到一次回跳。
    this.setData({ dragging: false, dragX: outX, dragOpacity: 0 })

    // 2) 滑出动画走完再换内容，避免用户看到内容在屏幕中间「闪换」
    this._animTimer = setTimeout(() => {
      this._animTimer = null
      this.switchToWord(ids[target], target, delta)
    }, EXIT_MS)
  },

  /**
   * 切换到相邻单词
   * @param {Number} delta +1 下一个 / -1 上一个
   */
  goAdjacentWord(delta) {
    // 弹层/菜单打开时、上次切换未完成时、详情加载中：忽略本次滑动
    if (this._swiping || this.data.loading) return
    if (this.data.showMenu || this.data.showJoin || this.data.showResetConfirm) return

    const ids = this.data.navIds
    const index = this.data.navIndex
    if (!ids || ids.length < 2 || index < 0) return

    const target = index + delta
    if (target < 0) {
      wx.showToast({ title: '已经是第一个单词', icon: 'none' })
      return
    }
    if (target >= ids.length) {
      wx.showToast({ title: '已经是最后一个单词', icon: 'none' })
      return
    }
    this.switchToWord(ids[target], target, delta)
  },

  /**
   * 装载相邻单词并切换
   *
   * 此时旧卡片已经顺着手指滑出去了（slideOutAndSwitch），所以：
   * - 成功：把新内容和卡片一起摆到「另一侧尚不可见」的位置，再滑进来；
   * - 失败：把旧卡片原地滑回中央，页面内容一点不动（AC-07）。
   */
  async switchToWord(wordId, targetIndex, delta) {
    // 预取命中就不用再等网络，滑出/滑入能做成连续的
    const prefetched = this.takePrefetched(wordId)
    if (prefetched) {
      if (this._unloaded) return
      this.stopCurrentAudio()
      this.renderDetail(prefetched, targetIndex, delta)
      this._swiping = false
      this.loadFavoriteState(wordId)
      this.prefetchAdjacent() // 为下一次滑动提前备好
      return
    }

    let res = null
    try {
      res = await wordApi.getDetail(wordId)
    } catch (error) {
      // 网络/超时/5xx：请求层已统一提示（C-06），这里不再弹第二个 toast
      console.error('切换单词失败:', error)
      this.restoreAfterFailedSwitch(delta)
      return
    }

    const detail = res && res.code === 200 && res.data ? res.data : null
    // 页面已销毁（用户已返回）：不再 setData，也不弹提示
    if (this._unloaded) return
    if (!detail) {
      // 业务失败（如单词已删除）：请求层已按 message 提示过（C-06），这里不重复弹；
      // 只有「200 但没有数据」这种请求层不会提示的情况才补一句
      if (res && res.code === 200) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
      console.error('切换单词失败:', wordId, res && res.code, res && res.message)
      this.restoreAfterFailedSwitch(delta)
      return
    }

    this.stopCurrentAudio()
    this.renderDetail(detail, targetIndex, delta)
    // 滑入动画只负责视觉，不阻塞下一次滑动
    this._swiping = false
    this.loadFavoriteState(wordId)
  },

  /**
   * 切换失败：把滑出去的旧卡片滑回中央，内容保持原样
   * 卡片出去又回来，用户能看出「这次没翻页」，而不是页面凭空卡住（AC-07）。
   */
  restoreAfterFailedSwitch(delta) {
    this._swiping = false
    this.setData({
      dragging: false,
      dragX: 0,
      dragOpacity: 1
    })
  },

  /**
   * 切换后渲染：收起弹层、重置释义展开、新内容自另一侧滑入、回到顶部（AC-06 / AC-12）
   *
   * 入参 delta 决定新内容从哪一侧进来：向左翻（delta>0）时新内容从右边进，反之从左边。
   * 关键点是**两帧**：第一帧把新内容摆到屏幕外（不可见，因为 opacity=0 且 transition 关闭），
   * 第二帧把位移归零并恢复不透明度，transition 打开，卡片就滑进来了。
   */
  renderDetail(detail, targetIndex, delta) {
    const definitions = detail.definitions || []
    const expandAll = !this.data.collapseDefinitionOnQuery
    const initialExpanded = expandAll ? definitions.map((_, i) => i) : []
    const wordId = detail.word && detail.word.id != null ? String(detail.word.id) : ''
    const width = this._pageWidth || 375
    // 动画令牌：连续滑动时，旧定时器不得把新动画提前清掉
    this._animToken = (this._animToken || 0) + 1
    const token = this._animToken

    const patch = {
      wordDetail: detail,
      wordId,
      loading: false,
      expandedSense: initialExpanded,
      navIndex: targetIndex,
      // 弹层与菜单一律收起，避免「上一个单词的弹层」留在新单词上
      showMenu: false,
      showJoin: false,
      showResetConfirm: false,
      joinLoading: false,
      joinSubmitting: false,
      resetting: false
    }
    // 只有切换才清空收藏态：首次加载时收藏状态的请求可能比详情先回来，
    // 这里清掉会把刚取到的结果抹掉（切换后由 switchToWord 重新拉取）
    if (delta !== 0) patch.isFavorited = false

    if (delta !== 0) {
      // 第 1 帧：新内容直接出现在「进入侧」的屏幕外，并保持透明
      patch.dragging = true
      patch.dragX = delta > 0 ? width : -width
      patch.dragOpacity = 0
    }

    this.setData(patch, () => {
      if (delta === 0) {
        this.setData({ dragging: false, dragX: 0, dragOpacity: 1 })
        return
      }
      // 切换后回到顶部：新单词从头读起（首次加载/重置刷新不动滚动位置，保持原行为）
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      // 第 2 帧：打开 transition 并归位 → 新卡片从侧面滑入
      setTimeout(() => {
        if (this._animToken !== token) return
        this.setData({ dragging: false, dragX: 0, dragOpacity: 1 })
      }, 20)
    })
  },

  /** 切换前停止并释放音频，避免上一个单词的声音继续播放 */
  stopCurrentAudio() {
    const audio = this.data.currentAudio
    if (!audio) return
    try {
      audio.stop()
      audio.destroy()
    } catch (e) {
      console.error('停止音频失败:', e)
    }
    this.setData({ currentAudio: null })
  },

  /* ================= 详情数据加载 ================= */

  /** 只请求详情，不改界面状态（首次加载与切换共用） */
  async fetchWordDetail(wordId) {
    const res = await wordApi.getDetail(wordId)
    if (res && res.code === 200 && res.data) return res.data
    return null
  },

  async loadWordDetail(wordId) {
    this.setData({ loading: true })
    try {
      const detail = await this.fetchWordDetail(wordId)
      if (detail) {
        this.renderDetail(detail, this.data.navIndex, 0)
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
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

  /* ===== 重新学习（#013 AC-14 / AC-15 / AC-16） ===== */

  /**
   * 打开二次确认弹窗
   * <p>
   * 文案要求（用户逐字确认）：标题「重新学习这个词？」，
   * 正文「学习进度将归零，此操作不可撤销。」，按钮「取消」「重新学习」。
   */
  openResetConfirm() {
    this.setData({ showMenu: false, showResetConfirm: true })
  },

  /** 取消：关闭弹窗，不发起任何请求，不改动任何数据（AC-15） */
  cancelReset() {
    this.setData({ showResetConfirm: false })
  },

  /**
   * 确认重新学习
   * <p>
   * 失败时保留卡片原状态、提示失败原因、入口可再次操作（AC-16）。
   * 提交中置灰不可再点，避免重复请求（后端有 epoch 乐观锁兜底）。
   */
  async confirmReset() {
    if (this.data.resetting) return
    const detail = this.data.wordDetail
    const wordId = detail && detail.word && detail.word.id
    if (!wordId) {
      wx.showToast({ title: '单词信息缺失', icon: 'none' })
      return
    }

    // AC-20：expectedEpoch 来自 GET /api/word/{id} 的 fsrsCard；未加入学习时为 null → 传 0，
    // 后端按「该词不在学习列表中」返回 3001
    const fsrsCard = detail.fsrsCard
    const expectedEpoch = fsrsCard && fsrsCard.epoch != null ? fsrsCard.epoch : 0

    this.setData({ resetting: true })
    try {
      await getApp().waitForLogin()
      const res = await dataSource.resetCard(wordId, expectedEpoch)

      if (res && res.code === 200) {
        this.setData({ showResetConfirm: false })
        wx.showToast({ title: '已重置，将从头开始', icon: 'none' })
        // 重新拉取详情，让页面上的 FSRS 状态（epoch / learningStatus）回到最新
        this.loadWordDetail(wordId)
        return
      }

      // 失败分支：3001 该词不在学习列表 / 3008 轮次已变化 / 2005 参数不合法
      this.setData({ showResetConfirm: false })
      wx.showToast({ title: (res && res.message) || '重新学习失败，请重试', icon: 'none' })
    } catch (error) {
      console.error('重新学习失败:', error)
      // 请求层已提示原因；入口保持可再次操作（AC-16）
      this.setData({ showResetConfirm: false })
    } finally {
      this.setData({ resetting: false })
    }
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

  /** 判断是否为管理员（userType 缺失时主动拉取当前用户信息） */
  async checkAdmin() {
    const app = getApp()
    let userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
    if (!userInfo || userInfo.userType == null) {
      try {
        const res = await authApi.getCurrentUser()
        if (res.code === 200 && res.data) {
          userInfo = res.data
          app.globalData.userInfo = userInfo
          wx.setStorageSync('userInfo', userInfo)
        }
      } catch (e) {
        console.error('获取用户信息失败:', e)
      }
    }
    this.setData({ isAdmin: !!(userInfo && userInfo.userType === 1) })
  },

  /** 删除单词（仅管理员） */
  deleteWord() {
    this.setData({ showMenu: false })
    const wordId = this.data.wordDetail && this.data.wordDetail.word && this.data.wordDetail.word.id
    if (!wordId) return
    wx.showModal({
      title: '删除单词',
      content: '确定要删除该单词及其所有关联数据吗？此操作不可恢复。',
      confirmText: '删除',
      confirmColor: '#E64340',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          const result = await wordApi.remove(wordId)
          wx.hideLoading()
          if (result.code === 200) {
            wx.showToast({ title: '删除成功', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 800)
          } else {
            wx.showToast({ title: result.message || '删除失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('删除单词失败:', e)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
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
    this.setData({ showJoin: true, joinLoading: true, joinScrollInto: '' })
    this._targetWordListId = null
    this._targetGroupId = null
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

        // 默认展开分组：已加入的分组，或上次加入的分组
        const joinExpanded = {}
        lists.forEach(w => {
          const joinedInGroup = w.containsWord && (w.groups || []).some(g => g.containsWord)
          const lastInGroup = w.lastJoinedGroupId != null
          if (joinedInGroup || lastInGroup) {
            joinExpanded[w.id] = true
          }
        })

        // 定位目标优先级：既是上次也是已加入 > 上次加入 > 已加入
        let targetWordListId = null
        let targetGroupId = null

        // 1. 既是上次加入也是已加入
        let target = lists.find(w => w.isLastJoined && w.containsWord)
        // 2. 上次加入
        if (!target) target = lists.find(w => w.isLastJoined)
        // 3. 已加入
        if (!target) target = lists.find(w => w.containsWord)

        if (target) {
          targetWordListId = target.id
          if (target.containsWord) {
            const joinedGroup = (target.groups || []).find(g => g.containsWord)
            targetGroupId = joinedGroup ? joinedGroup.id : null
          } else {
            targetGroupId = target.lastJoinedGroupId || null
          }
        }
        this._targetWordListId = targetWordListId
        this._targetGroupId = targetGroupId

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
      // 定位目标：先滚到词单行，再滚到具体分组行（若有）
      if (this._targetWordListId) {
        const wid = this._targetWordListId
        const gid = this._targetGroupId
        setTimeout(() => {
          this.setData({ joinScrollInto: 'jlw-' + wid })
          if (gid) {
            setTimeout(() => this.setData({ joinScrollInto: 'jlg-' + gid }), 60)
          }
        }, 30)
      }
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
        isOrig: !!origSet['g:' + g.id],
        lastJoined: !!(wl.lastJoinedGroupId && String(g.id) === String(wl.lastJoinedGroupId))
      })) : []
      return {
        id: wl.id,
        name: wl.name,
        wordCount: wl.wordCount,
        selected: !!selSet['w:' + wl.id],
        isOrig: !!origSet['w:' + wl.id],
        // 上次加入的是分组时，词单行不加「上次」，仅在对应分组行标注
        lastJoined: !!wl.isLastJoined && wl.lastJoinedGroupId == null,
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
    this._targetWordListId = null
    this._targetGroupId = null
    this.setData({ showJoin: false, joinScrollInto: '' })
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
    // #017：页面销毁后不再 setData（切换请求可能还在途）
    this._unloaded = true
    this._animToken = (this._animToken || 0) + 1
    this._swipe = null
    if (this.data.currentAudio) {
      this.data.currentAudio.stop()
      this.data.currentAudio.destroy()
    }
  }
})
