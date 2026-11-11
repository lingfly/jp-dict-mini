# #014 词单内查词加词 — 规格

> 每条 AC 用 EARS 句式，均可手动/自动验证。界面契约表写死位置、形态、文案、动作、消失条件。

## 界面契约

| 编号 | 位置 | 形态 | 文案 | 动作 | 消失条件 |
|------|------|------|------|------|----------|
| UI-01 | 词单详情页右下角 | 主色圆角悬浮按钮，可长按拖动（复用 `utils/fabDrag.js`）。**仅当当前用户对该词单有编辑权限时才渲染**（见 UI-01c） | `＋ 添加单词` | 点击 `wx.navigateTo` 到 `/pages/wordlist-add-search/wordlist-add-search?wordListId=xxx` | **无编辑权限时不渲染**（整块不占位）；有权限时常驻、位置本地持久化 |
| UI-01c | FAB 显示条件（2026-11-11 补充） | 由**后端权威判定** `WordListDetailResponse.canEdit` 决定，前端不自行复刻权限规则 | — | 有权限 → 显示；无权限 → 不显示；权限查询中 → **不显示**（避免先显示后消失的闪烁） | — |
| UI-01b | 同上 | 默认位置须在 `.bottom-bar` 上方，间距 16px（底部留白 = 底部栏高度 + 16px） | — | — | 不消失；**不得与底部操作栏重叠** |
| UI-02 | 新查词页顶部 | 与首页一致的自定义导航栏 | `添加单词` | 返回按钮**按状态分流**（见 UI-02b） | 不消失 |
| UI-02b | 导航栏返回按钮（2026-11-10 修正） | 单个按钮，行为随页面状态变化（对齐首页 `pages/home` 的 `nav-back-btn`） | — | **详情态**（`wordDetail` 存在）→ 回到查词页（清空详情、恢复列表滚动位置），**不退出页面**；**列表态**（无详情）→ `wx.navigateBack()` 回词单详情 | 不消失 |
| UI-03 | 新查词页搜索区 | textarea + 查询按钮，与首页一致 | 占位符同首页 | 普通查词 `GET /api/word/search` | 不消失 |
| UI-04 | 搜索结果下方 / 无结果时 | 虚线框 AI 查词入口，与首页一致 | `AI 查词` | 异步提交 + 轮询 | 详情态隐藏 |
| UI-05 | 单词详情底部 | **仅一个**全宽主色按钮 | `加入当前词单` | 打开分组选择弹层 | 非详情态隐藏 |
| UI-05b | 单词详情底部按钮**上方**（2026-11-10 补漏） | 一行状态提示，非按钮、不可点击 | · 已在词单·未分组：`已在词单（未分组）`<br>· 已在词单·在某分组：`已在词单 · 分组名`<br>· 不在词单：**不显示该行** | — | 非详情态隐藏 |
| UI-06 | 分组选择弹层 | 底部 sheet，单选行列表（**样式逐项对齐首页 `pages/home` 的 `.join-*` 系列**：圆角 18px、遮罩色 `rgba(16,20,28,.42)`、标题 16px/600、副标题 12px `#8A919D`、行高 32px 图标 + 上下 10px、行间隔线 `#F3F4F7`、单选圈 20px、确定按钮 44px/圆角 12px/主色 `#5B8C7D`、禁用态 `#C3CCE8`） | 首行固定 `无分组`（用书本图标 📚 + `#EEF2FE` 底），其后为当前词单各分组名（用色块）；**该词当前所在的那一行默认勾选并显示 `原位置` 标签，且该行底色 `#F0F7F4`、勾选圈为灰底灰勾（`#EFF1F4`/`#C4C9D2`）与手动勾选（主色绿）区分** | 点某行 → 切换勾选（可取消）；点「确定」提交 | 关闭/提交成功后隐藏 |
| UI-06b | 弹层每行（2026-11-10 补漏，对齐首页） | 行尾标记，两种 | · 该词**当前就在**这一行 → 显示 `原位置` 标签 + **默认勾选**（✓）<br>· 无其它额外标记 | — | 与所在行同生灭 |
| UI-06c | 弹层底部按钮（对齐首页） | 全宽主色按钮 | `确定` | 提交当前勾选 | 弹层关闭 |
| UI-06d | 弹层副标题（对齐首页） | 标题下方小字 | `原位置已勾选 · 再点一次可取消` | — | 弹层关闭 |
| UI-07 | AI 结果详情 | 内联提示条（toast 亦可） | 管理员 `已加入词单` / 非管理员 `已提交审核，审核通过后将加入词单` | — | 自动消失 |
| UI-08 | 词单详情页 | 列表刷新 | — | `onShow` 重新拉 `all-content` | — |

## 行为 AC（EARS）

- **AC-01**（UI-01）当用户在词单详情页，系统应在右下角显示可拖动的「＋ 添加单词」按钮；
  长按后可拖动，松手位置持久化，下次进入保持。
- **AC-01b**（UI-01，2026-11-10 联调后补充）当词单详情页存在底部操作栏（`.bottom-bar`）时，
  系统应把悬浮按钮默认位置**抬到底部操作栏上方**，底部留白 = 底部操作栏实测高度 + 16px，
  任何窗口尺寸下都**不得与底部操作栏或其按钮（顺序 / 随机 / 加入学习）重叠**。
  拖动边界同样以该留白为上界；用户手动拖过的位置优先保留，但仍做边界校正。
  > 依据：联调实测原实现用固定 24px 留白（照搬无底部栏的 `pages/wordlist`），
  > 底部栏实测 104px 高 → FAB 压住按钮区 39px。留白必须由底部栏高度动态决定，
  > 且 onLoad 阶段底部栏未渲染量不到，需在 `onReady` + 数据加载完成后重新布局。
- **AC-01c**（UI-01c，2026-11-11 补充）当用户进入词单详情页时，系统应**只在该用户对该词单有编辑权限时**才渲染「＋ 添加单词」悬浮按钮：
  - **当前用户自己创建的词单**（`wordList.userId == 当前用户 id`）→ 显示；
  - **系统预设词单**（`wordList.userId == null`）且当前用户是管理员（`userType == 1`）→ 显示；
  - **他人创建的词单**（`wordList.userId` 为别人，如公共/共享词单）→ **不显示**，且不得占位、不得保留透明可点击区域；
  - **权限尚未查询完成** → 不显示（等 `canEdit=true` 再出现，避免闪烁）。
  权限判定以 `GET /api/wordlist/detail` 返回的 `canEdit` 字段为准，前端**不得**自行用 `userId`/`isSystem` 复刻规则。
  > 依据：`#014` 原规格漏写了 FAB 的权限前提，导致公共词单也显示「添加单词」，
  > 点进去后提交才被后端 `checkWordListModifyPermission` 拒绝（`FORBIDDEN`）——这是可预见的失败路径。
- **AC-01d**（权限判定单一事实来源，2026-11-11）后端应让 `canEdit` 与写操作所用的
  `checkWordListModifyPermission` **共用同一份判定逻辑**（抽 `canModifyWordList(userId, wordList)` 纯布尔方法供两者调用），
  不得出现「显示时算一套、提交时判另一套」的漂移。
- **AC-01e**（服务端兜底，2026-11-11）即使前端被绕过（直接构造 URL 进入新查词页），
  后端写操作仍必须拒绝无权限用户：`POST /api/wordlist/update-relations` / `POST /api/ai-dict/add-word`
  对无权词单返回 `FORBIDDEN`。前端隐藏按钮**不是**安全边界。
- **AC-02**（UI-01）当用户点击该按钮，系统应导航到新查词页并把 `wordListId`（字符串，不做 Number 转换）作为查询参数传入。
- **AC-03**（UI-02/03）当新页 `onLoad` 时，系统应 `await getApp().waitForLogin()`，校验 `wordListId` 存在，
  并加载当前词单的分组列表（`GET /api/wordlist/all-content` 取 `groups`）供分组选择使用；拉取失败时不阻塞查词，
  分组弹层降级为只有「无分组」。
- **AC-03b**（UI-02b，2026-11-10 修正）当用户点导航栏返回按钮（或真机物理返回键/右滑返回）时，系统应按页面状态分流：
  - **详情态**（正在看某个单词的详情）→ 回到**查词页**（清空 `wordDetail`、恢复结果列表的滚动位置），
    **不得**退出本页；物理返回键通过 `onBackPress` 返回 `true` 拦截默认返回；
  - **列表态**（已回到查词页）→ 才 `wx.navigateBack()` 回到词单详情页。
  即返回路径为：`单词详情 → 查词页 → 词单详情`，与首页 `pages/home` 的 `backToResults` 行为一致。
- **AC-04**（UI-03）当用户输入关键字点「查询」，系统应调 `GET /api/word/search` 并展示结果列表（复用首页的
  `processSearchResults` 高亮与分页逻辑）；无结果时显示 AI 查词入口。
- **AC-05**（UI-04）当用户点 AI 查词入口，系统应 `POST /api/ai-dict/query-async` 后每 2s 轮询
  `GET /api/ai-dict/query-result`，直到 success/failed（总上限 5 分钟、连续失败 3 次放弃）；
  结果用与首页一致的 `WordDetailResponse` 渲染，且标记 `_fromAi=true`、`_logId`。
- **AC-06**（UI-05）当用户点某条结果进入详情，系统应展示单词/释义/例句（复用首页详情渲染），
  底部**只显示一个**「加入当前词单」按钮，不显示「收藏」「符合预期」「不符合预期」「纠错」「删除」等其它按钮。
- **AC-06b**（UI-05b，2026-11-10 补漏）当用户进入某条结果的详情，系统应**先查这个词在当前词单里的归属**，
  并在「加入当前词单」按钮上方按 UI-05b 显示一行状态提示：
  - 该词已在当前词单且**属于某个分组** → 显示 `已在词单 · <分组名>`；
  - 该词已在当前词单但**未分组** → 显示 `已在词单（未分组）`；
  - 该词**不在**当前词单 → **不显示该行**（不占位、不留空白）。
  归属数据来源：`GET /api/wordlist/list?mineOnly=true&wordId=<wordId>`，
  取 `id === wordListId` 那一项的 `containsWord` 与 `groups[].containsWord`（命中项即所在分组）；
  查询失败时**不显示该行**并静默降级，不阻塞查词与加词。
- **AC-07**（UI-06）当用户点「加入当前词单」，系统应弹出分组选择弹层，首行恒为「无分组」，
  其后按 `sortOrder` 列出当前词单的分组；**布局与交互对齐首页 `pages/home` 的加入词单弹层**
  （标题 `加入词单` + 副标题 + 列表 + 底部 `确定` 按钮）。
- **AC-07b**（UI-06b/06c/06d，2026-11-10 补漏，对齐首页）当弹层打开时，系统应：
  - 若该词**当前已在**当前词单（未分组或某个分组），则**默认勾选**那一行并在行尾显示 `原位置` 标签；
  - 点已被勾选的行 → **取消勾选**；点未勾选的行 → 勾选它并取消其它行（单选互斥）；
  - 副标题恒为 `原位置已勾选 · 再点一次可取消`；
  - 提交时按**当前勾选行**决定 `groupId`：选中「无分组」→ `null`，选中某分组 → 该分组 id；
  - 若用户取消了原位置且未勾选任何行 → 「确定」按钮置灰不可提交。
- **AC-07c**（默认选中与 #015 记忆的关系）当弹层打开时，默认勾选**优先取「该词当前所在位置」**（原位置）；
  该词不在词单时，才回退到 `#015` 的记忆值（上次选的分组），都没记过则「无分组」。
  理由：用户点开弹层最先要知道的是"它现在在哪"，其次才是"我上次往哪放"。
- **AC-08**（普通加词，2026-11-10 改为对齐首页）当用户对**普通查词**结果点「确定」，系统应调
  **已存在的** `POST /api/wordlist/update-relations`，body
  `{ wordId(字符串), targets:[{ wordListId(字符串), groupId(字符串或null) }] }`。
  后端把该词在本人可修改词单中的关系**全量替换**为目标列表。
- **AC-08b**（全量替换的安全边界，**必须**）由于 `update-relations` 是**全量替换**
  （后端先 `deleteModifiableRelationsByWordId` 清空该词在所有本人可修改词单中的关系，再按 targets 重建），
  而本页弹层**只展示当前词单**，所以提交前**必须补齐其它词单的现有关系**：
  - 先取该词当前所在的全部词单（`GET /api/wordlist/list?mineOnly=true&wordId=` 中 `containsWord=true` 的项）；
  - `targets` = 「除当前词单外的全部现有关系（保留其 `groupId`）」+「当前词单按本次勾选算出的目标（或移除）」；
  - **禁止**只传当前词单一项——实测会静默删除该词在其它词单的关系（数据丢失）。
- **AC-08c**（移除语义，对齐首页）当用户在弹层里**取消勾选**原位置且未勾选其它行时，
  系统应在提交时把当前词单从 `targets` 中**省略**，即把该词从当前词单移除（与首页「再点一次可取消」一致）；
  移除后提示文案为 `已更新词单`。
- **AC-09**（AI 加词）当用户对 **AI 查词**结果确认加入，系统应调
  `POST /api/ai-dict/add-word` body `{ logId(字符串), selectedIndex, wordListId(字符串), groupId(字符串或null) }`。
- **AC-08d**（接口下线，2026-11-11）系统**不得**再暴露 `POST /api/wordlist/add-word`：
  该 URL 必须返回 `404`；前端不得残留 `wordlistApi.addWord()` 封装；
  后端对应 Controller 端点、Service 方法、DTO 必须已删除。
  同时 `POST /api/ai-dict/add-word` 与 `POST /api/wordlist/update-relations` 必须保持可用。
- **AC-10**（AI 加词 · 管理员）当后端识别当前用户 `userType==1`，系统应直接把该 AI 结果写入词库
  （`word/word_definition/example_sentence/conjugation`），并把生成的 wordId 加入目标词单的指定分组，
  返回 `{ code:200, data:{ wordId, needAudit:false, message } }`；前端按 UI-07 提示。
- **AC-11**（AI 加词 · 非管理员）当后端识别当前用户非管理员，系统应把该次提交的索引与目标词单/分组
  持久化到 `ai_dict_query_log`（`selectedIndexes` 累积、`status=pending`、新增 `target_word_list_id`/`target_group_id`），
  **不写词库**，返回 `{ code:200, data:{ needAudit:true, message } }`；前端按 UI-07 提示。
- **AC-12**（审核入库）当管理员在 `pages/new-word-audit` 对一条带目标词单的 pending 记录点「采纳」，
  系统应在写词库后把生成的单词加入**日志上记录的目标词单 + 目标分组**（`word_list_item.group_id`）；
  若日志无目标词单（首页旧流程），保持原行为加入提交人默认收藏夹。
- **AC-13**（幂等）当同一 AI 结果的同一索引被重复提交，系统应忽略重复（与 `markCorrect` 既有去重一致），
  不重复写词库、不重复加词单。
- **AC-14**（兼容）首页 `feedback/correct` 与审核页 `audit/approve|reject|approve-override` 的既有调用与行为不回归。
- **AC-15**（路由）新页必须登记在 `app.json` 的 `pages` 数组；`node scripts/spec.js check` 通过。
- **AC-16**（ID 精度）所有 `wordId` / `wordListId` / `groupId` / `logId` 在前端全程保持字符串，禁止 `Number()`。

## 数据契约

### `GET /api/wordlist/detail` 新增字段 `canEdit`（2026-11-11 补充）

用于驱动 UI-01c 的 FAB 显示条件，避免前端复刻权限规则。

```json
{ "code":200, "message":"success",
  "data": {
    "id":"2086459016923365376", "name":"默认收藏夹",
    "userId":"2086459012309630976", "isSystem":false,
    "wordCount":1174, "learnedCount":0,
    "canEdit": true
  } }
```

- `canEdit: Boolean`，在 `code=200` 的响应中**永不为 null**（无权时为 `false`）。
- **未登录/鉴权失败**：该接口本身需要登录，会返回 `401` 而不返回 `canEdit`；
  前端在请求失败分支保持 `canEdit=false`（不显示按钮），属安全降级。
- 判定与写操作**同源**：`userId.equals(wordList.userId)` 或
  （`wordList.userId == null` 即系统预设 且 当前用户 `userType == 1`）。
  实现上抽出 `WordListService.canModifyWordList(userId, wordList)` 纯布尔方法，
  由 `checkWordListModifyPermission` 与 `/detail` 端点共同调用（AC-01d）。
- **向后兼容**：仅新增可空/默认 false 字段，旧客户端忽略即可。

### 普通加词：`POST /api/wordlist/update-relations`（**复用已有接口**，2026-11-10 调整）

> **为什么不新增 `add-word`**：用户指出应「和首页逻辑一致」。
> 首页的「加入词单」早就用这一个接口完成「加 / 改分组 / 移除」三种动作；
> `#014` 最初另造的 `POST /api/wordlist/add-word` 是纯追加语义，做不到移除，
> 与本页需要的「再点一次可取消」相冲突。故普通加词改用本接口，
> 并把 `add-word` **物理删除**（2026-11-11 已完成，见下方「已物理删除的接口」）。

请求 `JoinWordListsRequest`：
```json
{ "wordId": "2086434905015383148",
  "targets": [ { "wordListId": "2120112549448290304", "groupId": "2120112549624451072" },
               { "wordListId": "2120112549511204864", "groupId": null } ] }
```
`targets` 为空数组 = 把该词从所有本人可修改词单中移除。

**全量替换语义（必须理解）**：后端 `WordListService.updateWordListRelations` 会先
`deleteModifiableRelationsByWordId(wordId, userId, includeSystem)` 清空该词在
**所有本人可修改词单**中的关系，再按 `targets` 重建，并 `recalcWordCount` 受影响词单。

**因此前端的硬约束（AC-08b）**：本页弹层只展示「当前词单」，提交时必须把
「该词在其它词单的现有关系」原样拼进 `targets`，否则会静默删掉那些关系。
拼装规则：

```
targets = 其它词单的现有关系（原样保留 wordListId + groupId）
        + 当前词单：勾选了 → { wordListId, groupId: 勾选行对应值 }
                    取消勾选 → 不加入 targets（= 移除）
```

### 已物理删除的接口（原 #014 新增，2026-11-11 下线）

`POST /api/wordlist/add-word`（纯追加语义）—— **已从后端与前端代码中完全移除**：
- 后端：`WordListController` 的 `/add-word` 端点、`WordListService.addWordToWordList()`、
  DTO `AddWordToWordListRequest` / `AddWordResult` 全部删除；
- 前端：`utils/api.js` 的 `wordlistApi.addWord()` 封装删除；
- **现状**：该 URL 返回 `404 Not Found`（已实测）。
- **为何不保留兼容期**：这是同一批交付内 `#014` 自己新增的接口，尚未对外发布、
  无第三方调用方（全仓 grep 确认无残留引用），保留只会造成两条并存的加词语义。

> **不受影响**：`POST /api/ai-dict/add-word` 是**另一个**接口，保留（见下节）。
> 两者名字相似但职责不同，不要混为一谈。

### `POST /api/ai-dict/add-word`（**保留新增**）
请求 `AiDictAddWordRequest`：
```json
{ "logId":"...", "selectedIndex":0, "wordListId":"...", "groupId":"..." }
```
响应 `Result<AiDictAddWordResult>`：
```json
{ "code":200, "message":"...", "data": { "wordId":"...", "needAudit": false } }
```
非管理员时 `wordId=null`、`needAudit=true`。

> **为什么 AI 加词不能改用 `update-relations`**：首页原本**没有** AI 加词能力——
> AI 结果需要先「写入词库」并拿到新生成的 `wordId`（这一步只有 `/api/ai-dict/add-word` 能做），
> 而且非管理员还要走「提交审核 + 持久化目标词单/分组」的分支。
> `update-relations` 只处理"已存在单词"的词单关系，无法承担入库与审核。
> 因此 AI 加词继续用本接口，两者的职责边界是：
> **`ai-dict/add-word` = AI 词入库 + 记目标（+分流审核）；`update-relations` = 已有词的词单关系全量替换。**

### `ai_dict_query_log` 新增列（迁移 V16）
`target_word_list_id BIGINT NULL`、`target_group_id BIGINT NULL`。
`AuditListResponse` 增加 `targetWordListId` / `targetGroupId`（字符串，ToStringSerializer，供审核接口回显，可空；从日志实体直接取，无额外查询）。
