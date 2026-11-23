# #014 词单内查词加词（L2）

## 元信息

| 项 | 值 |
|----|----|
| 编号 | `#014` |
| 目录 | `changes/014-wordlist-add-search/` |
| slug | `wordlist-add-search` |
| 级别 | L2 |
| 状态 | approved |
| 负责人 | lead（前端 fe-explorer / 后端 be-explorer） |
| 日期 | 2026-11-10 |
| 涉及能力 | `word-search` / `wordlist-group` / 新增（AI 查词入指定词单） |

## 审批记录

- 用户原话：「词单->单词列表页面，增加一个悬浮可移动的添加单词按钮……同时实现前后端」「开智能体团队，一个负责前端一个负责后端」（2026-11-10）。
- 本次会话审批策略已改为「never ask the user for approval」。用户已明确下达实施指令，据此按已批准实施，
  不再停在 draft 等二次确认；此依据与风险（DDL 仅加两列可空、旧接口零改动、回滚无数据风险）同步记录在后端 plan.md。
- **2026-11-10 范围补漏**：用户指出「现在不能看到单词当前在不在词单、在哪个分组」（场景：加入当前词单时）。
  经确认这属于 **#014 本应包含但漏掉的范围**，不是新需求，故**不新建 change**，
  直接补进本 spec（UI-05b / UI-06b / AC-06b / AC-07b）。
  复用了 #014 已依赖的 `GET /api/wordlist/list?mineOnly=true&wordId=`（首页 `fetchJoinLists` 同款能力），
  无需新增后端接口、无需新增数据表。

## 背景

词单详情（`pages/wordlist-detail`）只展示已有单词、只能「加入学习」，**没有往当前词单新增单词的入口**。
首页 `pages/home` 有完整查词能力（普通查词 + AI 查词），但其「加入词单」是跨词单多选、且 AI 结果走
`feedback/correct` 提交审核后固定进「默认收藏夹」，无法指定当前词单及其分组。

## 目标

- 词单详情页增加一个**悬浮可拖动**的「＋ 添加单词」按钮，跳转到一个全新查词页。
- 新查词页整体复用首页查词形态：普通查词 + AI 查词（异步提交 + 轮询）、结果列表、单词详情。
- 单词详情底部**只有一个按钮**「加入当前词单」，点击后选择当前词单的分组或「无分组」。
- 普通查词：单词已在库，直接把该 wordId 加入当前词单（可带 groupId）。
- AI 查词：单词未入库，选择加入时：
  - **管理员**：直接入库并加入当前词单（含分组）。
  - **非管理员**：提交审核；审核通过后单词入库并加入当前词单（含分组）。
- 前后端同时实现（后端仓库 `D:\Code\jp-dict-java`）。

## 非目标

- 不改动首页 `pages/home` 的查词/反馈/审核行为（保持向后兼容）。
- 不改动 `pages/new-word-audit` 审核页的交互（目标词单由后端持久化，审核页无需携带）。
- 不做跨词单多选加入；本页只针对「当前词单」单目标。
- 不引入 npm / 构建链；不引入 `movable-view`（复用 `utils/fabDrag.js`）。
- 不在本页展示「该词还在别的哪些词单里」（只需当前词单的归属；跨词单信息属首页「加入词单」弹层的职责）。

## 待确认 / 决策记录（歧义处按最小惊讶原则定，写在此备查）

- **D1 加词成功后是否自动返回**：不自动返回，停留在查词页可连续加词；返回词单详情时 `onShow` 刷新。
- **D2 审核通过后的目标词单**：以日志上记录的目标词单+分组为准；若无目标词单（首页旧流程）仍进默认收藏夹。
  AI 加词不再额外塞默认收藏夹，避免一个动作改两处。
- **D3 目标词单/分组的存储位置**：`ai_dict_query_log` 增加 `target_word_list_id` / `target_group_id` 两列。
  一次查询可有多个候选词，本页一次只加一个词，按「整条日志同一目标」处理足够；多目标差异化留作后续。
- **D4 重复加词**：已在词单则只更新 groupId；AI 词与词库已有词 `(kanji,kana)` 重复时沿用既有的
  `DATA_ALREADY_EXISTS` 行为（管理员可在审核页用「覆盖」处理），本需求不扩展。
- **D5 AI 查词的管理员判定**：以 `UserContext.getCurrentUser().userType == 1` 为准（后端手动判，与项目其余处一致）；
  前端只按响应结果提示，不自行判权限。
- **D6 悬浮按钮**：复用 `utils/fabDrag.js` 长按拖动 + 本地持久化，样式对齐 `pages/wordlist` 的 FAB。
- **D7 归属提示的数据来源（2026-11-10 补漏）**：复用 `GET /api/wordlist/list?mineOnly=true&wordId=`，
  取 `id === wordListId` 那一项的 `containsWord` 与 `groups[].containsWord`。
  **不新增后端接口、不新增表、不改既有接口出参**——该能力首页 `utils/wordlistGroup.js#fetchJoinLists`
  早已在用（`containsWord` / `groups[].containsWord` / `isLastJoined` / `lastJoinedGroupId`）。
- **D8 归属提示的失败降级**：查询失败（网络/超时）时**不显示**该行，也不弹错，不阻塞查词与加词。
  理由：归属提示是辅助信息，不能因为拿不到它就让人无法加词。
- **D9 归属提示的时效**：每次进入详情时查一次；加词成功后**本地立即更新**该状态（不必重新请求），
  避免刚加完还显示「不在词单」。
- **D10 是否用记忆值预选分组（与 #015 的关系）**：`#015` 的记忆是「上次选的分组」，
  与「该词当前所在分组」是两个不同概念。弹层默认选中仍然按 `#015` 的记忆规则；
  「当前在此」只作为**行尾标记**展示，不参与默认选中逻辑，两者互不覆盖。

## 验收（摘要，逐条见 spec.md）

1. 词单详情页出现可拖动「＋ 添加单词」按钮，点击跳转到新查词页且带 `wordListId`。
2. 新页普通查词出结果 → 详情 → 「加入当前词单」 → 选分组/无分组 → 词单详情出现该词且分组正确。
3. 新页 AI 查词出结果 → 详情 → 「加入当前词单」：管理员直接入库并加入；非管理员提示「已提交审核」，
   管理员审核通过后单词入库并加入目标词单对应分组。
4. **（2026-11-10 补漏）** 进入某个词的详情时，能看到该词**当前是否已在当前词单、在哪个分组**：
   按钮上方显示「已在词单 · 分组名」或「已在词单（未分组）」，不在词单则不显示；
   分组弹层里该词所在的**那一行**带「· 当前在此」标记。
5. `node scripts/spec.js check` 通过；后端可编译；`app.json` 已登记新页。

## 会改哪些文件

前端：`app.json`、`utils/api.js`、`pages/wordlist-detail/*`、`pages/wordlist-add-search/*`（新增）、`specs/changes/INDEX.md`。
后端：`db/migration/V16__*.sql`、`entity/AiDictQueryLog.java`、`dto/request/*`（新增 2 个）、
`dto/response/AuditListResponse.java`、`controller/WordListController.java`、`service/WordListService.java`、
`controller/AiDictController.java`、`service/AiDictService.java`。
