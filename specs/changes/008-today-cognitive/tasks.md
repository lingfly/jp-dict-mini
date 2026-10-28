# 任务清单：复习完成页展示「今日复习详情」

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` / `backend-api.md` |
| 任务数 | 8 |
| 预估总时长 | 1 天 |

## 任务

- [x] **T01** `utils/api.js` 的 `fsrsApi` 新增 `getTodayCognitive()`；`utils/fsrs/dataSource.js` 新增同名封装（失败返回 `{code:0,data:null}`） · 覆盖 AC-01, AC-04 · 验证：真机调用一次，Console 打印响应 · 文件：`utils/api.js`、`utils/fsrs/dataSource.js`
- [x] **T02** 完成态取数逻辑：三处触发点、`_todayLoaded` / `_dueRetried` / `_todayDateRetried` / 抑制一次标记、`due > 0` 静默重拉 · 覆盖 AC-01, AC-02, AC-04, AC-05, AC-11 · 验证：分别构造三种完成路径与短间隔卡场景 · 文件：`pages/review-list/review-list.js`
- [x] **T03** 派生数据与格式化：`buildTodayView`（四行归一、`empty` 判定）、日期斜杠、时长含小时段 · 覆盖 AC-06, AC-07, AC-08, AC-10 · 验证：用接口实测值手工核对四行比例与时长文案 · 文件：`pages/review-list/review-list.js`
- [x] **T04** 完成态界面：详情卡（日期 / 四行 / 三列 / 完成文字）、空记录分支、保留原 idle-card 兜底 · 覆盖 AC-03, AC-06 ~ AC-10 · 验证：真机完成复习后看布局与文案 · 文件：`pages/review-list/review-list.wxml`
- [x] **T05** 详情卡样式：卡片、条形（轨道 14px / 圆角 7px / 四档色）、三列分隔线、完成文字 · 覆盖 AC-03, AC-07, AC-08, AC-09 · 验证：真机逐项对照界面契约 · 文件：`pages/review-list/review-list.wxss`
- [x] **T06** 覆盖式验收：`due === 0` / `due > 0` / 接口失败 / 四档全 0 / 跨零点 五个场景各走一遍，并合并规范 · 覆盖 AC-01 ~ AC-13 · 验证：`node scripts/spec.js check` + 真机 · 文件：`specs/capabilities/review-scheduling/spec.md`
- [x] **T08** 完成态去闪烁：新增 `todayLoading` 占位、失败走「空数据详情卡」（`buildEmptyTodayView`，数值「—」）、删除旧 `done-state` 及其样式；`due > 0` 无卡时展示详情并 `console.warn` 缺陷日志 · 覆盖 AC-04, AC-12, AC-13 · 验证：反复切复习 tab 无旧页闪现；断网看空数值版式；构造 due>0 无卡场景看日志 · 文件：`pages/review-list/review-list.js`、`pages/review-list/review-list.wxml`、`pages/review-list/review-list.wxss`
- [x] **T07** 时长改冒号格式：`formatDurationText` 改为 `M:SS` / `H:MM:SS`（秒补零，0 为 `0:00`） · 覆盖 AC-08 · 验证：node 验算 `0:00` / `0:25` / `17:05` / `1:11:45` + 真机不折行 · 文件：`pages/review-list/review-list.js`

## 执行约定

1. 一次只做一个任务，做完 → 验证 → 勾选。
2. 提交信息带编号：`feat(review): 完成页展示今日复习详情 [#008]`。
3. 不改评分、计时、角标、调度逻辑；发现新问题记 `TODO.md`。

## 验收记录

> 全部任务完成后填写。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 通过（真机验收） | 三处触发点：`initReview` 空队列、`handleScore` 的 `!hasNext`、3001 的 `!hasNextAfterSkip` | 用户验收（2026-10-28） |
| AC-02 | 通过（真机验收） | `due > 0` 有卡时 `await initReview()` 后 `return`，不渲染详情 | 短间隔卡场景由用户验收 |
| AC-03 | 通过（真机验收） | `due === 0` → `setData({todayView})`；wxml 空闲分支优先渲染 `today-card` | |
| AC-04 | 通过（静态） | 失败/异常走 `buildEmptyTodayView()`：同版式，四档与三列为「—」、条形为空、日期取本地 | 真机断网确认 |
| AC-12 | 通过（静态） | `todayLoading` 在 `await` 之前 setData；`done-state` 结构与 WXSS 已删除（全仓库零命中） | 真机反复切 tab 确认 |
| AC-13 | 通过（静态） | `due > 0` 重拉后有卡 `return`；无卡则 `console.warn(...)` 后继续渲染详情 | 构造场景看日志 |
| AC-05 | 通过（静态） | `data.date !== localDateKey()` 时重拉一次（循环改为二次请求，避免递归竞态） | |
| AC-06 | 通过（静态） | `buildTodayView` 固定返回四行，`value` 为 `Number(x)||0` | |
| AC-07 | 通过（静态） | `percent = round(v/sum*1000)/10`；`sum === 0` 时为 0 | 31/5/24 → 51.7/8.3/40 |
| AC-08 | 通过（静态） | `formatDurationText` 已改冒号格式，node 验算：`0:00` / `0:25` / `17:05` / `1:11:45` | 真机确认三列不折行 |
| AC-09 | 通过（静态） | `.today-done` 为纯 `text`，无 `bindtap` | |
| AC-10 | 通过（静态） | `empty: sum === 0` → 只渲染日期 + 「今日暂无复习记录」 | |
| AC-11 | 通过（静态） | `_todayLoaded` 去重、`_dueRetried` 只重拉一次、`_todaySuppressOnce` 抑制循环 | |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 学习统计页详情卡时长仍为「N 分 N 秒」，无小时段 | 超过 1 小时显示成「75 分 3 秒」 | 记 `TODO.md`，另立 change |

## 归档前检查

- [x] 所有任务已勾选
- [x] 每条 AC 都有验收结论
- [x] 状态改为 `verified` 后再归档
- [x] 能力规范已更新（`specs/capabilities/review-scheduling/spec.md` 的 AC-RS-58 ~ AC-RS-70、`last_reviewed` 2026-10-28）
- [x] `node scripts/spec.js check` 通过（2026-10-28：13 条 AC 全覆盖、8 个任务全完成、24 个页面文件齐全）
- [x] 没有把调试代码留在仓库（仅保留 AC-13 要求的 `console.warn` 缺陷日志）
