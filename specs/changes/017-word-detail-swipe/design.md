# 设计：#017 单词详情页左右滑动切换上一个 / 下一个单词

## 1. 总体思路

序列由**列表页**决定，详情页只负责「按序列前进/后退」。

```text
pages/wordlist-detail        ─┐
pages/wordlist-group-words   ─┤ utils/wordNav.stage(ids, currentId) → token
                              │   wx.navigateTo(`...?wordId=X&navToken=n...`)
                              ▼
                    pages/word-detail
                      onLoad → wordNav.take(navToken) → data.navIds / data.navIndex
                      touchend 判定横滑 → navIndex ± 1 → wordApi.getDetail(targetId)
```

为什么不用「详情页自己拉全量列表」：列表顺序受栏目（未选/已选/全部）、分组、排序参数（收藏夹按 addedAt desc，
其他按 kana asc）影响，详情页重算等于把列表页的排序规则复制一份，必然漂移；而且每次进详情都要多一次大请求。

### 为什么用「令牌 + 内存暂存」而不是 `eventChannel`

> 这是设计过程中唯一被否决的第一版方案，记下来免得后人再走一遍。

原本打算用 `navigateTo` 的 `success` 回调里的 `eventChannel.emit('wordNavContext', …)`。问题是**时序不确定**：
`navigateTo` 的 success 与新页面 `onLoad` 谁先执行取决于基础库实现，若 emit 早于详情页 `on` 注册，
事件静默丢失，滑动功能时好时坏且极难定位（无报错、无日志）。

改为 `utils/wordNav.js`（纯内存，零依赖）：

- `stage(ids, currentId)` → 生成本次令牌、暂存 `{ids, currentId, at}`，返回令牌；
- 令牌拼在 `url` 的 `navToken` 参数上（很短的 `n1zzzz`，不占 URL 长度预算）；
- 详情页 `onLoad` **同步** `take(token)`，取一次即删，顺序确定；
- 暂存 60 秒过期、最多 8 条，避免异常路径下内存滞留；
- 不用 `globalData` 单槽：页面栈里可能同时有多个详情页实例（列表→详情→纠错→…），令牌天然隔离。

`eventChannel` 与 `globalData` 都写进了「被否决的备选」。

## 2. 影响面（要改的文件）

| 文件 | 改动 |
|------|------|
| `pages/wordlist-detail/wordlist-detail.js` | `goWordDetail` 组装当前栏目顺序的 id 序列，经 `wordNav.stage` 交给详情页；新增 `buildNavSequence()` |
| `pages/wordlist-group-words/wordlist-group-words.js` | `onWordTap` 同样传组内单词序列；新增 `buildNavSequence()` |
| `utils/wordNav.js` | 新增：导航序列的暂存/取回（`stage` / `take`），纯内存、零依赖 |
| `pages/word-detail/word-detail.js` | 接收序列、touch 判定、切换装载、状态重置、边界提示、音频停止 |
| `pages/word-detail/word-detail.wxml` | 根节点绑定 `bindtouchstart/bindtouchend/bindtouchcancel`；`.word-detail` 绑定过渡类 `swipeAnim` |
| `pages/word-detail/word-detail.wxss` | `.word-detail` 过渡属性 + `.swipe-from-right` / `.swipe-from-left` 起点类 |
| `specs/capabilities/word-search/spec.md` | 新增 AC-WS-16 ~ AC-WS-18、变更历史、`last_reviewed` |
| `specs/capabilities/wordlist-group/spec.md` | 入口传参说明、变更历史、`last_reviewed` |

**不改**：utils/api.js（复用 wordApi.getDetail）、pp.json（无新页面）、任何后端接口。

## 3. 数据流

### 3.1 序列来源

**词单详情页**（`pages/wordlist-detail`）——按当前栏目重建展示顺序，与 `buildSections` 的分桶规则一致：

1. 过滤：`unselected` 去掉 `learningStatus === 'learning'`；`selected` 只留 `learningStatus === 'learning'`；`all` 不过滤。
2. 分桶：`groupId` 命中现有分组 → 该组；否则「未分组」。
3. 顺序：分组按 `this.data.groups` 顺序 → 组内保持 `this.data.words` 的相对顺序 → 未分组在最后。
4. **包含折叠分组内的单词**：序列描述的是「当前栏目的顺序」，用户不需要先展开分组才能连续看词。

**分组内单词列表**（`pages/wordlist-group-words`）——`this._rawWords` 的顺序（= 组内展示顺序）。

### 3.2 传递方式

```js
// 列表页（pages/wordlist-detail/wordlist-detail.js、pages/wordlist-group-words/...）
const token = wordNav.stage(this.buildNavSequence(), wordId)
wx.navigateTo({
  url: `/pages/word-detail/word-detail?wordId=${wordId}` + (token ? `&navToken=${token}` : '')
})

// 详情页 onLoad（同步取，取一次即删）
const ctx = wordNav.take(options.navToken)   // { ids: string[], currentId: string } | null
```

- 载荷 `{ ids: string[], currentId: string }`，**id 全字符串**（C-03）。
- URL 里只放一个短令牌（`n1…`），不放 id 数组：`ids` 可能有几百个，URL 有长度上限。
- 令牌只在本页 `onLoad` 同步消费一次；`stage` 返回空串（序列为空）时详情页不带令牌，退化为「不响应滑动」。
- 不落 storage、不缓存；`utils/wordNav.js` 内 60 秒过期、最多 8 条。

### 3.3 详情页状态

```js
data: {
  navIds: [],      // 列表顺序（字符串 id）
  navIndex: -1,    // 当前单词在序列中的下标；-1 = 无上下文
  swipeAnim: ''    // '' | 'swipe-from-right' | 'swipe-from-left'
}
```

`navIndex = -1`（无上下文 / 找不到当前 id）→ 手势不响应（AC-05）。

## 4. 手势判定（跟手拖动 + 松手）

绑在根节点上的是 `bindtouchstart` / `bindtouchmove` / `bindtouchend` / `bindtouchcancel`。
**不用 `catchtouchmove`**：它会把页面纵向滚动一起吃掉。

| 常量 | 值 | 说明 |
|------|----|------|
| `SWIPE_MIN_DX` | 60 px | 松手后「够远」 |
| `SWIPE_FAR_DX` | 100 px | 拖到这个距离以上，不看到达时长，一定算数 |
| `SWIPE_FLICK_DX` | 30 px | 快速甩动的位移下限 |
| `SWIPE_FLICK_SPEED` | 0.6 px/ms | 快速甩动的速度下限 |
| `SWIPE_RATIO` | 1.5 | 横向 ≥ 纵向 × 1.5 才算横向 |
| `SWIPE_MAX_MS` | 900 ms | 短促滑动的时间上限（超过则只按距离判定） |
| `DRAG_RATIO` | 0.45 | 拖到卡片宽度 45% 后开始阻尼 |
| `DRAG_DAMP` | 0.3 | 超出部分的衰减系数 |
| `DRAG_EDGE_DAMP` | 0.28 | 序列到头时的整体衰减（拉不动的感觉） |
| `EXIT_MS` | 180 ms | 滑出动画时长 = 换内容的等待时间 |

### 4.1 轴判定（关键）

`touchmove` 里第一次位移超过 8px 时**只判定一次**，之后锁定：

```text
|dx| >= |dy| * 1.5  →  'x'：横向拖动，开始跟手
否则                →  'y'：放弃本次手势（this._swipe = null），页面继续原生滚动
```

锁定是必须的：不锁定的话，用户斜着拖会在横/纵之间来回跳，卡片一会儿动一会儿不动。

### 4.2 跟手位移

```text
offset = dx                                   |dx| <= width*0.45
       = sign*limit + over*0.3                |dx| >  limit（45% 之后越来越重）
       = dx * 0.28                           目标越界（到头了）
opacity = 1 - min(|offset|/(width*0.55), 1) * 0.8
```

`setData({ dragging: true, dragX, dragOpacity })`，WXML 用内联 style 驱动
`transform: translate3d(dragX px,0,0); opacity`。`.dragging` 类关掉 `transition`，
卡片才能 1:1 跟手；松手时移出该类，`transition` 生效，滑出/弹回就是平滑的。

### 4.3 松手判定

```text
axis 未判定（极快甩动可能 touchmove 很少）→ 在 touchend 补判一次
axis !== 'x'                              → 什么都不做（若拖过就弹回）
far    = |dx| >= 100
flick  = |dx| >= 30 且 speed >= 0.6
settled= |dx| >= 60 且 dt <= 900
三者任一成立 → slideOutAndSwitch(delta)，否则 springBack()
```

**踩过的坑**：第一版把「轴判定」只放在 `touchmove` 里，快速甩动时 `touchmove` 可能只上来一两个，
`axis` 仍是空的，松手直接被忽略 —— 表现为「用力甩反而没反应」。现在 `touchend` 会补判。

### 4.4 滑出 → 换内容 → 滑入

```text
slideOutAndSwitch(delta)
  ├─ 越界 → springBack() + toast（AC-03 / AC-04）
  └─ setData({ dragging:false, dragX: ±width, dragOpacity:0 })   // 从当前跟手位置继续滑走
       └─ 180ms 后 switchToWord(id, idx, delta)
            ├─ 预取命中 → 直接 renderDetail（无等待）
            └─ 未命中 → 请求 → renderDetail

renderDetail(detail, idx, delta)
  ├─ 第 1 帧：dragX = ±width（停在进入侧屏幕外）、dragOpacity = 0、dragging = true
  ├─ 第 2 帧（20ms）：dragging = false、dragX = 0、dragOpacity = 1  → 滑入
  └─ 同时 pageScrollTo(0)
```

**不能先把 dragX 归零再滑出**：那会让卡片「弹回中间再滑走」，松手瞬间能看到一次回跳。
直接从当前 `dragX` 过渡到 `±width` 才是连续的。

### 4.5 预取（让滑出和滑入之间没有空窗）

轴判定为横向的那一刻就 `prefetchAdjacent()`，同时请求 `navIndex-1` 和 `navIndex+1`：

- 用户还在拖（通常 200~800ms），请求多半已经回来 → 松手后滑出→换内容→滑入是连续的；
- 缓存按 `wordId` 存在 `this._prefetch`，用完即删（同一个词再次滑到时重取，避免过期数据）；
- 失败也记 `false`，不反复重试；未命中就走正常 `switchToWord` 请求，行为和之前一致。

前置守卫（任一成立则什么都不做）：
`this._swiping`（已有切换在途）、`loading`、`showMenu` / `showJoin` / `showResetConfirm`（弹层打开中）、
`navIds.length < 2`、`navIndex < 0`。

越界提示用 `wx.showToast({ icon: 'none' })`，文案逐字：`已经是第一个单词` / `已经是最后一个单词`。

## 5. 切换装载

```text
goAdjacentWord(delta)                    // delta：+1 下一个 / -1 上一个
  ├─ 守卫：_swiping / loading / 弹层打开 / navIds<2 / navIndex<0 → 直接返回
  ├─ 越界 → wx.showToast('已经是第一个单词' | '已经是最后一个单词') → 返回
  └─ switchToWord(targetId, targetIndex, delta)
       ├─ wordApi.getDetail(targetId)   // 只请求，不 setData，旧内容保持可见
       ├─ 失败 → 请求层已提示，不重复弹 → 保持原单词，_swiping = false
       └─ 成功 → stopCurrentAudio() → renderDetail(detail, targetIndex, delta)
                  ├─ setData({ wordDetail, wordId, loading:false,
                  │           expandedSense 按配置重置,
                  │           showMenu/showJoin/showResetConfirm:false,
                  │           isFavorited:false, navIndex:targetIndex,
                  │           swipeAnim:'swipe-from-*' })
                  │   callback: wx.pageScrollTo(0, 0) + 30ms 后清空 swipeAnim（触发过渡）
                  └─ loadFavoriteState(newWordId)   // 复用既有实现
```

要点：

- **先请求后切换**：数据没回来之前旧内容不动，避免慢网下整页空白（AC-07 / AC-10）。
- **过渡用「先置起点、下一帧清空」**：`swipe-from-right` 里写 `translateX(18%); opacity:0.2; transition:none`，
  30ms 后把类清空 → 基础类的 `transition` 生效，内容从右侧滑入并淡入，约 180ms。
  为什么不是在旧内容上做「移出」：那需要在请求前就把旧内容推走，慢网时会长时间停在推走的状态（看起来像空白）。
- **动画令牌**：`this._animToken += 1`，定时器里比对令牌，避免连续滑动时旧定时器把新动画提前清掉；
  `onUnload` 也递增令牌，已销毁页面不再 `setData`。
- **`_swiping` 在请求期间为 true**，请求结束后立刻放开；过渡动画不阻塞下一次滑动。
- 复用 `collapseDefinitionOnQuery` 决定切换后释义是否全展开（与首次加载一致）。

## 6. 既有行为保持

| 行为 | 处理 |
|------|------|
| 首次加载 | `loadWordDetail` 拆成 `fetchWordDetail`（纯请求）+ `renderDetail`（渲染），首次加载的提示文案与 loading 态不变 |
| 音频播放 | 切换前 `stop() + destroy()`，与新单词无关联 |
| 收藏 | 切换后重新调 `loadFavoriteState`（既有函数） |
| 更多菜单 / 加入词单 / 重新学习弹层 | 切换后一律收起（`showMenu/showJoin/showResetConfirm = false`） |
| 重新学习 | `confirmReset` 成功后仍只重拉**当前**单词，不动序列 |
| 删除单词 | 成功后 `navigateBack`，序列随页面销毁 |
| 页面纵向滚动 | 绑 `bindtouchmove` 但**不用 `catchtouchmove`**；判定为纵向时不 setData，原生滚动不受影响 |

## 7. 回滚

改动集中在 5 个前端文件（新增 1 个 `utils/wordNav.js`、改 4 个页面文件），无数据迁移、无接口变更。
回滚 = `git revert` 对应提交；列表页新加的 `navToken` 参数对旧版详情页只是多余 query，不会被读取也不会报错，
所以**列表页与详情页可以独立回滚**。

## 8. 风险与验证

| 风险 | 验证方式 |
|------|----------|
| 横滑误触（纵向滚动时切词） | 模拟器手动慢滚 / 快速滚，确认不切词 |
| 跟手是否真的跟手 | 开发者工具里按下后 `touchmove` 到 120px，量 `.word-detail` 的 `left` 是否同步左移（实测 33→-104） |
| `.dragging` 未关掉 transition 导致卡片「拖不动」 | 拖到一半读 `data.dragging === true`，并用 `boundingClientRect` 确认几何位移 |
| 令牌未送达 / 过期（`navIndex` 停在 -1） | 从两个入口各进一次，检查 `navIndex` 是否 ≥ 0 |
| 慢网切换 | 开发者工具 Network 限速 Slow 3G，切换时旧内容仍在、无白屏 |
| 失败分支 | 断网后滑动，确认停留在原单词 |
| 无上下文 | 从分组管理页（`pages/wordlist-group`）进详情，滑动无反应、无提示 |
