---
capability: review-scheduling
status: active
owned_paths:
  - pages/review-list/
  - pages/review-learn/
  - pages/learn/
  - pages/review-forecast/
  - utils/fsrs/
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
- **AC-RS-06** 当用户评分时，系统应记录从显示到评分之间的毫秒数作为 `responseTimeMs`。
- **AC-RS-07** 当提交进行中时，系统应阻止重复评分，避免同一张卡生成两条日志。
- **AC-RS-08** 当当日卡片全部完成后，系统应展示完成态，而不是空白页。

### R3 提交与状态

- **AC-RS-09** 提交时必须携带 `clientRequestId`（幂等键）、`card`、`log`、`responseTimeMs`、`fsrsVersion`。
- **AC-RS-10** 当后端返回 `3001`（单词不存在/已移出词单）时，系统应静默跳过该卡并继续下一张，不弹全局错误。
- **AC-RS-11** 当网络失败时，系统应保留当前卡片与已选评分，允许重试，不得直接跳到下一张。
- **AC-RS-12** 提交成功后，系统应使用后端返回的新卡片状态更新本地，不得由前端自行推算下次 `due`。

### R4 字段边界

- **AC-RS-13** 后端 camelCase（`elapsedDays`）与 ts-fsrs snake_case（`elapsed_days`）的转换，只允许发生在 `utils/fsrs/dataSource.js`。
- **AC-RS-14** `wordId` 全程为字符串，禁止数值化。

## 5. 边界与异常

| 场景 | 预期行为 | 当前实现 |
|------|----------|----------|
| 后端 FSRS 未就绪 | 使用本地 mock 数据，页面无感 | `USE_MOCK` 开关（当前为 `false`） |
| 卡片对应单词已删除 | 静默跳过，继续下一张 | `WORD_NOT_FOUND = 3001` |
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
