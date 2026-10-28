# 设计：复习页评分按钮按下反馈 + 下线废弃学习页

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `tasks.md` |
| 级别 | L2 |

## 1. 影响面（要改的文件，一个不漏）

| 文件 | 改动 | 对应 AC |
|------|------|---------|
| `pages/review-list/review-list.wxml` | 四个 `.score-btn` 增加 `hover-class` / `hover-start-time="0"` / `hover-stay-time="100"` | AC-01 |
| `pages/review-list/review-list.wxss` | 新增 `.score-btn-hover-forget/vague/know/easy`（alpha **0.40** + `scale(0.96)`）；保留 `:active` 作兜底 | AC-01 |
| `pages/review-list/review-list.js` | `handleScore` 两个守卫后加一次轻震动（存在性判断 + 提交中跳过） | AC-02 / AC-03 / AC-04 |
| `pages/review-list/review-list.js` | `onCardTap`（点空白处显示答案）同样触发一次轻震动，且仅在真的会翻面时触发 | AC-09 |
| `pages/learn/learn.js`、`.json`、`.wxml`、`.wxss` | 删除 | AC-05 / AC-06 |
| `app.json` | `pages` 去掉 `"pages/learn/learn"`（25 → 24 项） | AC-05 |
| `utils/api.js` | 删除 `reviewApi.getNextWord`、`reviewApi.submitReview`；组注释改为"仅剩 1 个在用方法" | AC-07 |
| `specs/capabilities/review-scheduling/spec.md` | `owned_paths` 去掉 `pages/learn/`；新增 AC-RS-49 ~ AC-RS-56；§2 评分档位改为四档；变更历史补一行 | AC-01 ~ AC-08 |
| `specs/changes/002-remove-unused-api/proposal.md` | 在 §3 / §10 的"保留 `reviewApi` 三个方法"处补一行注记：`2026-10-28` 由 `#006` 删除 learn 页后，`getNextWord` / `submitReview` 已无调用方并删除，仅保留 `getLearningStatus` | AC-07 |

**不改**：`utils/request.js`、`utils/fsrs/*`、`pages/profile`、`pages/wordlist-detail`、后端接口。

## 2. 数据流

无变化。

- 评分：`点击评分 → 计算 responseTimeMs → fsrs.scheduleNext → POST /api/fsrs/review`，本次只在点击入口前置一次震动，不进入数据流。
- 学习页删除：该页数据流是旧接口 `/api/review/next-word` + `/api/review/submit`，删除后无人调用，后端保留不影响。

## 3. 实现要点

### 3.1 按下加深（AC-01）

`view` 的 `hover-class` 是微信小程序里跨机型最稳的按下反馈：

- `hover-start-time="0"`：手指触到即变色（默认 50ms，是"点了没感觉"的主因）。
- `hover-stay-time="100"`：抬起后再停留 100ms，避免快速点击时闪烁。
- `hover-class` 按评分色分别命名，避免一个类里塞四套颜色。

`transition: all 0.2s` 已在 `.score-btn` 上，恢复时是渐变而非硬切；按下瞬间由于 `hover-class` 立即生效，视觉上"先深后缓回"。

`:active` 保留：开发者工具与真机都覆盖，二者颜色同档，不会叠加出更深的颜色。

### 3.2 震动（AC-02 ~ AC-04）

```js
// 提交中（loading）不再震，避免连续点击震个不停
if (!this.data.loading && wx.vibrateShort) {
  wx.vibrateShort({ type: 'light' })
}
```

- 放在两个前置守卫（`loading` 提交中、`queueIndex >= queue.length` 队列耗尽）之后：与"是否真的会提交"一致，避免点了但因为队列耗尽而什么都没发生时震动。
- `wx.vibrateShort` 在 iOS 上有 `type` 参数（`heavy` / `medium` / `light`），旧版本基础库忽略该参数，不会报错。
- 失败分支：`vibrateShort` 无回调时会走 `fail`，此处不传回调，因此不可能因为震动失败影响评分。

**"不要像收到消息"的三条实现约束**（对应用户诉求）：

1. **只用 `vibrateShort` + `type: 'light'`**：`vibrateLong` 约 400ms、`heavy` 明显更重，二者都是通知级手感，禁用。
2. **一次点击只调用一次**：禁止 `setTimeout` 再补一次形成"双震"（双震是微信消息的典型节奏）。
3. **不做延时/连击补偿**：快速连点四次就震四次，属于"按到了四次"的正确反馈，不额外合并。

限度诚实说明：小程序只有 `vibrateShort` / `vibrateLong` 两档，**没有** iOS CoreHaptics 那种可调制的 selection feedback。iOS（Taptic Engine）上 `light` 接近"轻点一下"，与通知震动差别明显；部分安卓机型的线性马达较弱，`light` 仍可能听/感到一下短促嗡嗡，这是平台上限，不是参数没调好。若真机观感仍像通知，退化方案是把震动去掉、只保留 `hover-class` 加深 + `scale(0.96)` 的视觉确认（属同一 AC 的降级实现，不需要改规格）。

### 3.3 空白区触感（AC-09）

`pages/review-list/review-list.wxml` 的 `.blank-tap-area`（文案「点击空白处显示答案」）复用与评分按钮同档的触感：

```js
onCardTap() {
  // 只在未显示答案时响应，避免答案阶段误触发
  if (!this.data.showAnswer) {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    this.toggleAnswer()
  }
}
```

- 震动放在 `!showAnswer` 判断**内部**：答案阶段该区域已不渲染，但 `onCardTap` 仍可能被其他路径触发，放内部才与"真的会翻面"一致。
- 该区域**不加** `hover-class`：它是整块空白加浅灰提示文字，按下变色会让"空白"变成一块色块，视觉上像按钮，反而让人以为要填写什么。用户只要求触感。
- 与评分按钮的区别：评分是"提交动作"（同时变色 + 震动），这里是"翻面动作"（只有震动）。

### 3.4 删除学习页（AC-05 ~ AC-07）

判据沿用 `#002`：**仓库内是否还有调用方 / 入口**。

1. 删除 `pages/learn/` 四个文件。
2. `app.json` 删除第 10 行声明（tabBar 无此页，无需动 tabBar）。
3. `utils/api.js`：`reviewApi` 从 3 个方法减到 1 个（`getLearningStatus`），组注释同步。
4. 校验：
   - `grep -r "pages/learn"` 零命中。
   - `grep -r "reviewApi\."` 只剩 `getLearningStatus` 两处（`profile.js`、`wordlist-detail.js`）。
   - `node --check` 全部 js 通过。

## 4. 回滚

| 改动 | 回滚方式 | 风险 |
|------|---------|------|
| 按钮反馈 | 还原 3 行 wxml + 删除 4 个 hover 类 | 无，纯样式/一次性调用 |
| 删除学习页 | `git revert` 单个提交即可整体恢复（页面 + app.json + api.js 在同一提交） | 低；页面零入口，恢复也不会影响线上 |

删除类改动**必须单独一个提交**（不与按钮反馈混在一起），便于定向回滚。提交信息带编号：`chore(review): 下线废弃学习页 [#006]`。

## 5. 已知取舍

- 震动强度写死 `light`，不做用户偏好：多一个开关就要动 `learning-config`（后端 + 设置页 + 缓存），与"轻量体验优化"不匹配。
- `#002` 里"保留 reviewApi 三个方法"的结论会因本变更失效，用注记而不是改原文，保留决策时间线。
