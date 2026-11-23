# 任务清单：单词详情页左右滑动切换上一个 / 下一个单词（#017）

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` |
| 任务数 | 8 |
| 预估总时长 | 半天 |

## 任务

- [x] **T01** 列表页传导航上下文：`pages/wordlist-detail/wordlist-detail.js` 新增 `buildNavSequence()` 并在 `goWordDetail` 里经 `eventChannel` 发送 · 覆盖 AC-09 · 验证：进入详情后 `navIndex >= 0` · 文件：`pages/wordlist-detail/wordlist-detail.js`
- [x] **T02** 分组单词列表传导航上下文：`pages/wordlist-group-words/wordlist-group-words.js` 同样发送组内序列 · 覆盖 AC-09 · 验证：从分组列表进详情后 `navIndex >= 0` · 文件：`pages/wordlist-group-words/wordlist-group-words.js`
- [x] **T03** 详情页接收序列 + 手势判定：`onLoad` 用令牌取序列，根节点绑 touchstart/move/end/cancel，`touchmove` 做轴判定后跟手拖动 · 覆盖 AC-01, AC-02, AC-05, AC-08 · 验证：模拟器滑动可切换、纵向滚动不切换 · 文件：`pages/word-detail/word-detail.js`、`pages/word-detail/word-detail.wxml`
- [x] **T04** 切换装载与状态重置：抽 `fetchWordDetail` / `renderDetail`，切换前停音频、收弹层、重置释义展开、重取收藏态，先请求后切换 · 覆盖 AC-06, AC-07, AC-09 · 验证：切换后页面回顶部、无残留弹层、音频停止 · 文件：`pages/word-detail/word-detail.js`
- [x] **T05** 边界提示与过渡样式：两端提示逐字文案 + 卡片滑出/滑入过渡 · 覆盖 AC-03, AC-04, AC-10 · 验证：两端滑动只弹提示、内容自侧面滑入 · 文件：`pages/word-detail/word-detail.js`、`pages/word-detail/word-detail.wxml`、`pages/word-detail/word-detail.wxss`
- [x] **T07** 跟手拖动：touchmove 实时移动卡片（轴判定 + 阻尼 + 淡出），松手判定与滑出/滑入，横向预取相邻单词 · 覆盖 AC-11, AC-12 · 验证：`.jointest/v017-drag.js` + `.jointest/verify-017.js` · 文件：`pages/word-detail/word-detail.js`、`.wxml`、`.wxss`
- [x] **T08** 开发者工具实测跟手拖动：拖 40/120px 卡片同步位移、透明度下降、松手滑出后归位、小拖弹回、纵向拖动卡片不动 · 覆盖 AC-11, AC-12 · 验证：`.jointest/v017-drag.js` 9/9 · 文件：—
- [x] **T06** 真机 / 模拟器逐条走查 AC-01 ~ AC-10，结果回填 `proposal.md` §11 与本文件「验收记录」 · 覆盖 AC-01~AC-10 · 验证：微信开发者工具 + 真机预览 · 文件：`specs/changes/017-word-detail-swipe/proposal.md`



## 执行约定

1. 一次只做一个任务，做完 → 验证 → 勾选。
2. 提交信息带编号：`feat(word-detail): 左右滑动切换单词 [#017]`。
3. 发现新问题不顺手改：记到 `TODO.md`。
4. 每个任务结束时自问：三个月后的我能看懂为什么这么写吗？

## 验收记录

> 本会话已完成「可在本地自动验证的部分」（`.jointest/verify-017.js`，25/25 通过，见 proposal §11）；
> 2026-11-18 在微信开发者工具 Stable v2.01.2510290（iPhone 12/13 模拟器，390×753，本地后端 :8080，
> 测试词单「绿宝书N2」4870 词 / 4390 条未选序列，分组「2086664839584210944」112 词）用
> `miniprogram-automator` 跑真实入口 + 真实数据，AC-01~AC-10 全部实测通过（共 26 项断言，0 失败）。
> 真机复核建议补一次，主要看滑动手感（模拟器无法体现触感与真实跟手延迟）。

| AC | 结论 | 开发者工具实测证据 | 备注 |
|----|------|------|------|
| AC-01 | **通过** | 从词单详情 `goWordDetail` 打开「アクセント」，左滑 → 「一応」，navIndex 1→2，wordId 与 `navIds[2]` 一致 | 左滑 → 下一个 |
| AC-02 | **通过** | 同一页右滑 → 回到「アクセント」，navIndex 回到 1，wordId 与进入时完全一致 | 右滑 → 上一个 |
| AC-03 | **通过** | 序列第 0 个「明らか」上右滑：toast 恰为「已经是第一个单词」，wordId / navIndex 均未变 | 不跳转、不白屏 |
| AC-04 | **通过** | 把 navIndex 置到末尾（4389）后左滑：toast 恰为「已经是最后一个单词」，navIndex 仍为 4389 | 同上 |
| AC-05 | **通过** | 不带 `navToken` 直接 `reLaunch` 进详情：navIndex=-1；左滑无切换、无 toast、无报错 | 退化行为正确 |
| AC-06 | **通过** | 切换前手动 `setData({showMenu:true,isFavorited:true})`；左滑后 showMenu=false、isFavorited 重新拉取、滚动 `scrollTop 372→0`、假音频对象收到 `stop`+`destroy` 且 currentAudio 置空、展开态按配置（collapse=false → 2/2 全展开） | 弹层 / 菜单打开时滑动被守卫拦下（另测） |
| AC-07 | **通过** | 把 `navIds[navIndex+1]` 换成不存在的 id 后左滑：停在原单词「アクセント」，navIndex 未变、`loading=false`、内容仍在；toast「系统异常，请稍后重试」；`_swiping` 已放开，修好后能继续滑到下一个 | 真实业务失败路径，未打桩 |
| AC-08 | **通过** | 纵向滑动（dx=-20, dy=+260）不切换；位移不足（dx=-30）不切换；`wx.pageScrollTo(400)` 真实滚到 372，说明未绑 `touchmove`、纵向滚动未被吃 | 点击 / 释义折叠 / 更多菜单 / 加入词单均回归通过 |
| AC-09 | **通过** | 词单详情：`buildNavSequence()` 出 4390 条，与「未选」栏目 41 个分组的可见单词总数一致，首条与 `sections` 首词相同；分组内列表：`navLen=112` 恰等于该组单词数 112，navIndex=0，左滑到 index=1 正常 | 顺序即列表顺序，切换无额外请求 |
| AC-10 | **通过** | 卡片滑出/滑入过渡实测：`dragX` 从当前跟手位置过渡到 ±390px，再归零滑入；截图可见内容平移 | 过渡约 180ms，无整页空白 |
| AC-11 | **通过** | 开发者工具按下后 `touchmove` 到 40px / 120px，`data.dragX` 同步为 -40 / -120，`dragging=true`，透明度 0.85 / 0.55；`boundingClientRect` 实测卡片 `left 33 → -104`（真的平移了）；拖 500px 只移动 268px（45% 后阻尼）；到头时拖 200px 只动 56px | 纵向拖动时 `dx=0`、卡片不动 |
| AC-12 | **通过** | 松手（拖 120px）→ 卡片滑出 → 切到下一个并归位（dragX=0/dragging=false/opacity=1）；只拖 18px 松手 → 弹回、不切换；无 touchmove 的快速甩动（90px / 瞬间）也能切换 | 滑出从当前跟手位置继续，无回跳 |

**追加验证（2026-11-19，跟手效果）**

> 用户原话「能不能做出看着卡片往左移动/往右移动的效果」→ 改为此实现后重新走查。
> `.jointest/v017-drag.js` 9/9 通过；纯逻辑 `.jointest/verify-017.js` 31/31 通过。
> 截图：`.jointest/shots/017-drag-mid.png`（拖到一半：卡片左移 120px、变淡）、
> `017-after-drag.png`（松手后新卡片归位）。

**回归（AC-08 的既有行为部分，开发者工具实测）**

| 项 | 结论 |
|----|------|
| 加入词单弹层 | 通过：`openJoin()` 打开，8 个词单、提示「加入 2 个词单」；弹层打开时滑动被拦下 |
| 释义折叠 | 通过：`toggleSense(0)` 展开数 2→1 |
| 收藏状态 | 通过：切换后按新 wordId 重新取，`isFavorited` 为布尔值 |
| 更多菜单 | 通过：`showCorrectionMenu()` 开 / 关均正常 |
| 页面纵向滚动 | 通过：真实滚动到 372，未被手势吃掉 |
| console 错误 | 仅失败路径的预期 `console.error`，无其它报错 |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 分组管理页（`pages/wordlist-group`）的未分组截断列表不传序列 | 从该入口进详情不能滑动 | 已记 `TODO.md`（20261118），视反馈再开 change |
| iOS 左边缘起滑可能被系统返回手势接管 | 右滑切上一个在该手势区域可能无效 | 已知限制，接受 |
| 无「第几个 / 共几个」指示 | 用户不知道还能滑多远 | 已记 `TODO.md`（20261118），未获明确要求前不做 |
