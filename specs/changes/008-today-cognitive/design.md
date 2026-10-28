# 设计：复习完成页展示「今日复习详情」

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `tasks.md` / `backend-api.md` |
| 级别 | L2 |

## 1. 影响面（要改的文件，一个不漏）

| 文件 | 改动 | 对应 AC |
|------|------|---------|
| `utils/api.js` | `fsrsApi` 新增 `getTodayCognitive()` → `GET /api/fsrs/due-forecast/today` | AC-01 |
| `utils/fsrs/dataSource.js` | 新增 `getTodayCognitive()` 包一层失败兜底（返回 `{code:0,data:null}`），保持"页面只认 dataSource"的既有分层 | AC-01 / AC-04 |
| `pages/review-list/review-list.js` | 完成态取数、`todayLoading` / `todayError` 三态、时间/日期格式化、`due > 0` 重拉与缺陷日志；三处触发点 | AC-01 ~ AC-05 / AC-11 ~ AC-13 |
| `pages/review-list/review-list.wxml` | 空闲分支改为三态：详情卡 / 加载中 / 失败提示；删除旧 `done-state` | AC-03 / AC-04 / AC-06 ~ AC-10 / AC-12 |
| `pages/review-list/review-list.wxss` | 详情卡样式 | AC-03 / AC-06 ~ AC-10 |
| `specs/capabilities/review-scheduling/spec.md` | 归档时合并 AC-RS-58 ~ AC-RS-68 与变更历史 | 全部 |

**不改**：`pages/review-forecast`、`utils/reviewTimer.js`、评分与调度逻辑、`/api/fsrs/due-forecast` 主接口用法。

## 2. 数据流

```text
本地队列清空（三种时机之一）
   └─ loadTodayDetail()
        └─ dataSource.getTodayCognitive()
             └─ GET /api/fsrs/due-forecast/today
                  ├─ code !== 200 或失败 → todayError = true（「加载失败 + 下拉刷新」）  AC-04
                  ├─ data.date ≠ 本地日期 → 重拉一次；仍不等按返回日期展示            AC-05
                  ├─ data.due > 0 → 重拉队列：有卡则复习；仍无卡 → warn 日志 + 展示详情  AC-02 / AC-13
                  └─ data.due === 0 → buildTodayView(data) → setData({ todayView })   AC-03
```

`todayView` 是**页面派生数据**（不是接口原始结构）：

| 字段 | 来源 | 说明 |
|------|------|------|
| `dateText` | `data.date` | `2026-10-28` → `2026/10/28`；缺失时用本地日期 |
| `rows[]` | `data.cognitive` | 固定四行：简单/认识/模糊/忘记，含 `icon` / `label` / `value` / `percent` / `color` |
| `empty` | 四档之和 === 0 | 为 `true` 时只渲染「今日暂无复习记录」 |
| `newLearned` / `review` | `data.reviewAndNew` | 底层 `null`/`undefined` 一律按 `0` |
| `durationText` | `data.durationSeconds` | `formatDurationText()`，见 §3.3 |

## 3. 实现要点

### 3.1 触发点的三处落点

| 时机 | 落点 |
|------|------|
| 首屏 / 下拉刷新后队列为空 | `initReview()` 的 `queue.length === 0` 分支 |
| 评分成功、队列耗尽 | `handleScore()` 里 `if (!hasNext)` 分支（与现有「今日复习完成」toast 同处） |
| 3001 静默跳过后耗尽 | `handleScore()` 里 `if (!hasNextAfterSkip)` 分支 |

去重与复位：

- `this._todayLoaded`：同一完成态只请求一次（AC-11）。`initReview()` 开头复位为 `false`，因为重拉队列意味着"新的一轮"。
- `this._dueRetried`：`due > 0` 时只允许重拉一次队列（AC-11），`initReview()` 开头复位。
- `this._todayDateRetried`：跨零点重拉只允许一次（AC-05）。

### 3.2 `due > 0` 的处理（防死循环）

```text
loadTodayDetail → due > 0
  → setData({ dueCount: due })
  → _dueRetried 未用 → 置 true → await this.initReview()   // 有卡就出卡
       ├─ 队列非空 → 进入复习，不展示详情，return
       └─ 队列仍空 → console.warn（缺陷信号）→ 继续往下走，展示详情
  → 展示 todayView（AC-13）
```

两个要点：

1. **抑制一次**：`initReview()` 的空队列分支会再次触发取数，重拉前先设 `this._todaySuppressOnce = true`，`loadTodayDetail()` 入口消费该标记后直接返回，避免 `拉空 → 查今日 → due>0 → 再拉空` 的循环。
2. **缺陷日志**：`due > 0` 但队列仍为空，说明后端统计口径与实际可出卡不一致。用 `console.warn('[review-list] due > 0 但无卡可出…', { due, date })` 留痕，不对用户弹提示（用户已经复习完，弹"还有卡片"只会制造困惑）。

### 3.3 格式化

| 项 | 规则 | 例子 |
|----|------|------|
| 日期 | 取接口 `date`（`yyyy-MM-dd`）把 `-` 换成 `/` | `2026/10/28` |
| 时长 | 冒号格式：`M:SS` / `H:MM:SS`，秒补零两位；0 为 `0:00` | `0:00` / `0:25` / `17:25` / `1:11:45` |
| 条形 | `该档 ÷ 四档之和 × 100`，保留 1 位小数；和为 0 → 0 | `31/60` → `51.7%` |

### 3.4 渲染顺序（消除旧完成页闪烁）

旧版是"先渲染 ✓ 今日复习已完成，数据回来再换"，切 tab 时会闪一下旧页（用户已反馈）。改为完成态三态，**旧完成页不再存在**：

| 状态 | 条件 | 渲染 |
|------|------|------|
| 取数中 | `todayLoading === true` | 居中「加载中...」（沿用既有 loading 样式） |
| 已取到 | `todayView` 非空 | 详情卡（`empty` 时只显示「今日暂无复习记录」） |
| 失败 | `todayView` 为 `buildEmptyTodayView()` 的结果 | **同一套详情卡版式**，数值全为「—」、条形无填充、日期用本地当天 |

失败不另设 UI 分支：`todayView` 有值就渲染，`noData: true` 只用于让数值渲染成「—」（模板里统一 `{{item.value}}`，值为字符串 `'—'` 即可，无需额外条件）。

`todayLoading` 必须在 `initReview()` 把 `loading` 置回 `false` **之前**设为 `true`（`loadTodayDetail()` 内同步 setData，位于 `await` 之前），否则仍会有一帧渲染到兜底分支。

### 3.5 与现有分支的关系

`review-list.wxml` 的空闲分支结构：

```text
wx:elif="{{!currentWord && !loading}}"
  ├─ todayView → 详情卡（含 empty 子分支；失败时也是它，只是数值为「—」）
  ├─ todayLoading → 「加载中...」
  └─ 否则 → idle-card（极端兜底：due > 0 且详情未就绪，保留「开始复习」入口）
```

`done-state`（✓ 今日复习已完成）连同其 WXSS 一并删除，不再作为任何兜底。

## 4. 回滚

| 改动 | 回滚方式 | 风险 |
|------|---------|------|
| 本次全部 | 单个提交整体 revert（页面结构、样式、api/dataSource 新增方法、完成态调用点） | 低：全部是新增分支，`due > 0` 路径行为未变 |

## 5. 上限与取舍

- 完成页数字与学习统计页来自同一套服务端代码（后端文档 §4），前端不做二次计算，避免两处口径漂移。
- 短间隔卡会导致 `due > 0` 且无卡可出，此时停在空闲态（数字 + 开始复习），这是后端累计口径决定的可观测结果，不在前端改写。
- 不做下拉刷新以外的重试入口：接口失败时用户下拉刷新即可（与页面既有加载失败处理一致）。
