# #014 设计

## 影响面

- 前端仓库 `jp-dict-mini`：新增 1 页、改 3 处（app.json / utils/api.js / wordlist-detail）。
- 后端仓库 `jp-dict-java`：新增 1 迁移、2 请求 DTO、2 响应 DTO、2 Controller 端点、
  改 `AiDictQueryLog` / `AiDictService` / `WordListService` / `WordListController` / `AiDictController`。

## 数据流

### 普通查词加词

> ⚠️ **2026-11-11 更新**：下面这版 `/api/wordlist/add-word` 的原始设计**已作废**，
> 接口已从后端物理删除。现行实现见本文档「归属提示 → 普通加词改用 update-relations」一节。
> 保留原图仅为记录演进过程。

```text
（历史设计，已作废）
wordlist-detail (FAB, wordListId)
  → wordlist-add-search (查词/详情, 选 groupId)
  → POST /api/wordlist/add-word {wordId, wordListId, groupId}
  → WordListService.addWordToWordList: 校验权限/分组 → insert 或 update group_id → recalc
  → 返回词单详情 onShow 刷新
```

**现行实现**：

```text
wordlist-detail (FAB, wordListId)
  → wordlist-add-search (查词/详情, 弹层勾选)
  → 先 GET /api/wordlist/list?mineOnly=true&wordId= 取归属 + allRelations
  → POST /api/wordlist/update-relations {wordId, targets:[全量]}
  → WordListService.updateWordListRelations: 清空后按 targets 重建 → recalc
  → 本地更新归属状态；返回词单详情 onShow 刷新
```

### AI 查词加词
```
wordlist-add-search (AI 查词, logId + selectedIndex + wordListId + groupId)
  → POST /api/ai-dict/add-word
  → AiDictService.addWordFromWordlist:
      校验 log 归属/状态/索引；持久化 target_word_list_id + target_group_id
      管理员 → 直接 addToDictionary → addWordToWordList(目标词单, 目标分组) → status=auto → 返回 wordId
      非管理员 → selectedIndexes 累积、status=pending → 返回 needAudit=true
  → 管理员在 new-word-audit 采纳
      → approveAiDict 写词库 → 若日志有 target_word_list_id 则 addWordToWordList(目标, 分组)
        否则保持 getOrCreateDefaultWordList(提交人) 旧行为
```

## 关键决策

- **不复用 `feedback/correct`**：该接口语义是「加入审核并进默认收藏夹」，且自动审核由配置/白名单决定，
  与「管理员直接加当前词单」冲突。新增 `POST /api/ai-dict/add-word` 专门承载本页语义，
  保持旧接口零改动（AC-14）。
- **目标词单记在日志行上**（`target_word_list_id` / `target_group_id`）：审核是异步的、由管理员在别的页面完成，
  无法在审核请求里带目标；必须持久化。选列而非新表，因一次 AI 查询在本页只加一个词、目标唯一（D3）。
- **权限用 `userType==1`**：`UserContext.getCurrentUser().getUserType()`，与 `approveAiDict` 一致。
- **加词目标归属校验按「提交人」**：管理员审核时当前登录人是管理员，但目标词单属于提交人；
  因此 `addWordToWordList` 内部不做 `checkWordListModifyPermission`（那是按当前登录人的），
  改为校验 `wordList.userId == log.userId`（或系统预设且提交人是管理员），分组归属按 id 查表校验。
- **`addWordToWordList` 复用**：`AiDictService` 里已有的私有方法加 `groupId` 参数重载（**保留**，AI 加词在用）；
  ~~`WordListService` 新增 `addWordToWordList` 公共方法给 `add-word` 端点用~~
  —— **2026-11-11 已删除**：该公共方法与 `add-word` 端点一并下线。
- **失败/回滚**：AI 入库与加词单在同一 `@Transactional` 内，任一步失败整体回滚。
- **前端详情渲染**：复制首页 `processSearchResults` / 结果列表 / 详情卡 / AI 查词轮询逻辑到新页，
  删掉底部操作栏里除「加入当前词单」外的按钮；`helper.wxs` 复制首页版本。
- **分组列表来源**：`GET /api/wordlist/all-content` 的 `groups`（`{id, groupName}`），
  与 wordlist-detail 同源；避免新增接口。

## 归属提示（2026-11-10 补漏）

### 数据来源

复用既有接口，不新增后端任何东西：

```
GET /api/wordlist/list?mineOnly=true&wordId=<wordId>
```

取返回数组里 `String(id) === String(wordListId)` 的那一项：
- `containsWord`：该词是否在当前词单里
- `groups[].containsWord`：命中项即**该词所在的分组**（无命中 = 词在词单但未分组）
- 全程 **ID 保持字符串**（`String()` 转换，禁止 `Number()`，遵守 AC-16）

> 这个能力首页 `utils/wordlistGroup.js#fetchJoinLists` 早已在用，
> 本次只是在新页里复用同一数据源与同一封装函数。

### 前端改动

`pages/wordlist-add-search`：

| 位置 | 改动 |
|---|---|
| `data` | 新增 `membership: {loaded,inList,groupId,groupName}`、`allRelations`、`origGroupKey`、`groupCanConfirm` |
| `selectWord()` | 进详情时调 `loadMembership(wordId)`（异步，不阻塞详情渲染）；切词时先清空上一个词的归属避免闪旧状态 |
| 新增 `loadMembership()` | 调 `groupSource.fetchJoinLists`，算出 `membership`（当前词单归属）与 `allRelations`（该词所在全部词单）；失败则 `loaded:false`（不显示状态行） |
| `openGroupPicker()` | 记录 `origGroupKey`（该词当前所在行的 key，不在词单则 null）；初始勾选：在词单→原位置，不在→#015 记忆预选。**若归属仍在加载中，先 `showLoading` 等其完成再弹层**（`_membershipLoading`），避免时序丢失「原位置」 |
| `onGroupRowTap()` | 点已勾选→取消；点未勾选→选中并互斥；同步 `groupCanConfirm` |
| `buildRelationsTargets()` | 拼全量 targets（关键，见下） |
| `confirmAdd()` 成功分支 | 本地更新 `membership`/`allRelations`（`applyMembershipLocally`），不发二次请求 |
| WXML | UI-05b 状态行 + 弹层「原位置」标签 + 无勾选时提示 |
| WXSS | 三处小样式 |

### 普通加词改用 update-relations（接口收敛）

原实现调 `POST /api/wordlist/add-word`（纯追加语义：只能加/改分组，不能移除）。
用户要求「和首页逻辑一致」，故改为复用首页同款 `POST /api/wordlist/update-relations`。

**⚠️ 全量替换的安全边界（本改动最容易出数据事故的点）**：

`WordListService.updateWordListRelations` 的实现是：
1. `deleteModifiableRelationsByWordId(wordId, userId, includeSystem)` —— 清空该词在
   **所有本人可修改词单**中的关系；
2. 按 `targets` 重建；
3. `recalcWordCount` 受影响词单。

而本页弹层**只展示当前词单**（首页的弹层展示的是该词所在的所有词单）。
若直接把「当前词单的勾选结果」当 targets 提交，后端会把该词在**其它词单**的关系一起删掉。

> **实测确认**：词同时在词单 A、B 时，提交 `targets=[{A}]` → B 的关系被删除（`code:200` 静默成功）。

**因此 `buildRelationsTargets()` 必须拼全量**：

```
targets = 其它词单的现有关系（原样保留 groupId）      ← 来自 allRelations 过滤掉当前词单
        + 当前词单：勾选了   → { wordListId, groupId }
                    取消勾选 → 不加入 targets（= 从当前词单移除）
```

回归用例 D2 / C2 专门验证这一点：改分组、移除之后，`B` 词单的关系都必须仍在。

### 与 #015 的关系

- **默认勾选**：该词在词单时取「原位置」；不在词单时取 `#015` 记忆值（仅做**预选**）。
- **「原位置」标签**只标记该词真实所在行（`origGroupKey`），与记忆值无关。
- 为什么要把两者分开：若把记忆值也当成「原位置勾选」，而点已勾选又等于取消，
  用户点那个默认项就会变成取消 → 什么都没提交（开发中已踩到，见 verify.md 二轮修正）。

### 降级

- 归属查询失败 → `membership.loaded=false`，不显示 UI-05b 状态行、弹层无「原位置」标签；
  **查词与加词完全不受影响**。
- 该词不在词单 → 状态行不渲染（`wx:if`），不占位。

### 旧接口物理删除（2026-11-11）

`POST /api/wordlist/add-word` 已**从代码中完全移除**（不是保留兼容期）：

| 层 | 删除内容 |
|---|---|
| Controller | `WordListController` 的 `@PostMapping("/add-word")` 端点及方法、`AddWordToWordListRequest` import |
| Service | `WordListService.addWordToWordList(Long, Long, Long, Long)` |
| DTO | `AddWordToWordListRequest`、`AddWordResult`（整文件） |
| 前端 | `utils/api.js` 的 `wordlistApi.addWord()` |

**删除依据**：这是同一批交付内 `#014` 自己新增的接口，尚未对外发布，
全仓 grep 确认无第三方/遗留调用方；保留只会让「纯追加」和「全量替换」两套加词语义并存。

**务必区分（易误删）**：
- `AiDictService` 内的**私有** `addWordToWordList(...)` —— AI 加词内部逻辑，**保留**；
- `AiDictController` 的 `POST /api/ai-dict/add-word` + `AiDictAddWordResult` —— AI 加词主接口，**保留**；
- mapper 的 `selectByListIdAndWordId` / `batchUpdateGroupId` / `incrementWordCount` —— 其它业务路径在用，**保留**。

删除后该 URL 返回 `404`（已实测），详见 verify.md 修正 8。

## FAB 权限门槛（2026-11-11 补充）

### 问题

`#014` 原设计让 FAB **无条件显示**（`wx:if="{{fabReady}}"` 只看底部栏是否量到高度）。
后果：进入**他人创建的公共词单**也显示「＋ 添加单词」，点进去能查词、能选分组，
提交时才被后端 `checkWordListModifyPermission` 拒绝（`FORBIDDEN`「只能修改自己的词单」）——
用户白操作一场。

### 权限规则（后端既有，不新增语义）

`WordListService.checkWordListModifyPermission` 的现行规则：

```
用户可修改词单 ⟺
    wordList.userId == 当前用户 id          // 自己的词单
 或 wordList.userId == null 且 当前用户 userType == 1   // 系统预设词单 且 管理员
```

### 为什么由后端返回 `canEdit`，而不是前端自己算

| 方案 | 评价 |
|---|---|
| **前端用 `getDetail().userId` + `getCurrentUser()` 自行比较** | ❌ 前端要复刻「系统预设 + 管理员」这条规则，与后端 `checkWordListModifyPermission` 形成两份实现；将来权限规则一改（如加协作者），两处必漂移。且要多调一次 `current-user` 接口。 |
| **后端在 `/detail` 返回 `canEdit`**（采用） | ✅ 单一事实来源。前端零权限逻辑，只读一个布尔值。 |

### 后端改动

1. `WordListService` 抽出纯判定方法（不抛异常），让原校验方法复用它：

```java
/** 当前用户是否可修改该词单（与 checkWordListModifyPermission 同一规则） */
public boolean canModifyWordList(Long userId, WordList wordList) {
    if (wordList == null) return false;
    if (userId != null && userId.equals(wordList.getUserId())) return true;
    return wordList.getUserId() == null && isAdmin();
}

private void checkWordListModifyPermission(Long userId, WordList wordList) {
    if (wordList == null) throw new BusinessException(ErrorCode.DATA_NOT_FOUND, "词单不存在");
    if (!canModifyWordList(userId, wordList)) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "只能修改自己的词单");
    }
}
```

> 关键：把「抛异常版」改造成「布尔版 + 抛异常包装」，保证**显示判定与提交校验永远一致**（AC-01d）。

2. `WordListDetailResponse` 加 `private Boolean canEdit;`
3. `WordListController.getWordListDetail`：

```java
response.setCanEdit(wordListService.canModifyWordList(userId, wordList));
```

### 前端改动

| 位置 | 改动 |
|---|---|
| `data` | 新增 `canEdit: false`（**初始 false**，权限未回来前不显示，避免闪现） |
| `loadDetail()` | 除设置导航栏标题外，保存 `canEdit: !!res.data.canEdit` |
| WXML | FAB 条件改为 `wx:if="{{fabReady && canEdit}}"` |

**为什么不额外隐藏底部栏的「顺序 / 随机 / 加入学习」**：
那三个是**学习入口**，只读消费词单内容，与「编辑词单」权限无关。
他人公共词单也应该能拿来学习，隐藏它们反而是错的。本改动只收窄「添加单词」。

**与 `onReady` 布局的关系**：`measureBottomBar()` / `relayout()` 照旧执行。
`canEdit=false` 时 FAB 不渲染，`relayout()` 找不到节点会安静返回，无副作用。

### 安全边界（不要在验收里搞混）

前端隐藏按钮**只是体验优化，不是安全边界**。
即使有人直接构造 `/pages/wordlist-add-search/wordlist-add-search?wordListId=xxx` 进入，
后端写接口（`update-relations` / `ai-dict/add-word`）依然会 `FORBIDDEN` —— 这层兜底是既有能力，
本次不新增，但验收时要验证它仍然生效（AC-01e）。

## 回滚

- 前端：删新页目录、撤 app.json / api.js / wordlist-detail 三处改动。
- 后端：撤 V16 之后的实体/DTO/Controller/Service 改动；V16 只加两列可空，已存在的数据不受影响，
  可不回滚列（无害）。旧 `feedback/correct` 与 `audit/*` 行为不变，回滚无数据风险。
