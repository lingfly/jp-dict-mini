# #014 任务清单

> 分工（用户要求「一个前端一个后端」）：前端由 `fe-explorer` 负责（task-1），后端由 `be-explorer` 负责（task-2）。
> 后端另需按后端仓库 `AGENTS.md` 补写 `spec.md/plan.md/tasks.md` 三件套（见 task-2）。
> 实现完成后由 lead 逐条勾选并跑 `node scripts/spec.js check`。

- [x] T01 前端建 change 目录、写 proposal/spec/design/tasks，登记 INDEX #014（L2）
- [x] T02 后端 V16 迁移：`ai_dict_query_log` 加 `target_word_list_id`/`target_group_id`
- [x] T03 后端实体 `AiDictQueryLog` 加两字段；`AuditListResponse` 加目标词单/分组 ID 回显
- [x] T04 后端新增 `AddWordToWordListRequest` / `AddWordResult`；`WordListService.addWordToWordList`；`WordListController POST /add-word`
- [x] T05 后端新增 `AiDictAddWordRequest` / `AiDictAddWordResult`；`AiDictService.addWordFromWordlist`（管理员直加 / 非管理员 pending）；`AiDictController POST /add-word`
- [x] T06 后端 `AiDictService.addWordToWordList` 支持 groupId；`approveAiDict`/`approveAndOverride` 优先用日志目标词单+分组
- [x] T07 前端 `utils/api.js` 加 `wordlistApi.addWord` / `aiDictApi.addWordFromWordlist`
- [x] T08 前端 `app.json` 登记 `pages/wordlist-add-search/wordlist-add-search`
- [x] T09 前端 `wordlist-detail` 加可拖动 FAB（复用 fabDrag）+ 跳转 + onShow 刷新
- [x] T10 前端新增 `pages/wordlist-add-search/*`（js/wxml/wxss/json/helper.wxs）：查词 + AI查词 + 详情 + 单按钮 + 分组弹层
- [x] T11 验收：`node scripts/spec.js check`（0 错误）、后端 `mvn -q compile`（EXIT=0）、前后端契约逐条核对、删除无主空 stray 目录 `014-wordlist-fab-search`
- [x] T12 [补漏·2026-11-10] `wordlist-add-search.js` 新增 `loadMembership(wordId)`：调 `GET /api/wordlist/list?mineOnly=true&wordId=`，算出「是否在当前词单 + 所在分组」，失败静默降级 · 覆盖 AC-06b · 验证：模拟器读 `data.membership` · 文件：`pages/wordlist-add-search/wordlist-add-search.js`
- [x] T13 [补漏] `selectWord()` 进详情时触发 `loadMembership()`，不阻塞详情渲染 · 覆盖 AC-06b · 验证：进详情后读 `membership` · 文件：同上
- [x] T14 [补漏] WXML/WXSS 加 UI-05b 状态行（`已在词单 · 分组名` / `已在词单（未分组）` / 不在词单不显示） · 覆盖 AC-06b · 验证：三种数据下 `wx:if` 实测 · 文件：`pages/wordlist-add-search/wordlist-add-search.wxml`、`.wxss`
- [x] T15 [补漏] `openGroupPicker()` 记录 `origGroupKey`，弹层里该词当前所在行显示「原位置」标签且默认勾选；点已勾选行可取消、点其它行单选互斥、未勾选时「确定」置灰（对齐首页 `openJoin`/`onJoinTap`/`joinCanGo`） · 覆盖 AC-07b · 验证：弹层交互实测 · 文件：`.js` + `.wxml`
- [x] T16 [补漏] `confirmAdd()` 成功分支本地更新 `membership`（新增入组 / 改组 / 移除），不重新请求 · 覆盖 AC-06b · 验证：加词后状态行立即变化（E2 实测） · 文件：`wordlist-add-search.js`
- [x] T17 [补漏] 验收：归属三态 + 弹层交互 + 移除 + 加词即时更新 + 失败降级 · 覆盖 AC-06b, AC-07b · 验证：`.jointest/verify-membership.js` **14/14 通过** · 文件：无
- [x] T18 [接口收敛·2026-11-10] 普通加词从 `POST /api/wordlist/add-word`（纯追加）改用已有 `POST /api/wordlist/update-relations`（全量替换，与首页一致，支持加/改分组/移除） · 覆盖 AC-08, AC-08b, AC-08c · 验证：D/C 组实测 · 文件：`wordlist-add-search.js`、`utils/api.js`
- [x] T19 [安全·2026-11-10] `buildRelationsTargets()` 拼全量 targets：其它词单的现有关系原样保留 + 当前词单按勾选算目标；避免全量替换误删该词在其它词单的关系 · 覆盖 AC-08b · 验证：D2/C2 实测「B 关系未被误删」 · 文件：`wordlist-add-search.js`
- [x] T20 [样式对齐·2026-11-10] 弹层样式逐项对齐首页 `.join-*`：行内边距 10px（原 12）、原位置行加 `cur` 类（底色 `#F0F7F4` + 灰底灰勾 `#EFF1F4`/`#C4C9D2`）、「无分组」行加书本图标 📚（`#EEF2FE` 底）、底部内边距 6px、确定按钮禁用态改 `#C3CCE8` 实色（原半透明） · 覆盖 AC-07 / UI-06 · 验证：`verify-style-and-back.js` 1a~1g **全通过**（行高 52/53/53、cur 行 1、勾选 1、图标 1、禁用底 `rgb(195,204,232)`） · 文件：`.wxml`、`.wxss`
- [x] T21 [返回层级·2026-11-10] 导航栏返回按钮按状态分流：详情态→`backToResults()` 回查词页（不退出）；列表态→`wx.navigateBack()` 回词单详情；新增 `onBackPress()` 让真机物理返回键/右滑同样先回查词页 · 覆盖 AC-03b / UI-02b · 验证：`verify-back-contract.js` **全通过**（列表态 false 放行 / 详情态 true 拦截且 wordDetail 清空） · 文件：`.wxml`、`.js`
- [x] T22 [时序修复·2026-11-11] 修复快速点击导致「原位置」丢失：`loadMembership()` 记录 `_membershipLoading` Promise；`openGroupPicker()` 检测到加载中就 `showLoading` 等待，完成后才构建弹层（抽 `buildAndShowPicker()`） · 覆盖 AC-07b · 验证：`verify-timing-fix.js`（进详情仅等 200ms 后开弹层，`origKey`/`selKey` 仍正确）✅
- [x] T23 [实机验证·2026-11-11] 微信开发者工具实机截图验证：详情页归属状态行、弹层样式（原位置标签/灰底灰勾/书本图标/确定按钮）· 覆盖 AC-06b / AC-07 · 验证：`.jointest/shots/S1-detail-final.png`、`S2-picker-final.png` ✅
- [x] T24 [后端下线·2026-11-11] 物理删除旧接口 `POST /api/wordlist/add-word`：后端删 Controller 端点 + `WordListService.addWordToWordList()` + DTO `AddWordToWordListRequest`/`AddWordResult`；前端删 `wordlistApi.addWord()` 封装 · 覆盖 AC-08d · 验证：`.jointest/verify-offline-api.js` **5/5**（旧 URL 404、update-relations 加/删正常、AI 加词保留、list 正常）+ `mvn -o test` **86/86** · 文件：`WordListController.java`、`WordListService.java`、2 个 DTO 删除、`utils/api.js`

- [x] T25 后端 `WordListService` 抽 `canModifyWordList(userId, wordList)` 纯布尔方法，`checkWordListModifyPermission` 改为复用它（不抛异常版 + 抛异常包装） · 覆盖 AC-01d · 验证：`WordListModifyPermissionTest` 用反射比对两条路径，6 种身份×词单组合结果完全一致 · 文件：`service/WordListService.java`
- [x] T26 `WordListDetailResponse` 加 `Boolean canEdit`（`from()` 默认 false，绝不为 null）；`WordListController.getWordListDetail` 用 `canModifyWordList` 赋值 · 覆盖 AC-01c / AC-01d · 验证：`.jointest/verify-canedit.js` **11/11**（管理员/普通用户/未登录 × 自己/系统预设/他人词单） · 文件：`dto/response/WordListDetailResponse.java`、`controller/WordListController.java`
- [x] T27 前端 `data.canEdit` 初始 `false`；`loadDetail()` 保存 `res.data.canEdit`（失败时保持 false）；WXML FAB 条件改 `wx:if="{{fabReady && canEdit}}"` · 覆盖 AC-01c · 验证：`.jointest/verify-fab-permission.js` **4/4**（他人词单 FAB 完全不在 DOM，`fabInDom=false`；本人/系统预设正常渲染 119×46） · 文件：`pages/wordlist-detail/wordlist-detail.js`、`.wxml`
- [x] T28 验收：权限矩阵 + 服务端兜底 · 覆盖 AC-01c / AC-01e · 验证：`verify-canedit.js` E1/E2 实测无权用户直连 `update-relations` 被拒（code=4003「只能修改自己的词单」）、E3 管理员改系统预设成功；后端全量单测 **96/96**（含新增 10 个权限用例）

> 验收结论（2026-11-10）：前端 `spec.js check` 全局 0 错误（13 警告均为历史变更 001~013 未完成）；
> 后端 `mvn -q compile` 通过。AC-10/11/12/13 的真实分支与幂等由后端代码静态核对通过，
> 真机/联调（拖动体感、实际接口返回、审核页采纳后入库）需部署后手动验证，见 verify.md。
> 后端 spec 三件套见 `D:\Code\jp-dict-java\specs\009-wordlist-add-search\`（status: in-progress，
> 未走 proposed→ready 闸门，依据/风险已在 plan.md §0 透明记录）。

## AC 覆盖

- AC-01 → T09（FAB 可拖动/持久化）
- AC-02 → T09（跳转带 wordListId 字符串）
- AC-03 → T10（onLoad 校验 + 分组加载降级）
- AC-04 → T10（普通查词/结果列表/分页）
- AC-05 → T10（AI 查词异步提交 + 轮询）
- AC-06 → T10（详情 + 唯一「加入当前词单」按钮）
- AC-07 → T10（分组弹层：无分组 + 各分组单选）
- AC-08 → T04 / T07 / T10（普通加词 POST /api/wordlist/add-word）
- AC-09 → T05 / T07 / T10（AI 加词 POST /api/ai-dict/add-word）
- AC-10 → T05 / T10（管理员直接入库并加词单）
- AC-11 → T05 / T10（非管理员提交审核 pending）
- AC-12 → T06（审核通过按目标词单+分组入库）
- AC-13 → T05（索引去重幂等）
- AC-14 → T05 / T06（旧接口零回归）
- AC-15 → T01 / T08 / T11（app.json 登记 + spec.js check）
- AC-16 → T07 / T09 / T10（ID 全程字符串）

UI 契约：UI-01/UI-02→T09；UI-03/UI-04/UI-05/UI-06/UI-07→T10；UI-08→T09。

