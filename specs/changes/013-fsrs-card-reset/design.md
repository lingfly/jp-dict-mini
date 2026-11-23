# 技术设计：FSRS 卡片重新学习（重置）与日志轨迹

> **状态：draft 草案。** 未获批准前不执行任何 DDL、不修改任何代码。批准后再按 §2 影响面逐项落地。

## 元信息

| 项 | 值 |
|----|----|
| 关联 AC | AC-01 ~ AC-18 |
| 影响文件 | 见 §2（后端为主体，前端 P2） |
| 是否改接口 | 是（新增重置接口；`review` 请求体不变） |
| 是否改数据契约 | 是 → L3 |

## 1. 方案概述

1. **日志侧**：给 `fsrs_review_log` 补"轮次 + 复习前累计次数"，用 `(user_id, word_id, card_reps_before)` 做唯一键——因为 `reps` 保留不清零，这个序号全局单调，不需要轮次参与判重。
2. **幂等侧（AC-19，本次复核新增）**：`clientRequestId` 必须由**调用方**（`pages/review-list`）在一次评分动作开始时生成一次，重试复用同一个值。当前它在 `submitReview()` 内部生成（`utils/fsrs/dataSource.js:173`），每次重试都是新 ID，导致 `uk_user_word_reqid` 形同虚设，也导致 AC-02 的判重没有落点。
3. **重置侧**：`fsrs_card` 加轮次与重置计数，新建 `fsrs_card_reset` 事件表；重置在一个事务里完成"改卡 + 写事件"，用 `expectedEpoch` 乐观锁保证同一张卡只成功一次。
4. **训练侧**：导出按 `(word_id, epoch)` 分组，`delta_t` 由 `review` 时间推算，不读日志里的 `elapsed_days`。

> **§1 第 1 条的前提已在 2026-11-06 复验**：当前库重复行为 **0**，`T01` 从"归档 4 条"改为"确认 0 行；非 0 则停止并人工确认"。历史缺口 3 例（`reps` 比日志多 1）**已决定校正**（用户 2026-11-06 选定 ②），校正后 `AC-03` 恢复为"绝对连续"，详见 `proposal.md` §1.4 与 `design.md` §2.5。

## 2. 影响面

| 文件 / 对象 | 改动类型 | 说明 | 风险 |
|------------|----------|------|------|
| `fsrs_review_log` | 修改（DDL） | 加 `epoch`、`card_reps_before`、唯一键 `uk_traj`、版本默认值 | **高**：先确认重复行为 0（2026-11-06 实测已为 0） |
| `fsrs_card` | 修改（DDL） | 加 `epoch`、`reset_count`、`last_reset_at` | 低（均有默认值） |
| `fsrs_card_reset` | 新增（表） | 重置事件，append-only | 中 |
| 后端日志写入逻辑 | 修改 | 写日志时取"复习前 card.reps"与 `card.epoch` | **高**：取错对象会让序号错乱 |
| 后端重置接口 | 新增 | `POST /api/fsrs/card/reset` | 中 |
| 后端训练导出脚本 | 新增 | 按轨迹分组导出 CSV | 低 |
| `utils/api.js` | 新增方法 | `fsrsApi.resetCard` | 低 |
| `utils/fsrs/dataSource.js` | **改既有签名** + 新增方法 | ① `submitReview()` 接受外部传入的 `clientRequestId`（AC-19，见 §3.1）；② 新增 `resetCard(wordId)` | **中**：改既有签名，须回归所有调用点 |
| `pages/review-list/review-list.js` | 修改 | 生成并持有 `clientRequestId`、重置后移出队列与刷新角标 | 中（牵动队列与角标） |
| `pages/word-detail/word-detail.js/.wxml/.wxss` | 修改 | 「更多」菜单新增「重新学习」（第一项）+ 确认弹窗；覆盖查词、词单两个入口 | 中 |
| `pages/review-list/review-list.wxml/.wxss` | 修改 | 同上（菜单项与弹窗） | 中 |
| `specs/capabilities/review-scheduling/spec.md` | 修改 | 归档时合并 AC-01~20（跳过 AC-17） | 低 |

### 2.1 后端：三个入口的轮次数据来源（AC-20，2026-11-06 补入）

`expectedEpoch` 是重置请求的必填字段，但三个入口的数据来源各不相同。**缺任何一处，对应入口的重置功能不可用**（只能传 0 或猜值，轮次不一致会被 3008 拒绝）。

| 入口 | 接口 | 响应 DTO | 新增内容 | 新增 SQL | 改动位置 |
|---|---|---|---|---|---|
| 复习 | `GET /api/fsrs/due` | `FsrsCardResponse` | 平铺 `Integer epoch` | 0 | DTO 加字段 |
| 查词 | `GET /api/word/{wordId}` | `WordDetailResponse` | 嵌套 `FsrsCardResponse fsrsCard`（未学为 `null`） | **+1** | `WordController.getWordDetail` 补查询 |
| 词单 / 分组 | `GET /api/wordlist/all-content`、`GET /api/wordlist/group-content` | `WordListWordResponse` / `GroupWordResponse` | 平铺 `Integer epoch`（未学为 `0`） | **0**（复用已有批量查询） | `WordListService` 第 577、602 行附近 |

**关键实现约束**：

1. **`FsrsCardResponse` 同时用于三个接口**，加 `epoch` 字段一次到位。`FsrsCardResponse.from(card)` 里对 `epoch` 为 `null` 时输出 `0`，避免旧数据出现 `null`。
2. **词单接口禁止 N+1**。现有代码用 `fsrsCardMapper.selectExistingWordIds(userId, wordIds)` 只取 `word_id` 集合（`WordListService.java:577`、`:602`）。要拿 `epoch` 必须换成 `selectByUserAndWordIds(userId, wordIds)`（**该方法已存在**，返回 `List<FsrsCard>`），再转 `Map<Long, Integer> wordId → epoch`。SQL 数量不变。
3. **`learningStatus` 的判定不要动**。它现在是"`fsrs_card` 有记录即 learning"，改为取完整卡片后仍用"map 中存在该 wordId"判断，语义保持一致。
4. **查词接口要处理未登录**。`GET /api/word/{wordId}` 当前不读 `UserContext`；补查询前必须先 `UserContext.getCurrentUserId()` 判空，未登录时 `fsrsCard = null`，不能抛异常。
5. **三个入口的 `epoch` 语义必须一致**：都是"库中当前轮次"，未学为 `0`，不是"下次轮次"。

### 2.2 前端：三个入口如何持有 `epoch`

| 入口 | 页面 | 数据来源 | 重置时回传 |
|---|---|---|---|
| 复习 | `pages/review-list` | `getDueCards()` → 队列项的 `fsrsCard.epoch` | `expectedEpoch = item.fsrsCard.epoch` |
| 查词 | `pages/word-detail` | `wordApi.getDetail()` → `data.fsrsCard.epoch` | `expectedEpoch = detail.fsrsCard ? detail.fsrsCard.epoch : 0` |
| 词单 | `pages/wordlist-detail`、`pages/wordlist-group-words` | `getAllContent()` / `getGroupWords()` → 词项的 `epoch` | `expectedEpoch = item.epoch \|\| 0` |

> 查词页与词单页的卡片**可能不存在**（该词未加入学习）。此时入口仍应展示（AC-12 要求"卡片不存在时返回 3001 而非不展示"），`expectedEpoch` 传 `0`；后端按"卡片不存在"返回 3001，前端提示「该词已不在学习列表中」。

> 影响面已跨前后端。前端涉及 2 个页面 + 2 个 utils 文件；其中 `dataSource.js` 的 `submitReview` 签名变更需要回归所有调用点（当前仅 `pages/review-list` 一处调用）。

### 2.5 历史缺口校正（P0 前置步骤，2026-11-06 用户选定 ②）

**目标**：把 3 张卡的 `reps` 校正为等于其日志条数，使 §7 的核对 SQL ①③⑤ 全部归零。

**执行顺序**（必须按此顺序，且每步验证后再做下一步）：

| 步骤 | 动作 | 失败时 |
|---|---|---|
| 1 | 备份 `fsrs_card` 全表：`CREATE TABLE fsrs_card_bak_20261106 AS SELECT * FROM fsrs_card;` 并核对行数一致（当前 2387） | 停止，不得继续 |
| 2 | **记录原值**：`SELECT user_id, word_id, reps, lapses, due, last_review FROM fsrs_card WHERE user_id=2086459012309630976 AND word_id IN (2088840389390811136, 2086421698481676288, 2086434279682405678);`（见下方基线 SQL） | 停止 |
| 3 | 执行校正（见下方 SQL） | 停止 |
| 4 | 验证 §7 的 SQL ①②③⑤ 全部 0 行 / `delta=0` | 用步骤 1 备份回滚 |
| 5 | 验证 `SUM(reps)` 与日志总数相等（应为 11278） | 用步骤 1 备份回滚 |

**校正 SQL**（显式定位，不用 `reps <> 日志数` 动态匹配——那会在将来再次出现不一致时误伤新数据）：

```sql
-- 校正前基线（应为：7 / 7 / 9）
SELECT c.word_id, c.reps,
       (SELECT COUNT(*) FROM fsrs_review_log l
         WHERE l.user_id=c.user_id AND l.word_id=c.word_id) AS log_n
FROM fsrs_card c
WHERE c.user_id = 2086459012309630976
  AND c.word_id IN (2088840389390811136, 2086421698481676288, 2086434279682405678);

-- 校正：reps ← 日志条数
UPDATE fsrs_card SET reps = 6
 WHERE user_id = 2086459012309630976
   AND word_id IN (2088840389390811136, 2086421698481676288);

UPDATE fsrs_card SET reps = 8
 WHERE user_id = 2086459012309630976
   AND word_id = 2086434279682405678;
```

**校正后的副作用（已在 `proposal.md` §1.4 记录，用户知悉）**：

1. 这三张卡的"学过 N 次"计数各减 1（7/7/9 → 6/6/8）。
2. **下次复习间隔会变**：`reps` 是 ts-fsrs fuzz 种子的组成部分（`utils/fsrs/index.js:320-324` 的 `DefaultInitSeedStrategy` 用 `time_reps_difficulty*stability` 拼 seed），而 `utils/fsrs/fsrs.js:34` 显式 `enable_fuzz: true`。`reps` 变了 → seed 变了 → fuzz 因子的取值变了 → 下一次的间隔在原区间内重新取一个值（±5%~15%）。这三张卡当前 `scheduled_days` 为 128 / 109 / 44 天，故影响幅度约为数天到十数天。
3. 校正**不影响**：卡片的 `state` / `stability` / `difficulty` / `due` / `last_review` / `lapses`；不影响学习统计（`LearningStatsService` 不读 `reps`，已代码核查）。
4. 校正**不可自动回滚**：无审计列存原值，回滚依赖步骤 1 的全表备份。

**为什么不做"补写缺失日志"**：日志是训练数据的唯一事实来源，补写等于伪造样本，会让 FSRS 参数拟合学到不存在的复习事件。这条在任何选项下都否决。

## 3. 时序

### 3.1 复习提交（P0 后的写入）

```text
前端 scheduleNext() → { card, log }
  ※ 在进入 handleScore 时先生成一次 clientRequestId，重试沿用同一个（AC-19）
  → POST /api/fsrs/review  { wordId, clientRequestId, card, log, ... }
  → 后端开启事务
      ① SELECT ... FROM fsrs_card WHERE user_id=? AND word_id=? FOR UPDATE
      ② reps_before = card.reps          ← 必须取 DB 当前值，不能取请求体里的值
      ③ INSERT fsrs_review_log (..., epoch = card.epoch, card_reps_before = reps_before)
      ④ UPDATE fsrs_card SET ... WHERE ...
      ⑤ 若 ③ 撞 uk_traj → 回滚，返回 duplicated=true
  → 前端按 duplicated 分支跳过（已有实现）
```

**关键**：`card_reps_before` 必须由后端在读锁内取，不能让前端上报——前端上报值可伪造，且并发下会重复。

**AC-19 的落点（本次复核新增）**：`clientRequestId` 的生成位置要从 `submitReview()` 内部（`dataSource.js:173`）上移到 `handleScore()` 入口，作为参数传入。否则"超时后用户再点一次"永远是新的 `clientRequestId`，后端 `uk_user_word_reqid` 拦不住，AC-02 也就失去前提。这是本次唯一要动 `dataSource.js` 既有签名的地方。

### 3.2 重置

```text
前端：点「重新学习」→ 二次确认 → await getApp().waitForLogin()
  → POST /api/fsrs/card/reset { wordId, expectedEpoch, clientRequestId }
  → 后端事务：
      ① SELECT * FROM fsrs_card WHERE user_id=? AND word_id=? FOR UPDATE
      ② 不存在 → 3001
      ③ card.epoch <> expectedEpoch → 返回「已重置」，不重复加轮次（AC-13）
      ④ INSERT fsrs_card_reset (epoch = card.epoch+1, prev_* = 当前值)
      ⑤ UPDATE fsrs_card
           SET state=0, stability=0, difficulty=0, due=now,
               last_review=NULL, elapsed_days=0, scheduled_days=0,
               learning_steps=0, epoch=epoch+1, reset_count=reset_count+1,
               last_reset_at=now
           WHERE ... AND epoch = expectedEpoch
         影响行数=0 → 回滚，返回「已重置」
      COMMIT
  → 前端：从本地队列移除该 card、刷新角标、toast「已重置，将从头开始」
```

前端两处入口的分工：

| 页面 | 覆盖入口 | 重置成功后的额外动作 |
|------|----------|---------------------|
| `pages/word-detail/word-detail` | 查词结果、词单详情、词单分组 | 无（页面本身不持队列），只需关闭菜单与弹窗 |
| `pages/review-list/review-list` | 复习页答案阶段 | 从 `this.queue` 移除该 `wordId`、重算进度、刷新 tabBar 角标；若队列因此清空，走完现有的"今日详情"路径 |

`reps/lapses` 不在 UPDATE 列表里——这是"保留"的实现方式（用户 2026-10-30 决策）。

### 3.3 关键状态

| 字段 | 类型 | 初始值 | 含义 |
|------|------|--------|------|
| `fsrs_card.epoch` | INT | 0 | 当前学习轮次 |
| `fsrs_card.reset_count` | INT | 0 | 累计重置次数 |
| `fsrs_review_log.epoch` | INT | 0 | 该条日志所属轮次（写入时快照） |
| `fsrs_review_log.card_reps_before` | INT | 0 | 复习前累计复习次数 |
| `fsrs_card_reset.prev_state/prev_due/prev_reps/prev_lapses` | — | — | 最小审计快照（不做恢复） |

## 4. 接口约定

| 接口 | 方法 | 入参 | 出参（用到的字段） | 错误码 |
|------|------|------|-------------------|--------|
| `/api/fsrs/card/reset` | POST | `wordId`(string)、`expectedEpoch`(int)、`clientRequestId`(string) | `{ epoch, resetAt, card: FsrsCardResponse }` | `3001` 单词/卡片不存在；冲突码待后端分配（语义「已重置 / 轮次已变化」） |

约定：

- `wordId` 全程字符串，不得 `Number()` 强转。
- `card` 复用现有 `FsrsCardResponse`（camelCase 平铺），前端在 `dataSource.js` 内转 snake_case，页面不直接拼字段。
- 错误提示统一由 `utils/request.js` 给一次，页面不重复 toast。
- 重置**不得**复用 `POST /api/fsrs/review`：该接口 `rating` 约束 1~4，而重置语义是 `Rating.Manual = 0`。

## 5. 边界与降级

| 情况 | 处理方式 | 用户看到什么 |
|------|----------|-------------|
| 重置接口超时 | 客户端不做本地乐观更新，保持原状态 | 提示失败，入口可重试 |
| 卡片不存在（3001） | 不写事件、不建卡 | 提示「该词已不在学习列表中」 |
| 并发重置 / 轮次已变 | 乐观锁失败，返回「已重置」 | 提示「已重置」，不重复加轮次 |
| 旧后端无重置接口 | 能力探测缺失 → 两处菜单都不渲染该项 | 无入口，复习流程不变 |
| 该词从未加入学习（无卡片） | 入口照常展示，点击后后端返回 3001 | 提示「该词已不在学习列表中」，卡片不存在时后端不建卡 |
| 重置后当天队列已空 | 该卡 `due=now` 会重新进入队列 | 若停在完成页则跳回复习页 |
| 重复点击确认按钮 | 前端提交锁 + 后端乐观锁双保险 | 只成功一次 |

## 6. 兼容与回滚

- **老版本小程序**：不调用新接口，后端新增列有默认值，`review` 请求体不变 → 完全兼容。
- **发布顺序**：后端 P0 必须先于 P1；前端 P2 在 P1 上线后再发。P0 可独立上线，前端零改动。
- **回滚**：
  - P1 回滚只需下线接口，新增列/表保留（不影响旧逻辑）。
  - P0 的唯一键回滚需先删除 `uk_traj`，否则重复提交行为改变；**不要**回滚 `card_reps_before`（会影响已写入行）。
  - 已归档的 4 条重复日志留在 `fsrs_review_log_dup`，不回填。

## 7. 验证手段

| 验证项 | 手段 | 通过标准 |
|--------|------|----------|
| 轨迹序号 | 连点两次评分 | `fsrs_review_log` 只多 1 条；第二次返回 duplicated |
| 序号连续 | 体检 SQL（见下） | 无空洞、无重复 |
| 重置原子性 | 构造事件插入失败（如临时加约束） | 卡片状态不变、无新日志 |
| 并发重置 | 两个请求带同一 `expectedEpoch` | 一个 200，一个「已重置」；`epoch` 只加 1 |
| 计数保留 | 重置前后查 `reps/lapses` | 数值不变 |
| 历史不丢 | 重置前后 COUNT 日志 | 条数不变 |
| 训练导出 | 抽样一张被重置的卡 | 输出两段独立轨迹，序号各自连续 |
| 旧后端兼容 | 关闭新接口 | **按新约束**：不允许"旧后端 + 新前端"，二者必须同发布窗口；若强行组合，入口可见但接口 404 |

```sql
-- ① reps 必须等于该卡全部日志数（保留 reps 的前提下；epoch 不参与，reps 跨轮次累加）
--    校验闸门：执行 §5 的校正步骤后，本查询必须返回 0 行。
--    校正前实测返回 3 行（见 proposal.md §1.4）。
SELECT c.user_id, c.word_id, c.reps, COUNT(l.id) logs
FROM fsrs_card c LEFT JOIN fsrs_review_log l
  ON l.user_id=c.user_id AND l.word_id=c.word_id
GROUP BY c.user_id, c.word_id, c.reps HAVING c.reps <> COUNT(l.id);

-- ② 同一轨迹内序号无重复（唯一键的直接验证）
SELECT user_id, word_id, card_reps_before, COUNT(*) n
FROM fsrs_review_log
GROUP BY user_id, word_id, card_reps_before HAVING n > 1;

-- ③ 同一轨迹内序号连续（起点可以不是 0，因为 reps 保留）
--    校正前对 3 例历史缺口返回非空；校正 reps 后应返回 0 行。
SELECT user_id, word_id, epoch
FROM fsrs_review_log GROUP BY user_id, word_id, epoch
HAVING MAX(card_reps_before) - MIN(card_reps_before) + 1 <> COUNT(*);

-- ④ 卡片轮次与事件表一致
SELECT c.user_id, c.word_id, c.epoch, COALESCE(MAX(r.epoch),0) ev
FROM fsrs_card c LEFT JOIN fsrs_card_reset r
  ON r.user_id=c.user_id AND r.word_id=c.word_id
GROUP BY c.user_id, c.word_id, c.epoch HAVING c.epoch <> COALESCE(MAX(r.epoch),0);

-- ⑤ 全库账目：SUM(reps) 必须等于日志总条数
--    校正前 11281 vs 11278（差 3）；校正后应相等。
SELECT SUM(reps) AS sum_reps,
       (SELECT COUNT(*) FROM fsrs_review_log) AS total_logs,
       (SELECT COUNT(*) FROM fsrs_review_log) - SUM(reps) AS delta
FROM fsrs_card;
```

> **①②③⑤ 都是上线闸门，必须全部返回 0 行（⑤ 要求 `delta = 0`）**。这是用户 2026-11-06 选定"校正 `reps`"后新增的要求——选择 ② 的意义就在于让这些核对全部归零，而不是带着例外清单上线。
>
> **② 与 ③ 的区别**：② 是"不重复"（`uk_traj` 直接保证）；③ 是"不跳过"（唯一键**不**保证，需靠校正历史数据 + 写入逻辑正确才能成立）。`spec.md` 原先把两件事写在一条 AC 里、且只要求 ② 成立，是本次复核修正的缺口。

## 8. 备选方案与否决理由

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A：日志加 `epoch` + `card_reps_before`，唯一键含两者 | 语义最直白 | `reps` 保留后 `card_reps_before` 已全局唯一，`epoch` 进键属于冗余 | ❌ |
| B：唯一键只含 `card_reps_before`（采用） | 索引更小，判重与"第几次复习"完全同义 | 一旦将来改成清零 `reps` 就要重建索引 | ✅（当前决策下最优） |
| C：**只**用 `client_request_id` 做判重（现状） | 零改动 | 实测已漏：ID 在 `submitReview()` 内部生成，每次重试都是新值 | ❌ |
| C′：`uk_traj` + **重试复用** `client_request_id` 双保险（本次采纳，AC-19） | 两道独立防线：`uk_traj` 挡数据层重复，复用 ID 挡"重试被当成新动作" | 需改 `submitReview()` 既有签名，回归调用点 | ✅ 与 B 并存 |
| D：重置复用 `review` 接口传 `rating=0` | 不新增接口 | 违反后端 1~4 约束，且无法原子更新事件表 | ❌ |
| E：重置后 `due=明天 0 点` | 不挤占当天 | 用户确认要 `now`；且会让用户"点了看不到反应" | ❌ |
| F：把历史缺口 3 例的 `reps` 校正为日志数 | 所有核对 SQL 归零，账目干净，`AC-03` 可要求绝对连续 | 篡改用户可见的累计复习次数（各减 1）；且因 `reps` 参与 fuzz 种子，三张卡下次间隔会重新取值 | ✅ **采用**（用户 2026-11-06 选定 ②） |
| G：给历史缺口补写缺失日志 | 序号看起来连续 | 伪造训练数据，污染 FSRS 参数拟合 | ❌ 任何选项下否决 |
| H：登记为已知例外，不修补 | 不动用户数据 | `AC-03` 永远带"例外清单"口子，每次核对都要人工比对；`SUM(reps)` 与日志数永久差 3 | ❌ 用户未选 |

## 9. 宪法对照

- [x] C-01 请求未绕过 `request.js`（P2 复用现有封装）
- [x] C-02 未改动环境判定
- [x] C-03 ID 保持字符串（`wordId` 全程 string）
- [x] C-04 FSRS 字段转换只在 `utils/fsrs/dataSource.js`
- [x] C-05 需要 token 的请求已等待登录
- [x] C-06 每个 catch 都有出口
- [x] C-07 无新增页面，无需同步 `app.json`
- [x] C-08 未引入依赖
- [x] C-12 未超出 proposal 的非目标
