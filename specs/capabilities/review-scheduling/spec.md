---
capability: review-scheduling
status: active
owned_paths:
  - pages/review-list/
  - pages/learn/
  - pages/review-forecast/
  - utils/fsrs/
  - utils/reviewTimer.js
  - utils/api.js
last_reviewed: 2026-10-22
---

# 能力：复习调度（review-scheduling）

## 1. 目的

决定"今天该复习哪些词、以什么顺序、下次什么时候再出现"。算法用 FSRS（Free Spaced Repetition Scheduler），前端负责展示与采集评分，服务端负责持久化。

## 2. 范围

**负责**
- 查询当日到期数量（轻量）与到期卡片（全量）
- 展示待复习列表
- 采集评分（忘记/模糊/认识）与响应时间
- 提交复习结果，携带新的 FSRS 卡片状态与日志
- 复习预测（未来若干天的到期量）

**不负责**
- 新词从哪个词单来（见 `word-search` / `wordlist-group`）
- 学习统计的展示口径（见 `pages/profile`）

## 3. 关键概念

| 概念 | 含义 |
|------|------|
| `due` | 到期时间戳，早于今天 23:59:59.999 即视为今日到期 |
| `state` | 0=New，1=Learning，2=Review，3=Relearning |
| `rating` | 1=Again（忘记），2=Hard（模糊），3=Good（认识），4=Easy |
| `stability` / `difficulty` | FSRS 的稳定度与难度，决定下次间隔 |
| `INTRADAY_TRIGGERED` | 当天内再次触发（短间隔复习） |

## 4. 行为规范

### R1 到期查询

- **AC-RS-01** 当用户进入复习 Tab 时，系统应调用 `GET /api/fsrs/due-count?endTs=<今日 23:59:59.999>` 只取总数，不得拉取全部卡片。
- **AC-RS-02** 当用户点击「开始复习」时，系统应调用 `GET /api/fsrs/due?endTs=` 一次性拉取当日全部卡片。
- **AC-RS-03** 当后端返回的卡片缺少 `type` 时，系统应依据 `state` 推导：`New → NEW_WORD`，`Learning/Relearning → INTRADAY_TRIGGERED`，其余 `REGULAR_REVIEW`。
- **AC-RS-04** 当 `endTs` 计算时，系统应使用**本地时区**当天 23:59:59.999。

### R2 复习过程

- **AC-RS-05** 当卡片展示时，系统应默认隐藏答案，用户主动操作后才显示释义。
- **AC-RS-06** 当用户评分时，系统应记录**卡片展示到点击评分**之间的毫秒数作为 `responseTimeMs`，扣除页面不可见期间的时长，并按 `[0, 60000]` 截断（细则见 AC-RS-15 ~ AC-RS-19）。
- **AC-RS-07** 当提交进行中时，系统应阻止重复评分，避免同一张卡生成两条日志。
- **AC-RS-08** 当当日卡片全部完成后，系统应展示完成态，而不是空白页。

### R3 提交与状态

- **AC-RS-09** 提交时必须携带 `clientRequestId`（幂等键）、`card`、`log`、`responseTimeMs`、`fsrsVersion`。
- **AC-RS-10** 当后端返回 `3001`（单词不存在/已移出词单）时，系统应静默跳过该卡并继续下一张：不得弹任何错误提示、该卡计入已处理数、下一张的响应时间从零起算（细则见 AC-RS-20 / AC-RS-21）。
- **AC-RS-11** 当网络失败时，系统应保留当前卡片与已选评分，允许重试，不得直接跳到下一张。
- **AC-RS-12** 提交成功后，系统应使用后端返回的新卡片状态更新本地，不得由前端自行推算下次 `due`。

### R4 字段边界

- **AC-RS-13** 后端 camelCase（`elapsedDays`）与 ts-fsrs snake_case（`elapsed_days`）的转换，只允许发生在 `utils/fsrs/dataSource.js`。
- **AC-RS-14** `wordId` 全程为字符串，禁止数值化。

### R5 响应时间口径

- **AC-RS-15** 当复习页由可见变为不可见（切换 tab、进入其他页面、小程序退到后台、锁屏）时，系统应暂停当前卡片的计时。
- **AC-RS-16** 当复习页重新可见时，系统应恢复计时，不可见期间经过的时长不得计入 `responseTimeMs`。
- **AC-RS-17** 当用户点击评分时，系统应上报扣除全部不可见时长后的毫秒数，且该值不小于 0。
- **AC-RS-18** 当扣除后的时长超过 `60000` 毫秒时，系统应按 `60000` 上报；计算结果为负时按 `0` 上报。
- **AC-RS-19** 当用户在显示答案后停留任意时长再评分时，系统应将该时长计入 `responseTimeMs`，不得额外扣除，仅受 AC-RS-18 约束。
- **AC-RS-20** 当复习提交返回 `3001` 时，系统应静默跳过该卡：不展示任何错误提示，将该卡计入已处理数，并直接展示下一张。
- **AC-RS-21** 当因 `3001` 跳转到下一张卡时，系统应重置首次响应时间，下一张卡上报的 `responseTimeMs` 不得沿用上一张的值。

> 口径依据（#003）：Anki 手册明确"作答时长不参与调度"（`The time taken does not influence scheduling`），计时区间为「题目出现 → 按评分键」，因此看答案计入、离开页面扣除、单卡上限 60 秒。

## 5. 边界与异常

| 场景 | 预期行为 | 当前实现 |
|------|----------|----------|
| 后端 FSRS 未就绪 | 使用本地 mock 数据，页面无感 | `USE_MOCK` 开关（当前为 `false`） |
| 卡片对应单词已删除 | 静默跳过：不弹提示、计入已处理、重置计时 | `WORD_NOT_FOUND = 3001`（#003） |
| 页面切走 / 退到后台 | 暂停计时，回来继续，离开时长不计入 | `utils/reviewTimer.js`（#003） |
| 单卡停留超过 60 秒 | 按 60 秒记录 | `MAX_RESPONSE_TIME_MS`（#003） |
| 重复点击评分 | 只提交一次 | 页面提交锁 + `clientRequestId` |
| 跨天复习 | 以进入页面时的 `endTs` 为准，不中途重算 | `endOfToday()` 在调用时计算 |
| 无到期卡片 | 展示"今日已完成"空状态 | 页面空态 |

## 6. 数据与依赖

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/fsrs/due-count` | GET | 参数 `endTs`，轻量计数 |
| `/api/fsrs/due` | GET | 参数 `endTs`，返回卡片数组 |
| `/api/fsrs/review` | POST | 提交评分与新状态 |
| `/api/fsrs/forecast` | GET | 复习预测（页面 `review-forecast`） |

**版本约束**：`FSRS_VERSION = '5.4.1'`，必须与前端 ts-fsrs 版本一致，否则服务端可能拒绝或算出不同间隔。

## 7. 已知限制

- 页面在拉取 `due` 后不再刷新；若用户在其它设备复习过，本机列表会短暂过期。
- mock 分支仍保留在代码中，切换 `USE_MOCK` 会改变数据来源，属于 L3 改动。
- 预测接口的展示口径未与服务端对齐文档，调整前需确认。

## 8. 变更历史

| 日期 | 变更 | 变更目录 |
|------|------|----------|
| 2026-10-22 | 反向补录：首次建立能力规范（覆盖存量实现） | — |
| 2026-10-22 | 响应时间口径：扣除页面不可见时长、60 秒上限、3001 静默与计时重置 | `changes/003-review-response-time/` |
