# 任务清单：复习页评分按钮按下反馈 + 下线废弃学习页

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` |
| 任务数 | 9 |
| 预估总时长 | 0.5 天 |

## 任务

- [x] **T01** 四个评分按钮改为 `hover-class` 提供按下加深（`hover-start-time="0"`、`hover-stay-time="100"`），并定义四档 `rgba(...,0.30)` + `scale(0.96)` 的 hover 类，保留 `:active` 兜底 · 覆盖 AC-01 · 验证：开发者工具逐个按下看变色/恢复 · 文件：`pages/review-list/review-list.wxml`、`pages/review-list/review-list.wxss`
- [x] **T02** 评分入口加入 `light` 级轻震动：提交中不震、不支持时静默跳过 · 覆盖 AC-02, AC-03, AC-04 · 验证：真机手感 + 无震动环境不报错 · 文件：`pages/review-list/review-list.js`
- [x] **T03** 删除 `pages/learn/` 四个文件并移除 `app.json` 的页面声明 · 覆盖 AC-05, AC-06 · 验证：`grep -r "pages/learn"` 零命中 + 开发者工具编译通过 · 文件：`pages/learn/*`、`app.json`
- [x] **T04** 删除 `reviewApi.getNextWord` / `submitReview`，把组注释改为"仅剩 getLearningStatus" · 覆盖 AC-07 · 验证：`grep -r "reviewApi\."` 只剩两处 `getLearningStatus` · 文件：`utils/api.js`
- [x] **T05** 合并规范：`capabilities/review-scheduling` 的 `owned_paths` 去掉 `pages/learn/`、评分档位改四档、新增 AC-RS-49 ~ AC-RS-56 与变更历史；给 `#002` proposal 补一行注记 · 覆盖 AC-01 ~ AC-08 · 验证：`node scripts/spec.js check` · 文件：`specs/capabilities/review-scheduling/spec.md`、`specs/changes/002-remove-unused-api/proposal.md`
- [x] **T06** 按下色由 0.30 加深到 0.40（四档同改），`:active` 兜底同步 · 覆盖 AC-01 · 验证：真机按下对比常态，肉眼可辨且不糊成纯色块 · 文件：`pages/review-list/review-list.wxss`
- [x] **T07** 点「点击空白处显示答案」时增加单次 `light` 触感（仅在真的翻面时震，区域本身不变色） · 覆盖 AC-09 · 验证：真机点空白处，答案出现且轻震一次 · 文件：`pages/review-list/review-list.js`
- [x] **T08** 把本次修订合并进 `specs/capabilities/review-scheduling/spec.md`：AC-RS-49 色值改 0.40，新增 AC-RS-57（空白区触感），变更历史补注 · 覆盖 AC-01, AC-09 · 验证：`node scripts/spec.js check` · 文件：`specs/capabilities/review-scheduling/spec.md`
- [x] **T09** 全链路走查：微信开发者工具编译 + 首页 / 词单 / 复习 / 我的四条主链路点一遍，逐条评分验证染色与震动 · 覆盖 AC-08 · 验证：Console 无新增报错 · 文件：无（人工验证）

## 执行约定

1. **一次只做一个任务。** 做完 → 验证 → 勾选 → 提交，再开始下一个。
2. **提交信息带编号**：`feat(review): 评分按钮按下加深 + 轻震动 [#006]`、`chore(review): 下线废弃学习页 [#006]`（删除类单独一个提交，便于回滚）。
3. **发现新问题不顺手改**：记到 `TODO.md`，必要时新建 change。
4. **每个任务结束时自问**：这条改动，三个月后的我能看懂为什么吗？

## 验收记录

> 全部任务完成后填写。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 通过 | 用户真机验收（2026-10-28）；`review-list.wxml` 四键 `hover-class`，`review-list.wxss` 4 档 0.40 + `scale(0.96)` | 逐级从 0.22/0.30 调到 0.40 |
| AC-02 | 通过 | 用户真机验收；`review-list.js:395` 单次 `vibrateShort({ type: 'light' })`，无 `vibrateLong`、无补震 | 口径：触感确认，非通知 |
| AC-03 | 通过 | `if (wx.vibrateShort)` 存在性判断 + 无回调 | 静态核对 |
| AC-04 | 通过 | 震动位于 `loading` 与队列耗尽两个守卫之后，`loading` 时不进入 | 静态核对 |
| AC-05 | 通过 | `app.json` 24 项，无 `pages/learn/learn`；四文件已删除 | |
| AC-06 | 通过 | `grep -r "pages/learn" --include=*.{js,json,wxml,wxss}` 零命中 | 历史 md 文档仍提及，按 AGENTS §9 不追改 |
| AC-07 | 通过 | `reviewApi` 仅剩 `getLearningStatus`；`reviewApi.getNextWord\|submitReview` 零命中 | 调用点：`profile.js:64`、`wordlist-detail.js:111` |
| AC-08 | 通过（用户验收） | 用户「验收通过」（2026-10-28） | 编译与四条主链路走查由用户在微信开发者工具完成，AI 本机无该环境 |
| AC-09 | 通过 | 用户真机验收；`onCardTap` 在 `!showAnswer` 分支触发单次 `light`，空白区无 `hover-class` | |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 旧接口 `/api/review/next-word`、`/api/review/submit` | 已确认后端**不存在**（2026-10-28 用户告知），前端零调用 | 无需处理，本项关闭 |
| `pages/new-word-audit` 直连 `get/post` + 硬编码 URL（违反 C-01） | 规范债，功能不受影响 | 记 `TODO.md`，另立 change（建议 `#007`） |

## 归档前检查

- [x] 所有任务已勾选
- [x] 每条 AC 都有验收结论
- [x] 状态已由人执行 `verify` 改为 `verified`（不是 `approved`）
- [x] 能力规范已更新（`specs/capabilities/review-scheduling/spec.md` 的 `last_reviewed` → 2026-10-28）
- [x] `node scripts/spec.js check` 通过（2026-10-28：9 条 AC 全覆盖、9 个任务全完成、24 个页面文件齐全）
- [x] 没有把调试代码留在仓库
