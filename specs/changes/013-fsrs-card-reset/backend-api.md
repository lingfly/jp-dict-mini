# 后端对接文档：FSRS 卡片重新学习（重置）与复习日志轨迹

> 对应需求 `#013`。前端侧见同目录 `proposal.md` / `spec.md` / `design.md`。
> **本文是前后端之间的接口契约。状态：draft（未批准），批准后后端按 P0 → P1 实施。**
> 影响库：`jp-dict`（MySQL 8.4.10）。
>
> **数据规模（2026-11-06 复验，取代初版的 856 / 1374 行）**：`fsrs_card` 2387 行、`fsrs_review_log` 11278 行、`fsrs_version` 全为 `5.4.1`。
> **重复行复验结果：契约步骤 3 的判定条件命中 0 行**（初版记录为 4 行，已不成立）。因此 P0 的"归档"步骤在本库上是**空操作**，改为"确认 0 行，非 0 则停止"。
> **另存在 3 例 `reps` 比日志多 1 的历史缺口**（不是重复行，是缺日志），本契约**不负责修补**，详见 `proposal.md` §1.4 与 `verify.md` §二。

## 1. 目的与范围

| 阶段 | 后端要做的事 | 前端是否要配合 |
|------|-------------|---------------|
| **P0** | 日志表补 `epoch`、`card_reps_before`，回填历史，**确认重复行为 0**（非 0 则停止），建唯一键；修正 `fsrs_version` 默认值 | 是（AC-19：`clientRequestId` 改由调用方生成并跨重试复用，见 §4.3） |
| **P1** | `fsrs_card` 补 `epoch/reset_count/last_reset_at`；新建 `fsrs_card_reset`；新增重置接口；`due` / `review` 响应带 `epoch` | 是（P2 前端改造） |

**不在本文范围**：前端界面、文案、队列处理（见 `spec.md` 界面契约）；`learning_steps` / `relearning_steps` 调整；FSRS 参数拟合。

## 2. 概念与字段

| 字段 | 含义 | 谁写 | 说明 |
|------|------|------|------|
| `fsrs_card.epoch` | 该卡片当前学习轮次，从 0 开始 | 后端 | 仅重置时 +1；复习流程不得改动 |
| `fsrs_card.reset_count` | 累计重置次数 | 后端 | 等于 `epoch`，单列冗余便于查询与限流 |
| `fsrs_card.last_reset_at` | 最近一次重置时间（Unix 毫秒） | 后端 | 未重置过为 `NULL` |
| `fsrs_review_log.epoch` | 该条日志所属轮次 | 后端 | 写入时取卡片当前 `epoch` |
| `fsrs_review_log.card_reps_before` | **本次复习前**卡片的累计复习次数 | 后端 | 轨迹序号，同时是幂等键 |
| `fsrs_card_reset.prev_*` | 重置前最小快照 | 后端 | 只用于审计，**不做恢复**（用户明确不做撤销） |

**关键前提（决定了唯一键设计）**：

- 重置**不清零** `reps/lapses`（用户 2026-10-30 决策）。因此同一张卡的 `reps` 单调递增，`card_reps_before` 天然全局唯一。
- 唯一键**不含 `epoch`**：`UNIQUE (user_id, word_id, card_reps_before)`。
- `epoch` 只用于训练时切分轨迹，不承担任何判重职责。

**`card_reps_before` 的取值口径**（务必与 ts-fsrs 对齐）：

| 第几次复习 | 复习前 `card.reps` | 写入的 `card_reps_before` |
|-----------|-------------------|--------------------------|
| 第 1 次 | 0 | 0 |
| 第 2 次 | 1 | 1 |
| 第 N 次 | N-1 | N-1 |

> ts-fsrs 的 `reps` 在每次调度开始时 `+1`，所以第 N 次复习前库里就是 N-1。历史数据回填用 `ROW_NUMBER() - 1`，与此完全一致。

## 3. 数据库变更

### 3.1 P0 迁移（严格按顺序执行，缺一步都可能建键失败）

```sql
-- 步骤 0：备份（必须，先做）
CREATE TABLE fsrs_review_log_bak_20261030 AS SELECT * FROM fsrs_review_log;
CREATE TABLE fsrs_card_bak_20261030       AS SELECT * FROM fsrs_card;

-- 步骤 0.5：【2026-11-06 新增，用户选定 ②】校正 3 例历史缺口的 reps
--   背景：这 3 张卡 reps 比日志多 1（见 proposal.md §1.4），不校正的话步骤 6 的核对永远返回 3 行。
--   显式定位，不用 "reps <> 日志数" 动态匹配——那会在将来再次不一致时误伤新数据。
--   代价：这三张卡界面计数各减 1；且 reps 参与 fuzz 种子，下次间隔会重新取值（详见 design.md §2.5）。
UPDATE fsrs_card SET reps = 6
 WHERE user_id = 2086459012309630976
   AND word_id IN (2088840389390811136, 2086421698481676288);
UPDATE fsrs_card SET reps = 8
 WHERE user_id = 2086459012309630976
   AND word_id = 2086434279682405678;
-- 验证：SUM(reps) 应等于 (SELECT COUNT(*) FROM fsrs_review_log)，即 11281 → 11278

-- 步骤 1：加列（此时不要建唯一键）
ALTER TABLE fsrs_review_log
  ADD COLUMN epoch            INT NOT NULL DEFAULT 0 COMMENT '所属学习轮次' AFTER state,
  ADD COLUMN card_reps_before INT NOT NULL DEFAULT 0 COMMENT '复习前卡片累计复习次数' AFTER learning_steps;

-- 步骤 2：回填轨迹序号（按 review 升序，从 0 开始）
-- 必须借临时表中转：MySQL 不允许 UPDATE 时在派生表里再读同一张表（ERROR 1093）
CREATE TEMPORARY TABLE tmp_traj_seq (
  id BIGINT NOT NULL PRIMARY KEY,
  rn INT NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_traj_seq (id, rn)
SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, word_id ORDER BY review) - 1
FROM fsrs_review_log;

UPDATE fsrs_review_log l
  JOIN tmp_traj_seq t ON t.id = l.id
   SET l.card_reps_before = t.rn;

DROP TEMPORARY TABLE tmp_traj_seq;

-- 步骤 3：定位重复行
--   2026-10-30 预期 4 条；2026-11-06 在扩容后的库上复验为 0 条。
--   闸门：无论预期多少，都必须先跑本查询并人工确认结果，再执行步骤 4。
--   若返回 0 行 → 跳过步骤 4，直接做步骤 5（重排仍要做，保证序号无洞）。
--   若返回非 0 → 逐条确认是否为真重复，把清单存档后再继续。
SELECT id, user_id, word_id, rating, state, review, stability, difficulty
FROM (
  SELECT id, user_id, word_id, review, rating, state, elapsed_days, stability, difficulty, scheduled_days,
         LAG(review)         OVER w AS pr,
         LAG(rating)         OVER w AS prt,
         LAG(state)          OVER w AS pst,
         LAG(elapsed_days)   OVER w AS pel,
         LAG(stability)      OVER w AS pstb,
         LAG(difficulty)     OVER w AS pdf,
         LAG(scheduled_days) OVER w AS psd
  FROM fsrs_review_log
  WINDOW w AS (PARTITION BY user_id, word_id ORDER BY review)
) t
WHERE pr IS NOT NULL
  AND review - pr < 600000            -- 10 分钟内
  AND rating = prt AND state = pst AND elapsed_days = pel
  AND stability = pstb AND difficulty = pdf AND scheduled_days = psd;

-- 步骤 4：把重复行归档（保留每组最早一条），不物理丢失
CREATE TABLE IF NOT EXISTS fsrs_review_log_dup LIKE fsrs_review_log;
INSERT INTO fsrs_review_log_dup
SELECT * FROM fsrs_review_log
WHERE id IN ( /* 步骤 3 查出的 id 集合 */ );
DELETE FROM fsrs_review_log WHERE id IN ( /* 同上 */ );

-- 步骤 5：重排序号（删除后必须重排，否则序号有洞，违反 AC-03）
CREATE TEMPORARY TABLE tmp_traj_seq2 (
  id BIGINT NOT NULL PRIMARY KEY,
  rn INT NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_traj_seq2 (id, rn)
SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, word_id ORDER BY review) - 1
FROM fsrs_review_log;

UPDATE fsrs_review_log l
  JOIN tmp_traj_seq2 t ON t.id = l.id
   SET l.card_reps_before = t.rn;

DROP TEMPORARY TABLE tmp_traj_seq2;

-- 步骤 6：核对（预期 0 行）
SELECT c.user_id, c.word_id, c.reps, COUNT(l.id) AS logs
FROM fsrs_card c
LEFT JOIN fsrs_review_log l
  ON l.user_id = c.user_id AND l.word_id = c.word_id
GROUP BY c.user_id, c.word_id, c.reps
HAVING c.reps <> COUNT(l.id);

-- 步骤 7：建唯一键（必须在步骤 4/5 之后）
ALTER TABLE fsrs_review_log
  ADD UNIQUE KEY uk_traj (user_id, word_id, card_reps_before);

-- 步骤 8：版本默认值对齐实际写入值
ALTER TABLE fsrs_review_log
  ALTER COLUMN fsrs_version SET DEFAULT '5.4.1';
```

> 步骤 3 的判定条件必须是**六个字段全同 + 10 分钟内**。只用"同 rating + 同 state + 短时间内"会误伤正常的短间隔复习（实测命中 81 条，全部是合法的 Learning/Relearning 连续评分）。

### 3.2 P1 重置结构

```sql
ALTER TABLE fsrs_card
  ADD COLUMN epoch         INT    NOT NULL DEFAULT 0  COMMENT '当前学习轮次，0=从未重置' AFTER learning_steps,
  ADD COLUMN reset_count   INT    NOT NULL DEFAULT 0  COMMENT '累计重置次数',
  ADD COLUMN last_reset_at BIGINT DEFAULT NULL        COMMENT '最近重置时间（Unix毫秒）';

CREATE TABLE fsrs_card_reset (
  id                 BIGINT      NOT NULL COMMENT '雪花ID，与 fsrs_card 同一发号器',
  user_id            BIGINT      NOT NULL,
  word_id            BIGINT      NOT NULL,
  epoch              INT         NOT NULL COMMENT '重置后的轮次 = 重置前 + 1',
  reset_at           BIGINT      NOT NULL COMMENT 'Unix毫秒',
  reset_source       VARCHAR(16) NOT NULL DEFAULT 'user' COMMENT 'user/admin/system',
  prev_state         TINYINT     NOT NULL,
  prev_due           BIGINT      NOT NULL,
  prev_reps          INT         NOT NULL DEFAULT 0,
  prev_lapses        INT         NOT NULL DEFAULT 0,
  client_request_id  VARCHAR(64) DEFAULT NULL,
  created_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_word_epoch (user_id, word_id, epoch),
  KEY idx_user_reset_at (user_id, reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='FSRS 卡片重置事件表';
```

## 3.3 前置变更：`clientRequestId` 的生成时机（AC-19，2026-11-06 新增）

**问题**：当前前端在 `submitReview()` **函数体内**调用 `genClientRequestId()`（`utils/fsrs/dataSource.js:173`），每次调用都是新值。

后果：

| 场景 | 后端看到 | 实际发生 |
|---|---|---|
| 网络超时，用户再点一次评分 | 两个不同的 `client_request_id` | 写入两条日志；卡片 `reps` 由客户端快照携带，跳过一格 |
| 请求在网关层被重放（同一请求对象） | 同一个 `client_request_id` | `uk_user_word_reqid` 生效，正确拦截 |

**后端要求**（需前端在 P0 一并改，见 `design.md` §1 第 2 条）：

- `clientRequestId` 由**调用方**在一次评分动作开始时生成一次，失败重试**复用同一个值**。
- 后端无需改动：现有 `selectByRequestId` + `uk_user_word_reqid` 已经能正确处理。
- 这是 `uk_traj` 之外的**第二道防线**：`uk_traj` 拦"数据层重复"，复用 ID 拦"重试被当成新动作"。只有前者时，"跳格"不会撞键（详见 `proposal.md` §1.4 的实证）。
## 4. 接口

### 4.0 `expectedEpoch` 从哪来（AC-20，2026-11-06 补入）

重置接口的 `expectedEpoch` **必填**，三个入口的数据来源不同。**只做 4.1 是不够的**——查词页与词单页根本不调用 `/api/fsrs/*`，拿不到轮次。

| 入口 | 接口 | 响应 DTO | 新增内容 | 新增 SQL |
|---|---|---|---|---|
| 复习 | `GET /api/fsrs/due` | `FsrsCardResponse` | 平铺 `Integer epoch` | 0 |
| 查词 | `GET /api/word/{wordId}` | `WordDetailResponse` | 嵌套 `FsrsCardResponse fsrsCard`（未学为 `null`） | +1 |
| 词单 / 分组 | `GET /api/wordlist/all-content`、`GET /api/wordlist/group-content` | `WordListWordResponse` / `GroupWordResponse` | 平铺 `Integer epoch`（未学为 `0`） | 0（复用批量查询） |

**实现要求**：

1. `FsrsCardResponse` 加 `Integer epoch`，`from()` 中 `null` 输出 `0`。三个接口共用此 DTO。
2. `WordDetailResponse` 加 `private FsrsCardResponse fsrsCard;`（**嵌套**，不平铺）。未登录或该词未加入学习时为 `null`。
3. `WordListWordResponse` 与 `GroupWordResponse` 各加 `private Integer epoch;`（**平铺**，与既有 `learningStatus` 同风格），未学为 `0`。
4. **词单接口改批量查询**：`WordListService` 现用 `fsrsCardMapper.selectExistingWordIds()`（只回 `word_id`，见 `:577`、`:602`）。改为 `selectByUserAndWordIds()`（**已存在**，返回 `List<FsrsCard>`）→ `Map<Long, FsrsCard>` → 取 `epoch`。**SQL 条数不得增加**，禁止逐词查询。
5. **查词接口补 `UserContext` 判空**：`GET /api/word/{wordId}` 当前不读登录态，补查询前必须判空，未登录时 `fsrsCard = null`，不得抛异常。
6. `epoch` 语义三处一致：**库中当前轮次**，从未重置为 `0`（不是"下次轮次"）。

### 4.1 `GET /api/fsrs/due`（现有接口，仅加字段）

- `data` 数组每项平铺的 `FsrsCardResponse` **新增** `epoch`（int）。
- 其余字段与语义不变，`endTs` 参数不变。
- **必须加**：前端做乐观锁需要拿到当前 `epoch`；缺这个字段，重置接口无法安全调用。

### 4.1b `GET /api/word/{wordId}`（现有接口，新增嵌套字段）

- `data` 新增 `fsrsCard`（对象或 `null`），结构复用 `FsrsCardResponse`（含 `epoch`）。
- 未登录、或该词未加入学习 → `fsrsCard = null`。
- **必须加**：查词页的「重新学习」入口需要 `epoch`；这是该入口唯一的来源。

### 4.1c `GET /api/wordlist/all-content`、`GET /api/wordlist/group-content`（现有接口，新增平铺字段）

- `data.words[]` 每项新增 `epoch`（int，未学为 `0`）。
- 与既有 `learningStatus` 并列，语义同为"当前用户对该词的学习状态"。
- **必须加**：词单详情页与分组页的「重新学习」入口需要 `epoch`。
- **性能**：这两个接口一次返回整词单/整分组的单词（可达数百项），必须用 `selectByUserAndWordIds` 一次批量取回，**不得**逐词查询。

### 4.2 `POST /api/fsrs/review`（现有接口，写入规则变更）

请求体结构不变。后端写入时：

| 字段 | 取值规则 |
|------|----------|
| `fsrs_review_log.epoch` | **DB 中卡片的当前 `epoch`**，不要用请求体 |
| `fsrs_review_log.card_reps_before` | **行锁内读到的 `fsrs_card.reps`**，不要用请求体 `card.reps` |
| `fsrs_review_log.stability/difficulty` 等 | 保持现状（前端上报值） |

撞 `uk_traj` 时：

- **不要**抛 500；
- 回滚本次写入，返回 `code=200`、`data.duplicated=true`、`data.card` = 库中当前卡片（含最新 `epoch`）；
- 前端已有 `duplicated` 分支，无需改前端。

### 4.3 `POST /api/fsrs/card/reset`（新增）

**请求**

```http
POST /api/fsrs/card/reset
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "wordId": "2086433495985091063",
  "expectedEpoch": 0,
  "clientRequestId": "1792654901938-a1b2c3d4"
}
```

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| `wordId` | string | 是 | 纯数字字符串；**禁止** JSON number（雪花 ID 精度） |
| `expectedEpoch` | int | 是 | `>= 0`；来自 `GET /api/fsrs/due` 返回的 `epoch` |
| `clientRequestId` | string | 否 | 仅用于链路追踪与重试日志；**不承担判重** |

**成功响应（HTTP 200）**

```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "epoch": 1,
    "resetAt": 1792654901938,
    "card": {
      "wordId": "2086433495985091063",
      "state": 0,
      "stability": 0,
      "difficulty": 0,
      "due": 1792654901938,
      "lastReview": null,
      "elapsedDays": 0,
      "scheduledDays": 0,
      "reps": 12,
      "lapses": 2,
      "learningSteps": 0,
      "epoch": 1
    }
  }
}
```

- `due` / `resetAt` / `lastReview` 一律 Unix 毫秒。
- `reps` / `lapses` **原值返回**，不得出现 0（除非重置前就是 0）。
- `card.wordId` 为字符串。

**失败响应**

| 场景 | HTTP | code | message 建议 |
|------|------|------|-------------|
| 未登录 / token 失效 | 401 | — | 由统一鉴权返回 |
| `wordId` 缺失或非数字字符串 | 200 | 2005 | 参数不合法：wordId |
| `expectedEpoch` 缺失 / 为负 / 非整数 | 200 | 2005 | 参数不合法：expectedEpoch |
| 卡片不存在（该词未加入学习） | 200 | 3001 | 该词不在学习列表中 |
| `expectedEpoch` 与库中不一致（已被重置 / 跨设备） | 200 | **3008** | 已重置或学习状态已变化 |

> `3008` 为本需求建议的业务码；若与现有枚举冲突，由后端分配，但语义必须是"轮次已变化"。成功时 `data.epoch` 返回库中当前轮次，前端据此刷新。

### 4.4 重置事务（伪代码，**必须整体在一个事务内**）

```sql
START TRANSACTION;

-- ① 行锁 + 取当前状态
SELECT id, state, due, reps, lapses, epoch
  FROM fsrs_card
 WHERE user_id = ? AND word_id = ?
 FOR UPDATE;

-- ② 无行：ROLLBACK → 3001（不得创建新卡）
-- ③ epoch <> expectedEpoch：ROLLBACK → 3008，data.epoch = 当前 epoch

-- ④ 写事件（epoch = 当前值 + 1）
INSERT INTO fsrs_card_reset
  (id, user_id, word_id, epoch, reset_at, reset_source,
   prev_state, prev_due, prev_reps, prev_lapses, client_request_id)
VALUES (?, ?, ?, ? + 1, ?, 'user', ?, ?, ?, ?, ?);

-- ⑤ 改卡（注意：SET 列表里没有 reps / lapses）
UPDATE fsrs_card
   SET state          = 0,
       stability      = 0,
       difficulty     = 0,
       retrievability = NULL,
       due            = ?,          -- now，Unix 毫秒
       last_review    = NULL,
       elapsed_days   = 0,
       scheduled_days = 0,
       learning_steps = 0,
       epoch          = epoch + 1,
       reset_count    = reset_count + 1,
       last_reset_at  = ?
 WHERE user_id = ? AND word_id = ? AND epoch = ?;   -- 乐观锁

-- ⑥ 影响行数 = 0：ROLLBACK → 3008

COMMIT;
```

**不要**在重置事务里重排其他卡片、不要调用 `due` 重算、不要写 `fsrs_review_log`（重置不是一次复习）。

## 5. 必须严格遵守的事项

按严重度排序，违反任一条都会造成数据不可逆损坏。

| 编号 | 规则 | 违反后果 |
|------|------|----------|
| **R01** | 重置**不得**复用 `POST /api/fsrs/review`。该接口 `rating` 约束 1~4，重置语义是 `Manual=0` | 日志里出现非法评分，训练直接崩 |
| **R02** | 重置的"改卡 + 写事件"必须在**同一事务**，任一失败整体回滚 | 出现 epoch 已加但卡没清（或反之）的中间态 |
| **R03** | `card_reps_before` 必须在行锁内取 **DB 的 `fsrs_card.reps`**，禁止用请求体 `card.reps` | 跨设备旧快照会撞键或漏判重 |
| **R04** | 重置**不得清零** `reps` / `lapses` | 与用户决策冲突；且 `card_reps_before` 不再全局唯一，唯一键设计失效 |
| **R05** | `fsrs_review_log` 是 append-only。除迁移期归档重复行（2026-11-06 复验为 0 行）外，**不得** UPDATE / DELETE 任何日志 | 训练历史不可信，且无法审计 |
| **R06** | `fsrs_card.epoch` **只允许**在重置事务里 +1；复习流程不得读写或修改它 | 轨迹切分错乱 |
| **R07** | 日志的 `epoch` / `card_reps_before` 必须与卡片**当时**状态一致，且同一次复习只能落一条 | 重复评分污染训练 |
| **R08** | 所有时间戳统一 **Unix 毫秒**（bigint），禁止秒级混入 | 与 `due` / `review` 现有口径不一致，前端时间判断全错 |
| **R09** | `wordId` 序列化为**字符串**（`ToStringSerializer`），请求与响应都不得出现 number | 雪花 ID 超过 JS 安全整数，精度丢失 |
| **R10** | 错误必须返回业务码 `!= 200`，**禁止** HTTP 200 + 静默失败；前端判据是 `code != 200` | 前端把失败当成功，卡片被移出队列 |
| **R11** | 重置后 `due = now`（毫秒）、`last_review = NULL`、`state/S/D/learning_steps = 0` | 卡片不会在当天重新出现；New 卡带旧复习时间会造成排查误判 |
| **R12** | 迁移顺序固定：加列 → 回填 → 定位重复 → 归档 → **重排** → 建唯一键。禁止先建键 | 建键失败或序号有洞 |
| **R13** | 不得在重置时触发 reschedule、批量改写其他卡片 `due` | 用户会看到无关卡片的到期日变了 |
| **R14** | **三个入口**都必须能拿到 `epoch`：① `GET /api/fsrs/due` 每项带 `epoch`；② `GET /api/word/{wordId}` 带 `fsrsCard.epoch`；③ `GET /api/wordlist/all-content` 与 `/group-content` 的 `words[]` 每项带 `epoch`。`POST /api/fsrs/review` 响应 `data.card` 也须带最新 `epoch` | 前端无法传 `expectedEpoch`，对应入口的重置永远返回 3008；只做 ① 时查词与词单两个入口不可用（AC-20） |
| **R15** | `client_request_id` **不承担**判重职责（当前前端每次都生成新值）。判重以 `uk_traj` 为主；同时**要求前端把 ID 生成上移到一次评分动作的入口、重试复用同一 ID**（AC-19），使 `uk_user_word_reqid` 成为第二道防线 | 只有 `uk_traj` 时，"失败重试导致 reps 跳格"不会撞键，仍会重复记账（2026-11-06 已实测 3 例） |
| **R16** | 训练导出不得跨 `epoch` 拼接、不得用日志的 `elapsed_days` 推算间隔 | 系统性污染 `w11~w14`（见 §7） |
| **R17** | 迁移前必须备份 `fsrs_review_log` 与 `fsrs_card` | 建键失败后无法回退 |

## 6. 训练数据导出规则（数据侧）

```sql
SELECT user_id, word_id, epoch, review, rating,
       TIMESTAMPDIFF(SECOND, FROM_UNIXTIME(prev_review/1000), FROM_UNIXTIME(review/1000)) / 86400.0 AS delta_days
FROM (
  SELECT user_id, word_id, epoch, review, rating,
         COUNT(*)    OVER w AS traj_len,
         LAG(review) OVER w AS prev_review
  FROM fsrs_review_log
  WHERE rating BETWEEN 1 AND 4
    AND fsrs_version = '5.4.1'
  WINDOW w AS (PARTITION BY user_id, word_id, epoch ORDER BY review)
) t
WHERE traj_len >= 2
ORDER BY user_id, word_id, epoch, review;
```

规则：

1. **分组键 = `(user_id, word_id, epoch)`**，跨轮次绝不拼接。
2. `delta_t` 由 `review` 推算，**不要**读 `elapsed_days` 列（重复提交场景恒为 0）。
3. `rating` 只取 1~4；`fsrs_card_reset` 只作事件标记，不作为评分样本。
4. 轨迹长度 < 2 丢弃（当前 64 张卡仅 1 条日志）。
5. 重置前的轨迹**保留并参与训练**，作为独立的"学过又忘"样本。
6. 样本量提醒：现有 11278 条日志 / 1943 张有日志的卡（2026-11-06 复验），比初版评估增长约 8 倍；对 FSRS-6 的 21 维参数是否够用需重新评估，建议先积累再训练。

## 7. 兼容与发布顺序

| 顺序 | 内容 | 说明 |
|------|------|------|
| ① 备份 | 两张表快照 | 必做 |
| ② P0 | 加列、回填、确认重复行 0 条、建键、改默认值 | 后端数据层变更；AC-19 需前端小改动，其余前端零感知 |
| ③ P1 | 加卡片列、建事件表、上线重置接口、`due`/`review` 带 `epoch` | 前端未更新时不调用，无影响 |
| ④ P2 | 前端上线入口 | 依赖 ③ |
| 回滚 | P1 只需下线接口；P0 回滚需先 `DROP INDEX uk_traj`，**不要**回滚已回填的列 | 归档表 `fsrs_review_log_dup` 保留（当前为 0 行），不回填 |

- 旧版小程序：不传 `epoch`、不调重置接口 → 完全兼容。
- 新版前端 + 旧后端：**不允许**。`AC-17` 已取消（前端无能力探测机制），改为"后端 P1 与前端 P2 同发布窗口"约束；若强行组合，入口可见但 `POST /api/fsrs/card/reset` 返回 404。

## 8. 测试用例

| # | 操作 | 期望 |
|---|------|------|
| 1 | 正常复习一次 | 新日志 `epoch=0`、`card_reps_before=复习前 reps`；卡片 `reps+1` |
| 2 | 同一请求重放（同 `clientRequestId`） | 不新增日志；返回 `duplicated=true` |
| 3 | 同一卡连点两次（不同 `clientRequestId`，`reps` 相同） | 只新增 1 条；第二次 `duplicated=true`；`reps` 只 +1 |
| 3b | **超时后重试**（前端复用同一 `clientRequestId`，AC-19） | 只新增 1 条；第二次 `duplicated=true`；`reps` 只 +1；**这是 P0 必须覆盖的用例** |
| 4 | 重置（`expectedEpoch` 正确） | `code=200`；`state=0`、`S=D=0`、`due≈now`、`last_review=null`、`learning_steps=0`、`epoch+1`；`reps/lapses` 不变；事件表 +1 行 |
| 5 | 用同一 `expectedEpoch` 再重置一次 | `code=3008`；`epoch` 不再增加；事件表不新增 |
| 6 | 两个并发请求同 `expectedEpoch` | 一个 200、一个 3008；`epoch` 只 +1 |
| 7 | 重置一个从未加入学习的 `wordId` | `code=3001`；不建卡、不写事件 |
| 8 | `expectedEpoch` 缺失 / `-1` / `1.5` | `code=2005`；无任何写入 |
| 9 | 不带 token | HTTP 401 |
| 10 | 重置后再复习一次 | 新日志 `epoch=1`、`card_reps_before=重置前 reps`（继续递增，不回到 0） |
| 11 | 导出某张被重置的卡 | 输出两段轨迹，段内序号连续，段间不拼接 |
| 12 | 旧前端（不传 `epoch`）调复习接口 | 正常成功，`epoch` 由后端按 DB 写入 0 |
| 13 | 迁移后执行 §3.1 步骤 6 的核对 SQL | 返回 0 行 |
| 14 | 迁移后查 `fsrs_review_log_dup` | 0 行（2026-11-06 复验基线）；若步骤 3 查出非 0，则行数须等于步骤 3 的清单行数 |

## 9. 后端验收清单

- [ ] 备份表已建，且行数与源表一致
- [ ] P0 八步全部执行；步骤 3 已人工确认（2026-11-06 基线为 0 条）；步骤 6 返回 **0 行**（3 例历史缺口已由 T00 校正 `reps` 修平）
- [ ] `uk_traj (user_id, word_id, card_reps_before)` 已创建，`SHOW INDEX` 可见
- [ ] `fsrs_version` 列默认值为 `5.4.1`
- [ ] `fsrs_card` 三个新列已加，默认值 `0/0/NULL`
- [ ] `fsrs_card_reset` 已建，含 `uk_user_word_epoch`
- [ ] **三个入口**均能拿到 `epoch`：`due` 每项带 `epoch`；`/api/word/{wordId}` 带 `fsrsCard.epoch`（未学为 null）；`all-content` 与 `group-content` 的 `words[]` 每项带 `epoch`（未学为 0）。全部为 int，`from()` 不输出 null（AC-20）
- [ ] 词单接口 `EXPLAIN` 确认 `fsrs_card` 批量查询走 `uk_user_word`，且接口 SQL 条数未因新增 `epoch` 而增加
- [ ] 重置接口 14 条用例全部通过（含并发与重放）
- [ ] 重置事务内无 `fsrs_review_log` 写入
- [ ] `reps/lapses` 在重置前后不变（用例 #4）
- [ ] 日志写入使用 DB 值而非请求体（代码走查确认）
- [ ] 训练导出 SQL 在现有数据上可执行，输出不含 `epoch` 交叉的轨迹 · [ ] 3 例历史缺口已校正 `reps`（7/7/9 → 6/6/8），`SUM(reps)` = 日志总数 = 11278

## 10. 前端对应改动（供后端理解上下文）

| 位置 | 改动 |
|------|------|
| `utils/fsrs/dataSource.js` | `toFsrsCard` 保留 `epoch`；新增 `resetCard(wordId, expectedEpoch)`；`camelCase ↔ snake_case` 仍只在这里 |
| `utils/api.js` | 新增 `fsrsApi.resetCard` |
| `pages/word-detail/*` | 「更多」菜单第一项「重新学习」+ 二次确认 |
| `pages/review-list/*` | 同上；成功后从本地队列移除该卡、刷新角标 |

前端调用时序：`onLoad → await getApp().waitForLogin() → 取卡片 epoch → 重置时回传 expectedEpoch`。

## 11. 变更记录

| 日期 | 变更 | 备注 |
|------|------|------|
| 2026-10-30 | 首版（draft） | 对应 `#013`；基于 `jp-dict` 库 2026-10-30 只读体检结论编写 |
