# #014 验收记录（2026-11-10）

> **本文件在 2026-11-10 联调后被重写。** 初版只做了静态核对，AC-01~AC-08 全标「代码通过 / 联调待测」；
> 本轮把后端跑到 8080、把开发者工具跑起自动化，**逐条改成实测结论**。
> 证据链：前端 `.jointest/fe-report.md`、后端 `.jointest/be-report.md`。

## 机器检查

| 项 | 命令 | 结果 |
|----|------|------|
| 前端规范体检 | `node scripts/spec.js check`（前端仓库根） | **0 错误**；12 警告均为历史变更 001~013 未完成任务/久未更新，与 #014 无关 |
| #014 单体检 | 同上 [1/4] | proposal/spec/design/tasks 齐全；16 条 AC 全被任务覆盖；11 个任务全部完成 |
| 路由一致性 | 同上 [4/4] | 25 个页面文件齐全（新页已登记且 5 文件齐全） |
| 前端语法 | `node --check` × js、`JSON.parse` × 3 个 json、WXS 合法 CommonJS | 本轮 Lead 独立复跑，全部通过 |
| 后端编译 | `mvn -o -q -DskipTests compile`（后端仓库根） | EXITCODE=0（含联调修复后重新编译） |
| 后端规范 lint | `python scripts/spec_lint.py 009` | EXIT=1，3 个「状态机闸门」错误（缺 approved_by/at/hash），结构/追溯/覆盖无错；按 never-ask 决策记录保留，未伪造证据 |

## 联调环境（本轮）

| 项 | 值 |
|----|----|
| 后端 | `http://localhost:8080`，Spring Boot 2.5.8 / JDK8，dev profile |
| 数据库 | MySQL84 本机，库 **`jp-dict`**（连字符），`root/test1234` |
| V16 迁移 | 已应用到本地库，`ai_dict_query_log` 两列就位 |
| 开发者工具 | Stable v2.01.2510290 / SDK 3.17.0，iPhone 12/13 (Pro) 模拟器 |
| 登录身份 | 管理员 `2086459012309630976`（user_type=1） |
| 自动化 | `miniprogram-automator@0.13.0` + `cli auto --auto-port 9432` |
| AI 日志 | 用 `.jointest/make-fixture.js` 造夹具（**未真调 AI**，避免耗配额/结果不可控） |

## AC 逐条结论

| AC | 结论 | 依据（实测） |
|----|------|------|
| AC-01 FAB 可拖动/持久化 | **通过（模拟器）** | `.fab-add-word` 实测 `position:fixed`、`z-index:150`、119×46px；`.bottom-bar` z-index=100 → FAB 层级更高。`p._fabDrag` 存在、`fabLeft/fabTop` 已持久化读出。拖动体感仍需真机 |
| AC-01b FAB 不与底部操作栏重叠 | **通过（修复后，2026-11-10 二轮）** | 修复前实测：FAB 底边 688 / 底部栏顶边 649 / 按钮区 661–707 → **重叠 39px**。修复后：FAB 底边 633 / 底部栏顶边 649 → **间距 16px，重叠 0**；`_bottomBarHeight=104` 量得正确。回归 `pages/wordlist` 的 FAB 未受影响 |
| AC-02 传 wordListId 字符串 | **通过** | 拦 `wx.navigateTo` 取得 `url=...?wordListId=2120078626299236352`；`typeof source === 'string'`；新页 `options.wordListId` 亦为 string |
| AC-03 waitForLogin + 分组降级 | **通过** | 新页拿到 `groups=[{id:"2120078626500562944", name:"前端联调A组"}]`，id 为 string；`statusBarHeight=47`。降级分支代码路径已核对（`wordlist-add-search.js:126-129`） |
| AC-04 普通查词/高亮/分页 | **通过** | 查「学習」→ `results=2, total=2`，`matchType=kanji_kana`，`_kanjiSegments` 非空（高亮生效），`word.id` 为 string |
| AC-05 AI 异步 + 轮询 | **通过（静态 + 服务端实测）** | 常量核对：2s 间隔 / 5min 上限 / 连续失败 3 次（`:574-576`）；`_logId`/`_fromAi`/`_resultIndex` 赋值已核对。AI 加词的服务端分支由后端夹具实测覆盖（见下 B1/B2/C1），未真调 AI |
| AC-06 详情仅一个按钮 | **通过** | `wx.createSelectorQuery` 实测：`.single-action-bar`=1、`.single-action-btn`=1（358×44）、`.action-btn`（收藏/反馈/纠错/删除）=**0** |
| AC-07 分组弹层 | **通过** | `groupOptions` 首行 `{key:'__none_group__', groupId:null}` + 其后各分组；默认 `selectedKey='__none_group__'`、`getSelectedGroupId()===null`；DOM `.prow`=2、`.prow.on`=1（单选） |
| AC-08 普通加词 | **通过（端到端）** | ① 选「无分组」→ toast「已加入词单」→ DB `word_count` 0→1、`word_list_item` 新增 `2086434905015383148@NULL`；② 同词改 A 组 → DB `group_id` NULL→`2120078626500562944`，词数不变（未重复插入）；③ 再加「天気」→ `word_count` 1→2 |
| AC-09 AI 加词 | **通过（服务端）** | 前端 `aiDictApi.addWordFromWordlist` 与后端 `AiDictAddWordRequest` 字段逐一对齐；后端实测 200 + 正确分流 |
| AC-10 管理员直接入库 | **通过（服务端）** | 实测 `needAudit=false`、`wordId` 为 string；DB：`word`+1、`word_definition`+1、`example_sentence`+1、`word_list_item` 新增且 group 正确、`status=auto`、两列 target 已写 |
| AC-11 非管理员 pending | **通过（服务端）** | 实测 `needAudit=true`、`wordId=null`；DB：`word` 表**零新增**、`status=pending`、`selected_indexes="0"`、两列 target 已持久化 |
| AC-12 审核按目标词单+分组入库 | **通过（服务端，Lead 独立复跑）** | 带 target 的 pending → approve → `word_list_item` 落在**目标词单+目标分组**，**默认收藏夹命中 0**；无 target（首页旧流程）→ 落**提交人默认收藏夹**，零回归 |
| AC-13 幂等 | **通过（修复后）** | 初次实测**失败**（重复提交返回 3003 而非静默忽略），已修 `AiDictService.addWordFromWordlist`（把索引去重移到终态校验之前，与 `markCorrect` 对齐）；修复后复测：第 2/3 次均 `code:200, wordId:null, needAudit:false`，且 DB 只写 1 次 |
| AC-14 旧流程零回归 | **通过** | `feedback/correct` 行为不变（`status=pending`、两列 target 仍 NULL、不写 `word`）；`audit/reject`、`approve-override`、`all-content` 均实测正常 |
| AC-15 app.json + spec check | **通过** | 新页已登记；`spec.js check` 0 错误、25 页齐全、5 文件齐全 |
| AC-16 ID 全字符串 | **通过（全链路实测）** | `typeof` 实测：`data.wordListId`/`word.id`/`wordDetail.word.id`/`groupOptions[].groupId`/`getSelectedGroupId()` 均为 string 或 null；后端所有出参 `ToStringSerializer`；A8 用 19 位「末位非 256 倍数」的 ID 验证过精度（`2086446180801937921` 回显逐字一致） |

## 前后端契约一致性（联调实测）

| 契约 | 结论 |
|------|------|
| `POST /api/wordlist/add-word` body `{wordId, wordListId, groupId}` | 一致；响应 `{wordId(string), added, groupIdUpdated}` |
| `POST /api/ai-dict/add-word` body `{logId, selectedIndex, wordListId, groupId}` | 一致；响应 `{wordId(string|null), needAudit}` |
| `data.needAudit` ↔ 前端提示分支 | 一致（true→「已提交审核…」，false→「已加入词单」） |
| `groupId: null`（无分组） | 一致，落库 `group_id=NULL`；前端 `getSelectedGroupId()` 返回 `null` 而非 `"null"` |
| 所有 ID 出参为字符串 | 一致 |
| 业务错误码走 `Result{code,message}` | 一致（前端 `request.js` 依赖 `code !== 200` 判失败） |

## 联调中发现的问题

### 已修复

**#1（P1，契约偏差）管理员分支幂等语义不符 AC-13**
- 现象：管理员首次加词后日志置 `auto` 终态，重复提交同一索引返回 `code:3003` 而非静默忽略 →
  前端提示「操作失败」而词其实已加入，**提示与实际相反**。数据本身安全（不重复写库）。
- 根因：`AiDictService.addWordFromWordlist` 状态校验（旧 `:804`）早于索引去重（旧 `:812`）。
- 修复：把索引去重提到终态校验之前，与同文件 `markCorrect`（先去重 `:696`、后置状态 `:727`）对齐。
- 复测：第 2/3 次提交均 `200 + wordId:null + needAudit:false`，DB 只写 1 次。**已通过**。

### 未修复（需用户决策，未擅自改）

**#2（P1，既有缺陷，非 #014 引入）AI `conjugations` 不完整时整单报 1000 回滚**
- 根因：`conjugation` 表 **28/28 列全 NOT NULL 且无默认值**，而 `buildConjugationEntity` 只填 AI 实际返回的形态。
- 归因证据：用同一份「部分形态」夹具打**旧接口** `feedback/correct` 同样 1000 → 不是 #014 引入。
- 但 #014 的 AI 加词是主路径，命中概率更高。
- 影响：真实 AI 偶尔少返回某个活用形态时，用户加词会整单失败。
- 建议：`buildConjugationEntity` 对缺失形态填空串，或迁移放宽列约束。**属独立变更，不在 #014 范围。**

**#3（P2，风险）非管理员分支不校验 selectedIndex 越界**
- 现象：普通用户提交 `selectedIndex:99` → 落 `pending + selected_indexes=99`；管理员 approve 恒报「索引无效」→
  审核队列出现**永远无法采纳的死单**。spec 未要求非管理员校验，不算违约，属可用性风险。
- 建议：非管理员分支也校验索引范围。

## 二轮修正（2026-11-10，用户反馈）

### 修正 1：FAB 与底部操作栏重叠（已修，AC-01b）
- **用户反馈**：「按钮位置要上移，不能和下方按钮重叠」。
- **实测复现**：FAB 底边 688px，底部操作栏顶边 649px，按钮区 661–707px → **重叠 39px**，
  压住「顺序 / 随机 / 今日待选」三个按钮。
- **根因**：`pages/wordlist-detail` 调 `createFabDrag(..., 24)` 传了**固定 24px** 底部留白。
  这个 24 是照搬 `pages/wordlist`（该页无底部操作栏，容器的 padding-bottom 已由 wxss 补偿），
  但详情页底部栏实测 **104px** 高，24px 完全不够。
- **修复**：
  1. `utils/fabDrag.js` 的 `marginBottom` 支持传**函数**（动态取值）；新增 `relayout()` 导出，
     在「用户未手动拖过」时按新留白重算默认位置，拖过则只做边界校正。
  2. `pages/wordlist-detail` 改为 `() => this._bottomBarHeight + 16`，
     并在 `onReady` 与 `loadLearningStatus()` 完成后调 `measureBottomBar()` 量真实高度再 `relayout()`。
     分两处量是因为底部栏文案会随 `learningStatus` 变化（「今日待选 N/20」↔「加入学习 N/20」），高度可能变。
- **验证**：修复后 FAB 底边 633 / 底部栏顶边 649 → **间距 16px、重叠 0**；
  `_bottomBarHeight` 量得 104。`pages/wordlist` 回归通过（FAB 存在、位置在视口内、`relayout` 已暴露）。
- **附带修掉的闪烁**：`_bottomBarHeight` 初值为 0，构造时算出的默认位置偏低，
  实测 t=420~480ms 两帧 top=650（底边 696，压在栏上 47px），约 120ms 可见闪烁。
  已改用 `fabReady` 门闩：WXML 加 `wx:if="{{fabReady}}"`，**量到底部栏真实高度后才渲染按钮**，
  并提供「量不到就退化渲染」的兜底。复测从第 0 帧起位置即为 587（正确），压在栏上的采样数 = 0。
- **注意**：老用户本地可能存有修复前的旧位置（`wordlistDetailFabPos_v1` = 642），
  该值会被 `clampPosition()` 按新留白校正到合法范围，不需要额外迁移。

### 待确认 2：加入词单是否有「记住上次分组」（当前**没有**）

- **用户提问**：「加入词单有记忆上次加入吗」。
- **当前行为（代码确认）**：**没有记忆**。
  - `openGroupPicker()` 每次都显式 `groupSelectedKey: NONE_GROUP_KEY`（`wordlist-add-search.js:375-383`），
    即每次打开弹层都强制回到「无分组」。
  - 全仓 `setStorageSync` 的 key 只有 `defaultWordListId`（词单详情页缓存）和 `userInfo`，
    没有任何与「上次分组」相关的持久化。
  - 也没有内存态复用（`data.groupSelectedKey` 每次被重置）。
- **是否要加，需要你定**（这是产品决策，我不擅自决定）：
  - 选项 A：记住「上次选的分组」全局（跨词单）—— 简单，但隔壁词单的分组 ID 不适用，
    需要按「词单维度」存或做归属校验。
  - 选项 B：按词单记住（key 带 wordListId）—— 更符合直觉，存储略多。
  - 选项 C：不记忆，保持每次「无分组」—— 当前行为，最可预测。
  - 若采纳 A/B，还需明确：记忆失效条件（分组被删了怎么办）、是否也只记「无分组」这一选择。
  - **结论（2026-11-10）**：用户选 **B（按词单分别记住）**，已作为 `#015` 实施并验收通过。

### 修正 3：看不到单词当前在不在词单 / 在哪个分组（已修，AC-06b / AC-07b / AC-08b）

- **用户反馈**：「现在不能看到单词当前在不在词单、在哪个分组」，场景是「加入当前词单时」。
- **定性**：属 `#014` **本应包含但漏掉**的范围（不是新需求），故不新建 change，直接补进本变更。
- **根因**：新页 `wordlist-add-search` 从未请求过归属信息；
  而首页 `pages/home` 的「加入词单」早已具备该能力（`utils/wordlistGroup.js#fetchJoinLists`
  返回 `containsWord` / `groups[].containsWord`）。
- **修法**：复用首页同款数据源与交互形态：
  1. 详情页按钮上方显示归属状态行（`已在词单 · 分组名` / `已在词单（未分组）` / 不在词单则不显示）；
  2. 弹层改为首页形态：标题「加入词单」+ 副标题「原位置已勾选 · 再点一次可取消」+
     该词当前所在行显示「原位置」并默认勾选 + 点已勾选可取消 + 单选互斥 + 未勾选时「确定」置灰；
  3. 加词成功后**本地即时更新**状态行（不发二次请求）。

### 修正 4：普通加词接口收敛到 update-relations（2026-11-10）

- **用户决定**：「新页普通加词改用 update-relations，但原来是没有 AI 加词的，所以 AI 加词接口要保留」。
- **改动**：普通加词不再调 `POST /api/wordlist/add-word`（纯追加语义，做不到移除），
  改用已有 `POST /api/wordlist/update-relations`（全量替换，与首页完全一致，支持加/改分组/移除）。
  `wordlistApi.addWord` 保留但标注待下线（新代码不再使用）。
  `POST /api/ai-dict/add-word` **保留**——AI 词需先入词库拿到 wordId、且非管理员要走审核分支，
  这是 `update-relations` 无法承担的（详见 spec.md 数据契约的说明）。
- **⚠️ 顺带发现并规避的数据事故风险**：
  `update-relations` 会**先清空该词在所有本人可修改词单里的关系**再按 targets 重建，
  而本页弹层只展示当前词单。实测：词同时在 A、B 时只传 `targets=[{A}]`，
  **B 的关系被静默删除**。
  因此新增 `buildRelationsTargets()`：把「其它词单的现有关系」原样拼进 targets。
  回归用例 D2/C2 专门守这条（改分组、移除之后 B 仍必须存在）。
- **验证**：`.jointest/verify-membership.js` → **14/14 通过**
  （A1~A3 归属三态、B1~B4 弹层交互、D1~D3 全量替换安全、C1~C2 移除、E1~E2 即时更新）。

### 开发中修掉的一个自身缺陷（记录备查）

第一版把「#015 记忆值」也当成初始勾选，同时按「点已勾选 = 取消」处理 →
用户点那个默认项时反而取消勾选，导致 `targets=[]`、什么都没提交（表现为"点了确定但没加进去"）。
已改为：**「原位置勾选」与「记忆预选」分开**——
记忆只在"该词不在词单"时做预选，`origGroupKey` 只标记真实所在行。

### 修正 5：弹层样式逐项对齐首页（2026-11-10）

- **用户反馈**：「样式也要和首页加入词单一样」。
- **逐项对齐清单**（`.jointest/verify-style-and-back.js` 实测）：

| 项 | 首页值 | 本页改后 | 实测结果 |
|---|---|---|---|
| 行内边距 | `10px 16px` | `10px 16px`（原 12px） | 行高 52 / 53 / 53 ✅ |
| 原位置行底色 | `.jrow.last` → `#F0F7F4` | `.prow.cur` → `#F0F7F4` | cur 行数 = 1 ✅ |
| 原位置勾选圈 | `.jrow.cur .jradio` → 灰底灰勾 `#EFF1F4`/`#C4C9D2` | 同 | ✅ |
| 「无分组」行图标 | 书本图标 📚 + `#EEF2FE` 底 | 同 | 图标数 = 1 ✅ |
| 原位置标签 | `.jlast-tag` | `.porig-tag` | 渲染 40×16px ✅ |
| 底部内边距 | `.join-f` → `6px 16px 4px` | 同（原 10px） | ✅ |
| 确定按钮禁用态 | `.join-go.disabled` → `#C3CCE8` 实色 | 同（原 `opacity:.5`） | `rgb(195,204,232)` ✅ |

### 修正 6：返回层级（2026-11-10）

- **用户反馈**：「从单词详情返回应该先返回到查词页，再返回才到单词列表」。
- **根因**：规格 `UI-02` 当初写的就是「返回按钮 `wx.navigateBack`」（写错了），
  实现照做 → 详情态点返回会直接退出本页回到词单详情，跳过查词页。
- **修法**（对齐首页 `pages/home` 的 `nav-back-btn`）：
  - 导航栏按钮：`wordDetail` 存在 → `backToResults()`（清空详情 + 恢复滚动位置，不退出）；
    否则 → `wx.navigateBack()`；
  - 新增 `onBackPress()`：详情态返回 `true` 拦截默认返回并回到查词页；列表态返回 `false` 放行。
    这样真机物理返回键 / 右滑返回也是同一套语义。
- **验证**：`.jointest/verify-back-contract.js` **全通过**
  - 列表态 `onBackPress()` 返回 `false`（放行 → 回词单详情）；
  - 详情态返回 `true` 且 `wordDetail` 被清空、页面栈深度不变（没退出页面）。

> **测试环境限制（如实记录）**：本轮自动化**无法**用「观察页面栈回退」来验证 `navigateBack`，
> 因为**模拟器的 `navigateBack` 恒失效**——回调返回 `navigateBack:ok` 但页面栈不变
> （对照实验确认：栈深 1 和 2 都不生效；而 `navigateTo` 正常）。
> 故改用**代码契约**验证（`onBackPress` 返回值 + `wordDetail` 状态变化），
> 并在规格里把行为写死。真机上仍需手测一次「详情 → 查词页 → 词单详情」的返回顺序。

### 修正 7：开发者工具实机验证 + 时序缺陷修复（2026-11-11）

**用户要求**：「开发者工具验证」。以下为在微信开发者工具 Stable 2.01.2510290 中的实测结果。

**截图证据**（`.jointest/shots/`）：

| 图 | 内容 | 结论 |
|---|---|---|
| `S1-detail-final.png` | 单词详情页 | 按钮上方正确显示 `已在词单 · 动词`（分组名为主色绿）✅ |
| `S2-picker-final.png` | 分组选择弹层 | 标题`加入词单` + 副标题`原位置已勾选 · 再点一次可取消`；`无分组`行带 📚 图标；`动词`行浅绿底 + 绿色`原位置`标签 + 灰底灰勾；`名词`/`形容词`白底空心圈；底部`确定`主色按钮 ✅ 与首页视觉一致 |

**实机验证中发现并修掉一个时序缺陷**（自动化用例未覆盖到）：

- **现象**：进入详情后**立即**（约 200ms 内）点「加入当前词单」，弹层里 `origGroupKey=null`——
  「原位置」标签消失、默认勾选退化成记忆值（`__none_group__`）。
- **根因**：`loadMembership()` 是异步网络请求，`openGroupPicker()` 读 `this.data.membership` 时它还没回来，
  `m.loaded=false` → 判定为"不在词单"。
- **触发条件**：网络慢、或用户手快。真实存在，不是测试假象。
- **修法**：`loadMembership()` 记录进行中的 Promise 到 `this._membershipLoading`；
  `openGroupPicker()` 若检测到它存在，则 `showLoading` 等待其完成后才真正构建弹层
  （同步主体抽成 `buildAndShowPicker()`）。
- **验证**：`.jointest/verify-timing-fix.js` —— 进详情后仅等 200ms 就开弹层，
  最终 `origKey`/`selKey` 仍等于「动词」组、`canConfirm=true` ✅

> **教训**：异步数据 + 用户点击之间的竞态，靠"数据加载完再测"的用例永远测不出来。
> 已把该场景固化进 `verify-timing-fix.js` 作为回归用例。

**其他实机观察**：

- 控制台有 `selectable` 属性废弃警告，来源是详情页正文的 `<text selectable>`。
  该写法**照搬自首页** `home.wxml`（两页完全一致），属既有历史遗留，非本次引入。
  为保持"与首页一致"本次不改；如需清理应两页同批处理，另开一条变更。
- 端到端数据链路正常：`GET /api/wordlist/list?mineOnly=true&wordId=` 返回的
  `containsWord` / `groups[].containsWord` 与 DB 实际关系一致。

**截图获取方式备注（给后续同事）**：本环境 `mp.screenshot()` 会挂死并导致后续
`evaluate` 超时（截图后模拟器被重置回 `home` 页）。可行做法是：
先用 automator 把界面导航到目标状态并让它停在屏幕上，
再用 Windows 系统截图（`Graphics.CopyFromScreen`）抓开发者工具窗口。

### 修正 9：FAB 加权限门槛（2026-11-11，AC-01c/01d/01e）

- **用户要求**：「只有用户有权限编辑词单的情况才显示添加单词按钮」。
- **原缺陷**：`#014` 原规格漏写 FAB 的权限前提，实现只判断 `fabReady`（底部栏是否量到高度），
  于是**他人创建的公共词单也显示「＋ 添加单词」**；用户点进去查词、选分组，
  提交时才被后端 `checkWordListModifyPermission` 拒绝（`FORBIDDEN`「只能修改自己的词单」）。
- **实现方案（后端权威判定，前端零权限逻辑）**：

| 层 | 改动 |
|---|---|
| `WordListService` | 抽出 `public boolean canModifyWordList(userId, wordList)`（纯判定，不抛异常）；<br>`checkWordListModifyPermission` 改为「判空 + 调 `canModifyWordList` + 抛异常」的包装 |
| `WordListDetailResponse` | 加 `Boolean canEdit`；`from()` 里默认 `false`（永不为 null） |
| `WordListController.getWordListDetail` | `response.setCanEdit(wordListService.canModifyWordList(userId, wordList))` |
| `wordlist-detail.js` | `data.canEdit` 初始 `false`；`loadDetail()` 保存 `res.data.canEdit`；请求失败保持 `false` |
| `wordlist-detail.wxml` | FAB 条件 `wx:if="{{fabReady && canEdit}}"` |

- **为何不让前端自己算**：前端要复刻「系统预设 + 管理员」规则，与后端提交校验形成两份实现，
  将来规则一变（如加协作者）必然漂移。抽出 `canModifyWordList` 后，**显示判定与提交校验共用同一份代码**。
- **验证 1：后端权限矩阵** `.jointest/verify-canedit.js` → **11/11**

| 身份 | 自己的词单 | 系统预设(user_id=null) | 他人词单 |
|---|---|---|---|
| 管理员 | `canEdit=true` | `canEdit=true` | `canEdit=false` |
| 普通用户 | `canEdit=true` | `canEdit=false` | `canEdit=false` |
| 未登录 | 接口 401（不返回 canEdit，前端降级不显示） | — | — |

- **验证 2：前端 FAB 实际显隐** `.jointest/verify-fab-permission.js` → **4/4**

| 场景 | canEdit | FAB 是否在 DOM |
|---|---|---|
| 管理员 → 自己的词单 | true | ✅ 在（119×46px） |
| 管理员 → 他人词单 | false | ✅ **完全不在 DOM**（`fabInDom=false`，不占位） |
| 管理员 → 系统预设词单 | true | ✅ 在（119×46px） |
| 源码默认值 | — | ✅ `canEdit: false` + `wx:if="{{fabReady && canEdit}}"`（无先显示后消失） |

- **验证 3：AC-01e 服务端兜底**（前端隐藏不是安全边界）
  - 普通用户直接调 `POST /api/wordlist/update-relations` 改管理员词单 → `code=4003`「只能修改自己的词单」✅
  - 普通用户改系统预设词单 → `code=4003` ✅
  - 管理员改系统预设词单 → `code=200` ✅
- **验证 4：单元测试** 新增 `WordListModifyPermissionTest`（10 个用例），
  其中 `canEditMatchesSubmitCheck` 用反射比对「显示判定」与「提交校验」在 6 种身份×词单组合下**结果完全一致**，
  锁定 AC-01d 的契约不漂移。后端全量 `mvn -o test` → **96/96**。

### 修正 8：后端物理删除旧接口（2026-11-11）

- **用户要求**：「把下线的接口在后端也去掉」。
- **删除清单**：

| 层 | 文件 | 动作 |
|---|---|---|
| Controller | `WordListController.java` | 删 `@PostMapping("/add-word")` 端点 + 方法 + 其 javadoc；删 `AddWordToWordListRequest` import |
| Service | `WordListService.java` | 删 `addWordToWordList(Long, Long, Long, Long)` 方法（原 988–1038 行） |
| DTO | `AddWordToWordListRequest.java` | **整文件删除** |
| DTO | `AddWordResult.java` | **整文件删除** |
| 前端 | `utils/api.js` | 删 `wordlistApi.addWord()` 封装 |

- **删除前的前置核查**（避免删出问题）：
  - 全仓 grep 确认 `AddWordToWordListRequest` / `AddWordResult` **无其它引用**；
  - 确认 `AiDictService` 内有**同名私有方法** `addWordToWordList(Long, Long)` / `(Long, Long, Long)`
    （约 1317/1327 行）—— 那是 AI 加词内部逻辑，**必须保留**，与本次删除的同名方法无关；
  - 确认 `AiDictController` 的 `/add-word` 与 `AiDictAddWordResult` 是**另一个接口**，保留；
  - 确认 mapper 方法（`selectByListIdAndWordId` / `batchUpdateGroupId` / `incrementWordCount`）
    在其它业务路径仍被使用，**不删**。
- **验证**（`.jointest/verify-offline-api.js`，5/5 通过）：

| 项 | 结果 |
|---|---|
| `POST /api/wordlist/add-word` | `HTTP 404 Not Found`（含 `"path":"/api/wordlist/add-word"`）✅ |
| `POST /api/wordlist/update-relations` 加词+指定分组 | `code=200`，DB 分组正确 ✅ |
| `POST /api/wordlist/update-relations` 移除 | `code=200`，关系已清 ✅ |
| `POST /api/ai-dict/add-word`（AI 加词） | 未 404（返回业务码 3001「查询记录不存在」，证明路由存活）✅ |
| `GET /api/wordlist/list` | `code=200` ✅ |

- **编译与回归**：`mvn -o -q -DskipTests package` → `EXIT=0`；
  `mvn -o test` → **86/86 通过**；`WordListService` 无遗留未使用 import。

## 未完成 / 需人工

- **真机手测**：FAB 长按拖动体感 + 位置跨冷启动持久化（key `wordlistDetailFabPos_v1`）、音频播放。
  （注：FAB 与底部栏的间距已在模拟器量准，但**不同机型底部栏真实高度不同**，建议真机再确认一次。）
- **真实 AI 端到端**：`query-async` → `add-word` 全链路（本轮用夹具覆盖服务端分支，未真调 AI）。
- 后端 V16 迁移在**部署时**需按顺序执行（本地已手工应用，未走 Flyway）。
- 后端 3 个状态机闸门 lint 错误（缺人工批准留痕）：本会话 never-ask，未伪造证据；
  若需闸门全绿，须由人补「批准 009」并跑 `spec_approve.py`。

## 自动化环境说明（给后续同事，避免重复踩坑）

1. `mp.evaluate` **必须传可调用的表达式字符串**：`'() => 42'` ✅，`'1+1'` ❌。
   用 `pwsh -Command "node -e \"...\""` 内联写会被剥引号 → 假 timeout，**必须写成独立 `.js` 文件**。
2. `page.data()` / `page.$()` / `mp.screenshot()` 及原始 `Page.*` 协议**全部 timeout**（webview 通道不通）；
   但 `mp.evaluate('() => getCurrentPages()[n].data')` 与 `wx.createSelectorQuery` 完全可用。
3. **一次 timeout 会挂死整条连接乃至 devtools ws 端点**；挂了就新起 node 进程 + 新连接，
   连 `connect` 都不通时 `cli close --project` 后重新 `cli auto`。
4. 模拟器在**深栈**上 `navigateTo`/`navigateBack` 会**静默卡住**（无回调、无异常）；
   用 `wx.reLaunch` 把目标页变成栈底即可绕开。**这是 DevTools 的问题，不是 App bug**
   （已用对照实验证明：栈底跳转 699ms 成功，深栈同调用永远不跳）。
5. 模拟器里 `navigateTo` 的 `success`/`fail` 回调**从不触发**，判跳转只能轮询 `getCurrentPages()`。

## 状态机与流程说明

前端 `status: verified`（本轮联调完成后）。后端 `specs/009-*` 保持 `in-progress`
（真实 AI 端到端与单测未做，但接口层已全部实测）。
最初「后端未先写 spec」的质疑已纠正：后端已按后端 `AGENTS.md` 补齐 `spec.md/plan.md/tasks.md` 三件套，
并把「未停在 proposed 闸门」的用户指令依据、与后端章程的有意偏离、风险、机器闸门预期报错
全部透明记录在 `plan.md §0`，未伪造任何批准证据。
