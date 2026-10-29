# 任务清单：复习页触感改到「按下」触发

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md`（L1，无独立 `spec.md`；改的是 `#006` 已交付的 AC-RS-50 / AC-RS-57） |
| 任务数 | 4 |
| 预估总时长 | 1 小时 |

## 任务

- [x] **T01** 四个评分键与空白区绑定 `bindtouchstart`（`onScorePress` / `onBlankPress`），`bindtap` 保留负责提交/翻面 · 覆盖 AC-RS-50, AC-RS-57 · 验证：WXML 面板可见双绑定 · 文件：`pages/review-list/review-list.wxml`
- [x] **T02** 新增 `vibratePress()` / `onScorePress()` / `onBlankPress()`，把震动从 `handleScore()`、`onCardTap()` 移除（避免 touchstart + tap 双震） · 覆盖 AC-RS-50, AC-RS-57, AC-RS-52 · 验证：`node --check` 通过；`grep vibrateShort` 仅剩 `vibratePress` 一处 · 文件：`pages/review-list/review-list.js`
- [x] **T03** 更新能力规范：AC-RS-50 / AC-RS-57 补「手指按下瞬间、抬起不再震」，边界表加「按下后拖走也会震」，变更记录加 `#012` 一行 · 验证：`node scripts/spec.js check` 无错误 · 文件：`specs/capabilities/review-scheduling/spec.md`
- [ ] **T04** 真机复核：按住评分键 1 秒再松手，只在按下时震一次；提交中连点无震动；点空白区按下即震、抬手才显示答案 · 覆盖 AC-RS-50, AC-RS-52, AC-RS-57 · 验证：真机手感 · 文件：无

## 执行约定

1. 提交信息带编号：`fix(review): 触感改到按下触发 [#012]`。

## 验收记录

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-RS-50 | 待真机（T04） | 震动由 `onScorePress`（`touchstart`）触发，`handleScore`（`tap`）内已无 `vibrateShort` | 静态核对通过 |
| AC-RS-52 | 待真机（T04） | `onScorePress` 首行 `if (this.data.loading) return`，与提交守卫同源 | 静态核对通过 |
| AC-RS-57 | 待真机（T04） | 空白区 `bindtouchstart="onBlankPress"` 震、`bindtap="onCardTap"` 翻面；`showAnswer` 时区域整体不存在 | 静态核对通过 |
