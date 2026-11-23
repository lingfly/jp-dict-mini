# 任务清单：复习响应时间口径

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` |
| 任务数 | 6 |
| 预估总时长 | 约 2.5 小时（含真机验证） |

## 任务

- [x] **T01** 新建 `utils/reviewTimer.js`：实现 `start / pause / resume / elapsed`，内含 `MAX_RESPONSE_TIME_MS = 60000` 与 `[0, 60000]` clamp；导出 `MAX_RESPONSE_TIME_MS` 便于验证 · 覆盖 AC-01, AC-02, AC-03, AC-04 · 验证：临时 node 脚本喂时间戳，断言"可见 5s + 隐藏 30s + 可见 3s"结果为 8000 · 文件：`utils/reviewTimer.js`
- [x] **T02** `review-list` 接入计时器：`onLoad` 创建、`onHide` 暂停、`onShow` 恢复、`showCurrentCard` 改 `timer.start()`、`handleScore` 改 `timer.elapsed()`，删除 `data.startTime` · 覆盖 AC-01, AC-02, AC-03, AC-04 · 验证：开发者工具切 tab 30s 后评分，Network 请求体不含这 30s · 文件：`pages/review-list/review-list.js`
- [x] **T03** 固定 AC-05 的口径：确认 `toggleAnswer()` 不接入计时器，并在该方法补一行注释说明"看答案时间计入响应时间，仅受上限约束" · 覆盖 AC-05 · 验证：显示答案后停 90s 再评分，请求体为 60000 · 文件：`pages/review-list/review-list.js`
- [x] **T04** 抽出 `skipCurrentCard()`（移出队列 + `completedCount++` + 清 `firstResponseTime`），3001 分支与 `showCurrentCard` 详情缺失分支统一调用 · 覆盖 AC-06, AC-07 · 验证：mock 3001，连续两卡对比请求体，第二张不沿用第一张耗时；进度分子 +1 · 文件：`pages/review-list/review-list.js`
- [x] **T05** `request.js` 增加"路径 + 业务码"静默：`/api/fsrs/review` 返回 `3001` 时不弹 toast；同步订正 `dataSource.js:180` 的注释 · 覆盖 AC-06 · 验证：mock 3001 时无 toast、无错误条 · 文件：`utils/request.js`、`utils/fsrs/dataSource.js`
- [x] **T06** 规范同步：更新 `capabilities/review-scheduling/spec.md`（AC-RS-06 新口径 + 新增 AC-RS-15 ~ AC-RS-21）、`INDEX.md` 状态与日期；跑 `node scripts/spec.js check` · 覆盖 AC-01 ~ AC-07 · 验证：check 无 error、AC 全覆盖 · 文件：`specs/`

## 执行约定

1. **一次只做一个任务。** 做完 → 验证 → 勾选，再开始下一个。
2. **提交信息带编号**：`fix(review-list): 扣除切页时长 [#003]`。
3. **发现新问题不顺手改**：记到 `TODO.md`，必要时新建 change。
4. **每个任务结束时自问**：这条改动，三个月后的我能看懂为什么吗？

## 验收记录

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 部分 | `utils/reviewTimer.js` 的 `pause` 已接 `onHide` | 纯逻辑已验；运行时待开发者工具确认 |
| AC-02 | 部分 | `resume` 已接 `onShow`；临时脚本断言"可见 5s + 隐藏 30s + 可见 3s = 8000"通过 | 同上 |
| AC-03 | 部分 | `handleScore` 改取 `timer.elapsed()` | 待 Network 面板核对请求体 |
| AC-04 | 部分 | 临时脚本 9/9 通过，含"125000ms → 60000"与"时间回拨 → 0" | 待真机核对 |
| AC-05 | 部分 | `toggleAnswer` 未接计时器，已加注释 | 待"显示答案后停 90s = 60000"实测 |
| AC-06 | 部分 | `isSilentBiz` 命中 `/api/fsrs/review` + 3001；`skipCurrentCard` 计入已处理 | 待 mock 3001 实测 |
| AC-07 | 部分 | `skipCurrentCard` 内 `firstResponseTime: 0` | 待对比前后两次请求体 |

> 纯逻辑验证脚本为临时文件（`/tmp/timer_test.js`），未入库；运行时验证需在微信开发者工具/真机完成。

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| `pages/learn` 仍是旧口径（无入口） | 若未来恢复入口会重现失真 | 记 TODO，恢复入口时同步接入 `reviewTimer` |

## 归档前检查

- [ ] 所有任务已勾选
- [ ] 每条 AC 都有验收结论
- [ ] 状态已由人改为 `verified`
- [ ] 能力规范已更新
- [ ] `node scripts/spec.js check` 通过
- [ ] 没有把调试代码（临时 console.log、临时上限开关）留在仓库
