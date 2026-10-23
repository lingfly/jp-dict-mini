# 技术设计：复习响应时间口径

## 元信息

| 项 | 值 |
|----|----|
| 关联 AC | AC-01 ~ AC-07 |
| 影响文件 | 见 §2 |
| 是否改接口 | 否（字段与签名都不变） |
| 是否改数据契约 | 否 |

## 1. 方案概述

把"取当前时间减开始时间"换成一个小型计时器模块：页面可见性变化时暂停/恢复，取用时自动扣掉隐藏时长并截断到 `[0, 60000]`。3001 分支抽出统一的"跳过当前卡"收尾方法，顺带清掉首次耗时、补上已处理计数；请求层按"路径 + 业务码"静默 3001。

不改接口、不改 FSRS、不新增界面元素。

## 2. 影响面

| 文件 | 改动类型 | 说明 | 风险 |
|------|----------|------|------|
| `utils/reviewTimer.js` | 新增 | 计时器：`start / pause / resume / elapsed`，内含 `MAX_RESPONSE_TIME_MS` 与 clamp | 低（纯函数，可 node 直接跑） |
| `pages/review-list/review-list.js` | 修改 | 接入 `onHide`/`onShow`；`showCurrentCard` 改为 `timer.start()`；评分改取 `timer.elapsed()`；3001 与详情缺失统一走 `skipCurrentCard()` | 中（生命周期顺序） |
| `utils/request.js` | 修改 | 新增"路径 + 业务码"级静默，命中 `/api/fsrs/review` + `3001` 时不弹 toast | 中（全局请求层，需确认不误伤） |
| `utils/fsrs/dataSource.js` | 修改 | 只改 `:180` 的注释，使"请求层已静默"与实现一致 | 低 |
| `specs/capabilities/review-scheduling/spec.md` | 修改 | 合并 AC-RS-06 的新口径，新增 AC-RS-15 ~ AC-RS-21 | 低 |

未触及：`pages/learn`（无入口）、`utils/fsrs/fsrs.js`、任何接口签名。

## 3. 数据流 / 时序

```text
showCurrentCard()
  → timer.start()                 [startedAt = now；hiddenMs = 0]
  → 用户看图 / 切走 / 显示答案
      onHide  → timer.pause()     [hiddenAt = now]
      onShow  → timer.resume()    [hiddenMs += now - hiddenAt]
  → 点评分
      handleScore()
        → responseTimeMs = firstResponseTime || timer.elapsed()
        → clamp 在 elapsed() 内部完成
        → dataSource.submitReview({ responseTimeMs, ... })
        → request.js  → POST /api/fsrs/review
        ├─ 200      → 清 firstResponseTime → showCurrentCard()（timer.start 重置）
        ├─ 3001     → request 层静默 → skipCurrentCard()（清 firstResponseTime + completedCount++）→ showCurrentCard()
        └─ 超时/异常 → 保留 firstResponseTime，停留当前卡重试（#001 AC-15）
```

**关键状态**

计时器内部状态（挂在页面实例上，不进 `data`，避免无意义的 `setData`）：

| 字段 | 类型 | 初始值 | 含义 |
|------|------|--------|------|
| `startedAt` | number | `0` | 本张卡的计时起点 |
| `hiddenAt` | number | `0` | 进入不可见的时刻；`0` 表示当前可见 |
| `hiddenMs` | number | `0` | 本张卡累计隐藏时长 |
| `visible` | boolean | `true` | 页面当前是否可见 |

页面 `data` 变化：

| 字段 | 变化 |
|------|------|
| `startTime` | **删除**（改由计时器持有；`data` 里只留注释说明去哪了） |
| `firstResponseTime` | 语义不变，仍是"首次评分耗时"；3001 分支也会清 0 |

## 4. 接口约定

不变。`responseTimeMs` 仍为 number，单位毫秒，取值区间由原来的 `[0, +∞)` 收紧为 `[0, 60000]`。

后端无需改动；若后端已有自己的上限校验，本改动只会让前端值更小。

## 5. 边界与降级

| 情况 | 处理方式 | 用户看到什么 |
|------|----------|-------------|
| 切 tab / 进纠错页 / 切后台 / 锁屏 | `onHide` 暂停，`onShow` 恢复 | 无感知 |
| 提交请求进行中切后台，回来时新卡已加载 | `start()` 在不可见状态下把 `hiddenAt` 设为起点，`resume()` 时整段扣除 | 无感知 |
| 页面被回收后重建 | 计时器随之重建，当前卡从 0 开始 | 卡片重新出现 |
| 系统时间被回拨 | `elapsed()` 结果为负 → clamp 0 | 上报 0 |
| 停留超过 60 秒 | clamp 到 60000 | 无感知，仅请求体不同 |
| 3001 | 静默跳过：不弹 toast、不计错误、`completedCount++`、清首次耗时 | 卡片直接换下一张 |
| 卡片详情获取失败 | 与 3001 同一收尾路径 | 同上 |
| 网络超时/失败 | 不变：停留当前卡，沿用首次耗时重试 | 错误提示条（`#001` 行为） |

## 6. 兼容与回滚

- **老版本小程序**：无影响，纯前端计算。
- **后端先上/前端先上**：均可独立发布，字段未变。
- **回滚**：revert `review-list.js` + `request.js` + 删除 `utils/reviewTimer.js` 即可，无脏数据（只是回到旧口径）。

## 7. 验证手段

| 验证项 | 手段 | 通过标准 |
|--------|------|----------|
| 计时器时序（纯逻辑） | 临时 node 脚本直接 require `utils/reviewTimer.js`，手工喂时间戳 | 切走 30s → elapsed 不含 30s；超时 → 60000；负值 → 0 |
| 切 tab 扣除 | 开发者工具：进复习页 → 切「词单」停 30s → 回来评分 → Network 看请求体 | 值 ≈ 切走前停留时长 |
| 切后台扣除 | 真机预览：切到微信聊天 1 分钟 → 回来评分 | 值 ≤ 60000 且不含后台时长 |
| 显示答案不扣 | 显示答案后停 90s 再评分 | 值 = 60000 |
| 3001 静默 | mock 返回 `{code:3001}` | 无 toast、无错误条、下一张正常、进度分子 +1 |
| 3001 不串卡 | 同上，对比 3001 前后两次请求体 | 第二张的值从 0 起算 |
| 回归 | 正常复习 20 张、提交失败重试、短间隔卡回插 | 无新增 console 报错，队列行为不变 |

## 8. 备选方案与否决理由

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A 新建 `utils/reviewTimer.js`（采用） | 逻辑集中、可在 node 里直接验证、页面只留 4 行调用 | 多一个文件 | ✅ |
| B 页面内联 `_hiddenMs` / `_hiddenAt` | 少一个文件 | 生命周期分支散在页面里，后续接入 learn 或其它页要复制 | ❌ 重复代码 |
| C 用 `wx.onAppShow` 全局记录 | 能覆盖更多入口 | 无法区分"复习页隐藏"与"其它页隐藏"，会把纠错页内的正常停留误扣 | ❌ 粒度不对 |
| D 拆分 `recallTimeMs`（卡片→揭示答案） | 指标更纯 | 动接口字段，升级 L3；与 Anki 口径不可比 | ❌ 非目标 |

## 9. 3001 分支详解（现状 → 变更）

**触发前提**：卡片里存的 `wordId` 在后端已不存在（单词被删或从词单移出），但本地队列是进入页面时拉的，仍持有这张卡。

**现状链路**：

1. `POST /api/fsrs/review` 返回 HTTP 200 + `{ code: 3001, message: "..." }`。
2. `utils/request.js:216-219`：`code !== 200` → `notifyOnce(body.message)` **弹 toast**。因为 `SILENT_PATHS` 只含 `/api/ai-dict/query-result`（`:26`），`/api/fsrs/review` 不在其中。
3. `utils/fsrs/dataSource.js:181-184`：捕获 3001，返回 `{ code: 3001, data: null }`。`:180` 的注释写"request 层已对该码免弹错误提示"——**与实现不符**。
4. `pages/review-list/review-list.js:360-373`：`queue.splice(queueIndex, 1)` → `updateStats()` → `showCurrentCard()` → `updateBadgeLocally()` → 队列空则 toast「今日复习完成」→ `return`。

**现状的四个问题**：

| # | 问题 | 后果 |
|---|------|------|
| 1 | `firstResponseTime` 未清 0 | `showCurrentCard` 只重置 `startTime`；下一张评分时 `firstResponseTime \|\| ...` 命中旧值，把上一张的耗时再报一次 |
| 2 | `completedCount` 未 +1 | `completed/total` 的分子缺一张，进度条永远到不了 100% |
| 3 | 请求层未静默 | 用户看到一条错误 toast，同时卡片被无声跳过，两种反馈互相矛盾 |
| 4 | `showCurrentCard:148-152` 详情缺失也 `splice` | 同一类"跳过"缺少统计与计时收尾，且递归调用没有上限 |

**变更后**：抽出 `skipCurrentCard()`，统一做三件事——移出队列、`completedCount++`、`firstResponseTime = 0`；3001 与详情缺失都走它。请求层加"路径 + 业务码"静默，使 `dataSource.js:180` 的注释成立。

## 10. 宪法对照

- [x] C-01 请求未绕过 `request.js`（只在 `handleSuccess` 增加静默判定）
- [x] C-02 未改动环境判定
- [x] C-03 ID 保持字符串（不涉及）
- [x] C-04 FSRS 字段转换未外溢（不涉及）
- [x] C-05 需要 token 的请求仍等待登录
- [x] C-06 每个 catch 都有出口（计时器无异常分支；页面 catch 保持原出口）
- [x] C-07 未新增页面
- [x] C-08 未引入依赖
- [x] C-12 未超出 proposal 的非目标
