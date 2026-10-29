# 任务清单：学习统计页三处视觉修正

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md`（L1，规格即 proposal §8） |
| 任务数 | 7 |
| 预估总时长 | 半天 |

## 任务

- [x] **T01** 去掉选中列整列淡绿底：删除 WXML 两处 `bar-col-active` 绑定与 WXSS 规则 · 覆盖 AC-01 · 验证：WXML 面板里 `.bar-col` 无该类；点柱后详情卡正常切换 · 文件：`pages/review-forecast/review-forecast.wxml`、`review-forecast.wxss`
- [x] **T02** 一屏 7 天等分 + 今天居中：`scrollToToday` 改为 `layoutChart`，列宽由图表可视宽度 ÷ 7 反推，滚动目标 = 今天左侧第 3 列对齐视口左边缘 · 覆盖 AC-02 · 验证：首屏与切图后，今天左右各 3 列完整、无半列露出 · 文件：`pages/review-forecast/review-forecast.js`
- [x] **T03** 学习时长移入详情网格第 8 格（「待学」右侧），值字号 24rpx、单行不换行 · 覆盖 AC-03 · 验证：详情卡第二行为 新学/复习/待学/学习时长 · 文件：`review-forecast.wxml`、`review-forecast.wxss`
- [x] **T04** 规范同步：`#005` 的 `spec.md` / `design.md` 标注被本变更覆盖的条款（居中口径、整列高亮、时长位置） · 覆盖 AC-04 · 验证：`node scripts/spec.js check` 无错误 · 文件：`specs/changes/005-learning-stats/spec.md`、`design.md`、`specs/changes/INDEX.md`
- [x] **T05** 学习时长与其余 7 项共用同一套排版：删掉降档的 24rpx 规则，只保留 `nowrap` 防换行 · 覆盖 AC-05 · 验证：详情卡 8 项的字号/字重/颜色一致 · 文件：`review-forecast.wxml`、`review-forecast.wxss`
- [x] **T06** 整页纵向一屏：页面 `height:100vh` 纵向 flex、图表卡 `flex:1`、标签区固定高度、柱段高度改百分比、绘图区高度由 JS 量剩余空间下发（新增 `resizeChart` 应对详情卡变高） · 覆盖 AC-06 · 验证：首屏与切到未来日后都无需上下滑动，纵轴刻度与绘图区上下沿对齐 · 文件：`review-forecast.js`、`.wxml`、`.wxss`
- [ ] **T07** 目视复核：开发者工具中确认四处观感（首屏居中、无淡色柱、时长位置与字型一致、整页一屏），并至少换一种机型/屏幕高度再看一次 · 覆盖 AC-01, AC-02, AC-03, AC-05, AC-06 · 验证：截图对照 · 文件：无

## 执行约定

1. 一次只做一个任务，做完验证再勾选。
2. 提交信息带编号：`fix(stats): 学习统计视觉修正 [#009]`。
3. 发现新问题不顺手改，记到 `TODO.md`。

## 验收记录

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 通过 | WXML 两处 `bar-col` 不再拼接 `bar-col-active`；WXSS 已删该规则，全文件 0 命中 | 选中态只剩详情卡内容变化 |
| AC-02 | 通过（待 T05 目视） | `layoutChart()`：`barWidth = 可视宽度rpx ÷ 7`，`target = (todayIndex − 3) × barWidth × rpx2px` | 列宽与可视宽度整除，不再依赖 82rpx 常量 |
| AC-03 | 通过 | 详情卡 `.detail-grid` 共 8 项，第 8 项为 `学习时长` | 与其余项同款样式 |
| AC-04 | 通过 | `#005` spec 顶部与 design §10 已加覆盖说明；`spec.js check` 无错误 | |
| AC-05 | 通过 | 已删 `.detail-item-duration` 的 24rpx/500 覆盖，`.detail-value` 统一 32rpx/600/`#303133`，仅加 `nowrap` | 8 项共用同一套排版 |
| AC-06 | 通过（待 T07 目视） | 页面 `height:100vh` + 三级 flex（卡片 / `.chart-body` / `.chart-wrap`）均带 `min-height:0`；`layoutChart` 用 `.chart-wrap` 实测高度减 86rpx 得绘图区高度 | 详情卡变高由 `resizeChart` 跟随 |

## 遗留

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 去掉整列高亮后，点柱只靠详情卡日期变化作为反馈 | 快速连续点击时反馈偏弱 | 若用户觉得不够，另开 change 加"柱顶指示条" |
