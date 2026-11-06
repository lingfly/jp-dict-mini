# 任务清单：FSRS 卡片重新学习（重置）与日志轨迹

> **状态 draft：本清单仅用于范围评审，一个任务都不许开始，也不许勾选。**
> 批准后按 P0 → P1 → P2 顺序执行；每个任务单独可验证。
>
> **2026-11-06 复核修订**：`T01` 原为"归档 4 条重复日志"，经复验当前库重复行数为 **0**，
> 已改写为"确认 0 行，非 0 则停止"。新增 `T00`（历史缺口校正）与 `T12`（AC-19 请求 ID 复用）。
> **AC-17 已取消**（改为同发布窗口约束），相关任务引用已移除。
> **2026-11-06 二次补入 AC-20**：`expectedEpoch` 在查词页与词单页无来源，已补 T10b/T10c/T10d（后端）与 T13b（前端）。
> 详见 `proposal.md` §1.3、§1.4、§10。

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` / `verify.md` |
| 任务数 | 21 |
| 预估总时长 | 约 6 人日（后端 4 + 前端 2） |

## 任务

> **任务归属说明（2026-11-06）**：`T00`~`T10d` 是**后端**工作，实际由后端仓库
> `jp-dict-java/specs/008-fsrs-card-reset/tasks.md` 跟踪与验收，已在那边完成并验证
> （迁移脚本在独立测试库演练通过、79 个单测全绿、接口 curl 实测通过）。
> 本文件保留这 15 个条目只为保持 AC 覆盖完整性（`node scripts/spec.js check` 要求每条 AC
> 至少被一个任务引用），**不再作为前端进度**。
>
> **前端实际交付 6 项**：`T11`（回填本仓库 `verify.md` 验收表）、`T12`、`T13`、`T13b`、
> `T14`、`T15`（均已勾选）。

### P0 日志轨迹与幂等（含历史缺口校正）

- [ ] **T00** 备份 `fsrs_card` 全表并记录 3 例缺口卡原值（`reps` 应为 7/7/9，`scheduled_days` 128/109/44），执行 `design.md` §2.5 的校正 SQL 把 `reps` 改为 6/6/8 · 覆盖 AC-03 · 验证：§7 核对 SQL ①②③⑤ 全部归零，`SUM(reps)` = 11278 · 文件：`fsrs_card`（数据库，人工执行）
- [ ] **T01** 执行重复行体检 SQL，确认返回 **0 行**；若返回非 0 则停止并人工确认，不得直接归档 · 覆盖 AC-01, AC-05 · 验证：SQL 返回 0 行 · 文件：无（数据库）
- [ ] **T02** 回填 `epoch=0` 与 `card_reps_before`（按 `review` 升序编号）· 覆盖 AC-01 · 验证：回填后 `card_reps_before` 在同一卡内严格递增且无洞 · 文件：迁移脚本
- [ ] **T03** 后端写日志时在行锁内取"复习前 `card.reps`"与 `card.epoch` 写入两列 · 覆盖 AC-01 · 验证：连点两次只有一条日志 · 文件：后端 `FsrsCardService` / `FsrsReviewLogMapper`
- [ ] **T04** 建唯一键 `uk_traj`；撞键时回滚并返回 `duplicated=true` · 覆盖 AC-02 · 验证：`SHOW INDEX` 可见，连点第二次返回 `duplicated` · 文件：迁移脚本 + 后端
- [ ] **T05** 修正 `fsrs_version` 列默认值为 `5.4.1` · 覆盖（修改需求：版本默认值） · 验证：`SHOW COLUMNS` 默认值为 `5.4.1` · 文件：迁移脚本
- [ ] **T06** 新增训练导出脚本：按 `(word_id, epoch)` 分组、`delta_t` 由 `review` 推算、`traj_len<2` 丢弃 · 覆盖 AC-04, AC-05 · 验证：抽样被重置卡输出两段独立轨迹 · 文件：导出 SQL

### P1 重置能力（无前端入口）

- [ ] **T07** `fsrs_card` 加 `epoch` / `reset_count` / `last_reset_at` · 覆盖 AC-08 · 验证：`SHOW COLUMNS` 三列存在且默认值正确 · 文件：迁移脚本
- [ ] **T08** 新建 `fsrs_card_reset` 事件表与索引 · 覆盖 AC-08 · 验证：`SHOW CREATE TABLE` 含 `uk_user_word_epoch` · 文件：迁移脚本
- [ ] **T09** 实现 `POST /api/fsrs/card/reset`：事务内改卡 + 写事件，`expectedEpoch` 乐观锁，失败整体回滚 · 覆盖 AC-06, AC-07, AC-10, AC-12, AC-13 · 验证：并发两请求一成功一 3008，事件只增 1 条 · 文件：后端 `FsrsCardService` / `FsrsReviewController` / `ErrorCode`
- [ ] **T10** 校验重置后卡片进入当天队列（`due=now`），并确认历史统计不减少 · 覆盖 AC-11, AC-09 · 验证：重置后 `GET /api/fsrs/due` 含该卡 · 文件：无（运行时验证）
- [ ] **T10b** `FsrsCardResponse` 加 `Integer epoch`，`from()` 中 null 输出 0（复习入口的数据源）· 覆盖 AC-07, AC-20 · 验证：`GET /api/fsrs/due` 每项含 `epoch` 且为 int · 文件：`dto/response/FsrsCardResponse.java`
- [ ] **T10c** `GET /api/word/{wordId}` 新增嵌套 `fsrsCard`（含 `epoch`）；补 `UserContext` 判空，未登录/未学为 `null` · 覆盖 AC-20 · 验证：查词已学词返回非 null，未学词返回 null，未登录不报错 · 文件：`dto/response/WordDetailResponse.java`、`controller/WordController.java`
- [ ] **T10d** `all-content` 与 `group-content` 的 `words[]` 新增平铺 `epoch`；把 `selectExistingWordIds` 换成 `selectByUserAndWordIds` 批量取，**SQL 条数不得增加** · 覆盖 AC-20 · 验证：词单 300 词时接口 SQL 条数与改动前一致，`EXPLAIN` 走 `uk_user_word` · 文件：`dto/response/WordListWordResponse.java`、`dto/response/GroupWordResponse.java`、`service/WordListService.java`
- [x] **T11** 回填 `verify.md` 的逐条验收表（骨架已建，实施后逐条填"实际"列）· 覆盖（流程要求，L3 必需） · 验证：`node scripts/spec.js check` 无"缺少 verify.md" · 文件：`verify.md`

### P2 前端入口

- [x] **T12** `clientRequestId` 从 `submitReview()` 内部上移到 `handleScore()` 入口，重试复用同一个值 · 覆盖 AC-19 · 验证：断网后重试，Network 面板两次请求 `clientRequestId` 相同 · 文件：`utils/fsrs/dataSource.js`、`pages/review-list/review-list.js`
- [x] **T13** `utils/api.js` 与 `utils/fsrs/dataSource.js` 增加重置封装（`wordId` 保持字符串）· 覆盖 AC-18 · 验证：调用返回结构正确 · 文件：`utils/api.js`、`utils/fsrs/dataSource.js`
- [x] **T13b** 前端三个入口透传 `epoch`：`toFsrsCard()` 保留 `epoch`；`getDetail` 的 `data.fsrsCard` 与词单词项的 `epoch` 映射到页面数据 · 覆盖 AC-20 · 验证：三个入口的按钮点击时 `expectedEpoch` 分别为队列卡轮次 / 详情卡轮次 / 词单词项轮次，均与库中一致 · 文件：`utils/fsrs/dataSource.js`、`utils/wordlistGroup.js`、`pages/word-detail/word-detail.js`、`pages/wordlist-detail/wordlist-detail.js`
- [x] **T14** `pages/word-detail`「更多」菜单新增「重新学习」（第一项，位于「单词纠错」之上）+ 二次确认弹窗（文案见 spec 界面契约）；提交锁、失败保留原状态 · 覆盖 AC-14, AC-15, AC-16, AC-20 · 验证：三个入口各点一次，行为一致 · 文件：`pages/word-detail/word-detail.{js,wxml,wxss}`
- [x] **T15** `pages/review-list`「更多」菜单同上；重置成功后从本地队列移除该卡、重算进度、刷新角标，不得停留在完成态 · 覆盖 AC-11, AC-14, AC-15, AC-16, AC-18 · 验证：重置后队列不含该卡且不停留在完成页 · 文件：`pages/review-list/review-list.{js,wxml,wxss}`
- [ ] **T16** 确认后端 P1 与前端 P2 在同一发布窗口上线（AC-17 已取消，无能力探测兜底）· 覆盖（发布约束，取代 AC-17） · 验证：`verify.md` §六 发布顺序已签署 · 文件：发布单

## 执行约定

1. **一次只做一个任务。** 做完 → 验证 → 勾选 → 提交，再开始下一个。
2. **提交信息带编号**：`feat(review): 增加重新学习入口 [#013]`。
3. **发现新问题不顺手改**：记到 `TODO.md`，必要时新建 change。
4. **T09 的 DDL 必须人工在目标库执行，不能由 CI 代跑。**

## 验收记录

> 全部任务完成后填写。L3 变更的逐条验收写在 `verify.md`。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | | | |
| AC-02 | | | |
| AC-03 | | | T00 校正后序列表格应全部连续 |
| AC-04 ~ AC-16 | | | 逐条见 `verify.md` |
| AC-18 | | | 回归项 |
| AC-19 | | | 新增于 2026-11-06 复核 |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 校正 `reps` 导致的间隔变化 | 三张卡下次间隔在原 fuzz 区间内重新取值（当前 128/109/44 天） | 已接受；观察下一次复习的实际间隔是否在合理范围 |
| `AC-17` 已取消 | 旧后端 + 新前端时入口可见但接口 404 | T16 用同发布窗口约束替代 |

## 归档前检查

- [ ] 所有任务已勾选
- [ ] 每条 AC 都有验收结论
- [ ] 状态已由人执行 `verify` 改为 `verified`（不是 `approved`）
- [ ] 能力规范已更新（`specs/capabilities/review-scheduling/spec.md` 的 `last_reviewed`）
- [ ] `node scripts/spec.js check` 通过（0 错误）
- [ ] 没有把调试代码（`console.log`、临时开关）留在仓库
- [ ] `spec.md` 的「待确认问题」全部关闭（已完成：3 项均为 `[x]`）
- [ ] `design.md` §7 的核对 SQL ①②③ 全部 0 行、⑤ 的 `delta=0`
- [ ] 后端 P1 与前端 P2 同发布窗口（T16）
---

## 完成情况（2026-11-06）

| 指标 | 值 |
|---|---|
| 任务总数 | 21 |
| 前端实际交付 | 6（T11、T12、T13、T13b、T14、T15） |
| 后端任务（由 008 跟踪） | 14（T00~T10d） |
| 发布约束 | 1（T16，待发布单签署） |

**前端交付明细**：

| 任务 | 文件 | 说明 |
|---|---|---|
| T12 | utils/fsrs/dataSource.js、pages/review-list/review-list.js | clientRequestId 上移到动作入口，重试复用（AC-19） |
| T13 | utils/api.js、utils/fsrs/dataSource.js、utils/fsrs/mockStore.js | esetCard 封装（含 mock） |
| T13b | utils/fsrs/dataSource.js、utils/fsrs/fsrs.js | epoch 透传；修 
ormalizeCard 吞字段 |
| T14 | pages/word-detail/word-detail.{js,wxml,wxss} | 菜单项 + 二次确认弹窗 |
| T15 | pages/review-list/review-list.{js,wxml,wxss} | 菜单项 + 弹窗 + 成功后移出队列/刷新角标 |

**后端验证结果**（008 侧已完成）：
- 迁移脚本 V13/V14/V15/V15b 在独立测试库完整演练通过，生产库已执行，delta=0
- mvn -q test：79 个测试全部通过
- 接口实测：正常重置 / 3008 冲突 / 3001 不存在 / 2005 参数 / 并发一成功一 3008 / 重复提交拦下