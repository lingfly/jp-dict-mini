# 后端接口清单（按页面 / 功能点）

> 整理时间：2026-10-21
> 依据：`utils/api.js` 中的接口定义 + 页面实际调用（行号取自当前代码）
> 范围：微信小程序端实际发起的所有后端请求（含直接调用 `utils/request` 的页面）

---

## 0. 请求层基础

- 所有请求统一经过 `utils/request.js`：
  - 拼接 `config.apiBaseUrl`，自动带 `Authorization: Bearer <token>`。
  - HTTP 401 时清 token → `app.autoWechatLogin()` 重新静默登录 → 自动重试同一请求（`utils/request.js:126-150`）。
  - 业务码非 200 时统一 `showToast(message)`，并上报微信实时日志。
  - GET 参数由 `get()` 拼到 query 上，`undefined / null` 参数会被过滤。
- 两处数据源封装（页面不直接调 `api.js`）：
  - `utils/wordlistGroup.js`：分组管理、「加入词单」；`USE_MOCK = false`，走真实接口。
  - `utils/fsrs/dataSource.js`：FSRS 复习流程；`USE_MOCK = false`，走 `fsrsApi`。

---

## 1. 全局 / 启动

| 接口 | 代码位置 | 使用场景 |
|---|---|---|
| `POST /api/auth/login/wechat` | `app.js:102` | 小程序启动静默登录、401 后自动重登；用微信 `code` 换 `token` |
| `GET /api/fsrs/due-count?endTs=` | `utils/fsrs/dataSource.js:210` ← `app.js:37` | 启动 / 回到词单页时刷新「复习」tabBar 角标 |

---

## 2. 查词 tab（`pages/home/home`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/user/learning-config` | `home.js:84`（onLoad/onShow）、`home.js:106` | 释义折叠开关、AI 查词剩余次数与额度、AI 模型与温度参数；AI 查词成功后刷新已用次数 |
| `GET /api/wordlist/default` | `home.js:142` | 取默认收藏夹 id（本地缓存），供「收藏」按钮使用 |
| `GET /api/word/search?key&page&pageSize` | `home.js:180` | 主搜索框「查词」/ 回车 / 点击最近搜索 |
| `GET /api/word/search?key&page&pageSize` | `home.js:1106` | 结果列表上拉「加载更多」 |
| `GET /api/auth/current-user` | `home.js:307` | 判断是否管理员（决定「更多」菜单是否显示「删除单词」） |
| `DELETE /api/word/{wordId}` | `home.js:334` | 管理员「删除单词」确认弹窗 |
| `GET /api/audio/base64?audioId=` | `home.js:417` | 点击发音喇叭播放读音（base64 本地缓存） |
| `GET /api/wordlist/list?mineOnly=true&wordId=` | `utils/wordlistGroup.js:415` ← `home.js:486` | 「加入词单」弹层：我的词单 + 分组 + 已加入位置 |
| `POST /api/wordlist/update-relations` | `utils/wordlistGroup.js:447` ← `home.js:678` | 「加入词单」弹层点「确定」：全量替换单词所属词单/分组 |
| `POST /api/ai-dict/query-async` | `home.js:718` | 普通查询无结果时点「AI 查词」，提交异步入队，拿 `logId` |
| `GET /api/ai-dict/query-result?logId=` | `home.js:788` | AI 查词结果轮询（2s/次，最多 150 次） |
| `POST /api/wordlist/favorite` / `unfavorite` | `home.js:832-833` | 单词卡「收藏 / 取消收藏」 |
| `POST /api/ai-dict/feedback/incorrect` | `home.js:892` | AI 结果「不符合预期」反馈 |
| `POST /api/ai-dict/feedback/correct` | `home.js:921` | AI 结果「符合预期」→ 加入待审核词库；带 `selectedIndex` |

---

## 3. 词单 tab（`pages/wordlist/wordlist`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/auth/current-user` | `wordlist.js:82` | 判断管理员（可管理非本人创建的系统预设词单） |
| `GET /api/wordlist/current` | `wordlist.js:101` | 顶部「正在学习」卡片；onLoad / onShow / 下拉刷新 / 切换后 |
| `GET /api/wordlist/categories` | `wordlist.js:114` | 分类筛选 chips、创建/编辑弹窗的分类 picker |
| `GET /api/wordlist/list?mineOnly\|favoriteOnly\|category\|keyword` | `wordlist.js:139` | 词单列表：我的 / 收藏 / 分类切换、关键词搜索 |
| `POST /api/wordlist/select` | `wordlist.js:196` | 菜单「设为当前学习词单」/ 切换学习词单 |
| `POST /api/wordlist/favorite-list` / `unfavorite-list` | `wordlist.js:316-317` | 菜单「收藏 / 取消收藏词单」 |
| `POST /api/wordlist/clear-current` | `wordlist.js:344` | 菜单「取消学习」（含确认弹窗） |
| `PUT /api/wordlist/update` | `wordlist.js:390` | 编辑词单弹窗保存（名称/描述/分类/是否公开） |
| `DELETE /api/wordlist/delete?wordListId=` | `wordlist.js:418` | 菜单「删除词单」 |
| `POST /api/wordlist/create` | `wordlist.js:515` | 右下角「+」创建词单弹窗提交 |

---

## 4. 词单详情（`pages/wordlist-detail/wordlist-detail`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/wordlist/default` | `wordlist-detail.js:84` | 判断是否默认收藏夹 → 决定排序（收藏夹 `addedAt desc`，其它 `kana asc`） |
| `GET /api/wordlist/detail?wordListId=` | `wordlist-detail.js:100` | 设置导航栏标题 |
| `GET /api/review/learning-status` | `wordlist-detail.js:111` | 「今日已选 n / 每日上限」显示、自动选词数量计算 |
| `GET /api/wordlist/all-content?wordListId&sort&order` | `wordlist-detail.js:137` | 全量分组 + 单词，渲染「未选 / 已选 / 全部」三个栏目 |
| `POST /api/fsrs/cards` | `wordlist-detail.js:544` | 底部「加入学习」：批量创建 FSRS 学习卡（幂等，已存在则跳过） |

---

## 5. 分组管理（`pages/wordlist-group/wordlist-group`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/wordlist/group-content?wordListId=` | `wordlistGroup.js:156` ← `wordlist-group.js:129` | 分组列表 + 未分组单词（含 wordCount） |
| `GET /api/wordlist/group-content?wordListId&groupId=` | `wordlistGroup.js:204` ← `wordlist-group.js:211` | 勾选分组时拉组内单词 id，参与「批量移动」 |
| `POST /api/wordlist/groups?wordListId=` | `wordlistGroup.js:246` ← `wordlist-group.js:494` | 「新建分组」弹窗（名称/标识色/`sortOrder`） |
| `PUT /api/wordlist/groups?wordListId&groupId=` | `wordlistGroup.js:266` ← `wordlist-group.js:544` | 分组「重命名」 |
| `PUT /api/wordlist/groups/sort-order?wordListId=` | `wordlistGroup.js:287` ← `wordlist-group.js:350` | 拖拽排序后「保存排序」 |
| `DELETE /api/wordlist/groups?wordListId&groupId=` | `wordlistGroup.js:308` ← `wordlist-group.js:652` | 批量「删除分组」 |
| `PUT /api/wordlist/word-group?wordListId&groupId=` | `wordlistGroup.js:351` ← `wordlist-group.js:604` | 「移动到分组 / 移出到未分组」 |
| `POST /api/wordlist/unfavorite`（循环单个） | `wordlistGroup.js:381` ← `wordlist-group.js:655` | 批量把单词「移出词单」（后端无批量删除接口） |
| 无接口（仅 mock） | `wordlistGroup.js:390` ← `wordlist-group.js:730` | 撤销操作；非 mock 时提示「后端暂不支持撤销」 |

---

## 6. 分组详情（`pages/wordlist-group-words/wordlist-group-words`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/wordlist/group-content?wordListId=` + `&groupId=` | `wordlist-group-words.js:75-76` | 分组头部信息（名称/颜色/词数）+ 组内单词 |
| `PUT /api/wordlist/word-group` | `wordlist-group-words.js:192` | 「移出分组」（移到未分组） |
| `PUT /api/wordlist/word-group` | `wordlist-group-words.js:250` | 「移动到分组」弹层确认 |
| `DELETE /api/wordlist/groups` | `wordlist-group-words.js:295` | 删除当前分组（可选保留单词） |
| `POST /api/wordlist/unfavorite`（循环） | `wordlist-group-words.js:303` | 「移出词单」 |
| `PUT /api/wordlist/word-group` | `wordlist-group-words.js:354` | 「添加单词」：从未分组批量加入本组 |
| `PUT /api/wordlist/groups` | `wordlist-group-words.js:423` | 分组重命名 / 改色 |
| 无接口（仅 mock） | `wordlist-group-words.js:461` | 撤销 |

---

## 7. 单词详情（`pages/word-detail/word-detail`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/user/learning-config` | `word-detail.js:56` | 释义默认展开 / 折叠 |
| `GET /api/wordlist/default` | `word-detail.js:73` | 默认收藏夹 id |
| `GET /api/wordlist/list?mineOnly=true&wordId=` | `word-detail.js:90` | 判断该词是否已在收藏夹（收藏按钮高亮） |
| `POST /api/wordlist/favorite` / `unfavorite` | `word-detail.js:123-124` | 「收藏 / 取消收藏」 |
| `GET /api/word/{wordId}` | `word-detail.js:147` | 详情正文（释义、例句、音调等） |
| `GET /api/auth/current-user` | `word-detail.js:200` | 管理员判定（删除入口） |
| `DELETE /api/word/{wordId}` | `word-detail.js:227` | 管理员删除单词 |
| `GET /api/audio/base64` | `word-detail.js:525` | 单词 / 例句发音播放 |
| `GET /api/wordlist/list?mineOnly&wordId=` | `word-detail.js:264`（经 `wordlistGroup.js:415`） | 「加入词单」弹层 |
| `POST /api/wordlist/update-relations` | `word-detail.js:464`（经 `wordlistGroup.js:447`） | 「加入词单」提交 |

---

## 8. 复习 tab（`pages/review-list/review-list`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/user/learning-config` | `review-list.js:72` | 复习时释义是否默认展开 |
| `GET /api/fsrs/due?endTs=` | `dataSource.js:138` ← `review-list.js:89` | 进入页面 / 下拉刷新 / 新词加入后（`reviewListChangedAt`）拉当天全部卡片，构建本地队列 |
| `POST /api/fsrs/review` | `dataSource.js:170` ← `review-list.js:348` | 评分按钮（忘记/模糊/认识/简单）：上报 `rating + FSRS card/log + responseTimeMs + clientRequestId` |
| `GET /api/fsrs/due-count?endTs=` | `dataSource.js:210` ← `review-list.js:179` | 今日待复习数、tabBar 角标（onShow 3s 去重） |
| `POST /api/word/batch` | `review-list.js:220` | 按批预取 20 个单词详情，避免逐词请求 |

补充说明：

- `/api/fsrs/review` 返回 `duplicated`（幂等重试）、`conflict`（跨设备冲突）时，页面以返回的 card 覆盖本地状态。
- 业务码 `3001`（单词已被删除/移出词单）时静默跳过该卡片，不弹错误。

---

## 9. 我的（`pages/profile/profile`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/auth/current-user` | `profile.js:50` | 头像 / 昵称、`userType === 1` 显示管理员入口 |
| `GET /api/review/learning-status` | `profile.js:64` | 已学词数 / 已掌握 / 每日新词统计 |

> 「退出登录」只做本地清理 + 自动重登（`profile.js:121`），未调用 `/api/auth/logout`。

---

## 10. 设置（`pages/settings/settings`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/user/learning-config` | `settings.js:40` | 进入页面回填全部配置 |
| `PUT /api/user/learning-config/daily-new-words` | `settings.js:70` | 「每日新词数量」输入保存（1-100） |
| `PUT /api/user/learning-config/voice-config` | `settings.js:84` | 「单词发音」开关 |
| `PUT /api/user/learning-config/collapse-definition-on-query` | `settings.js:99` | 「查词时释义折叠」开关 |
| `PUT /api/user/learning-config/collapse-definition-on-review` | `settings.js:114` | 「复习时释义折叠」开关 |
| `PUT /api/user/learning-config/ai-dict-config` | `settings.js:153` / `176` / `202` / `222` / `266` | AI 查词配置：模型选择、温度、思维模式、推理强度（每次改动四项全量提交） |

---

## 11. 学习情况（`pages/review-forecast/review-forecast`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/fsrs/due-forecast` | `review-forecast.js:91` | 未来 15 天（含今天）堆叠柱状图 + 今日图例（新学/复习/待复习/忘记/模糊） |

---

## 12. 新词审核（管理员，`pages/new-word-audit/new-word-audit`）

该页直接引用 `utils/request` 的 `get/post`，不经 `api.js`。

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/ai-dict/audit/list?status&page&size` | `new-word-audit.js:66` / `:95` | 待审核 / 不符合预期 / 未标记 / 已通过 / 已拒绝 五个 tab 首屏 + 上拉加载更多 |
| `POST /api/ai-dict/audit/approve` | `new-word-audit.js:238` | 采纳某个 `selectedIndex` 的 AI 结果 |
| `POST /api/ai-dict/audit/reject` | `new-word-audit.js:238` | 驳回该结果 |
| `POST /api/ai-dict/audit/approve-override` | `new-word-audit.js:206` | 「确认覆盖」：删除已存在单词的释义/例句后用 AI 数据替换 |

---

## 13. 纠错（用户侧）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `POST /api/correction/word`（form-urlencoded） | `correction-word.js:265` | 单词信息纠错提交（汉字/假名/音调/词性/备注） |
| `GET /api/correction/word/my` | `correction-my.js:110` | 「我的纠错」→ 单词纠错 tab |
| `PUT /api/correction/word/{correctionId}` | `correction-word-edit.js:245` | 我的纠错 → 详情 → 「修改」保存（仅 pending） |
| `DELETE /api/correction/word/{correctionId}` | `correction-my-word-detail.js:109` | 我的纠错 → 详情 → 「撤销纠错」 |
| `GET /api/word/{wordId}` | `correction-definition.js:29` | 释义纠错页加载原始释义 / 例句 |
| `POST /api/correction/definition` | `correction-definition.js:304` | 提交释义纠错（`items` + `remark`） |
| `GET /api/correction/definition/my` | `correction-my.js:129` | 「我的纠错」→ 释义纠错 tab |
| `GET /api/correction/definition/{id}` | `correction-my-definition-detail.js:37`、`correction-definition-edit.js:31` | 释义纠错详情 / 编辑页回填 |
| `PUT /api/correction/definition/{id}` | `correction-definition-edit.js:384` | 释义纠错「修改」保存 |
| `DELETE /api/correction/definition/{id}` | `correction-my-definition-detail.js:147` | 释义纠错「撤销纠错」 |

---

## 14. 纠错审核（管理员）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/correction/word/pending` | `correction-audit.js:37` | 单词纠错审核列表（onLoad / 返回刷新） |
| `POST /api/correction/{id}/approve`（form） | `correction-audit-detail.js:107` | 审核详情「采纳」（可同时修正汉字/假名/音调/词性） |
| `POST /api/correction/{id}/reject?reason=` | `correction-audit-detail.js:145` | 审核详情「驳回」（弹窗必填原因） |
| `GET /api/admin/correction/definition/pending` | `correction-definition-audit.js:24` | 释义纠错待审核列表 |
| `GET /api/admin/correction/definition/{id}` | `correction-definition-audit-detail.js:31` | 释义纠错详情（含原始释义对比） |
| `POST /api/admin/correction/definition/{id}/approve` | `correction-definition-audit-detail.js:138` | 「采纳」并真正写入 `word_definition` |
| `POST /api/admin/correction/definition/{id}/reject` | `correction-definition-audit-detail.js:183` | 「拒绝」（必填 `reviewComment`） |

---

## 15. 反馈（`pages/feedback/feedback`）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `POST /api/feedback` | `feedback.js:82` | 「提交反馈」tab：类型（bug / 建议 / 其他）+ 标题 + 内容，成功后跳列表 |
| `GET /api/feedback/my?pageNum&pageSize` | `feedback.js:113` | 「反馈列表」tab 首屏 |
| `GET /api/feedback/my?pageNum&pageSize` | `feedback.js:137` | 列表上拉加载更多 |
| `GET /api/feedback/my/{feedbackId}` | `feedback.js:163` | 点击条目进入「反馈详情」tab |

---

## 16. 旧学习页（`pages/learn/learn`，非 tabBar，已被 FSRS 复习页取代）

| 接口 | 代码位置 | 页面功能点 |
|---|---|---|
| `GET /api/review/next-word` | `learn.js:54` | 实时取下一个待学 / 待复习单词 |
| `GET /api/word/{wordId}` | `learn.js:106` | 取该单词详情 |
| `POST /api/review/submit` | `learn.js:141` | 提交 0-3 分评分（旧版 `score + responseTimeMs`） |

---

## 17. 无接口页面（空壳 / 未接后端）

- `pages/new-learn`、`pages/review-learn`、`pages/select-words`、`pages/reset-password`：空模板页面。
- `pages/login`：目录为空（登录统一走静默微信登录）。
- `pages/feedback-menu`：纯入口页。

---

## 18. 已定义但当前未被调用的接口

`utils/api.js` 中存在、项目内没有调用方：

| 分类 | 接口 |
|---|---|
| 词单 | `GET /api/wordlist/available`、`GET /api/wordlist/words`、`GET /api/wordlist/groups`（列表） |
| 分组 | `GET /api/wordlist/group-words` |
| FSRS | `POST /api/fsrs/card`（单个加卡）、`GET /api/fsrs/card/{wordId}` |
| 旧复习 | `GET /api/review/due-cards`、`GET /api/review/due`、`GET /api/review/new`、`POST /api/review/select-new-words` |
| AI 查词 | `POST /api/ai-dict/query`（同步版）、`GET /api/ai-dict/stream`（SSE，`getStreamUrl`） |
| 认证 | `/api/auth/send-code`、`/api/auth/register`、`/api/auth/login/password`、`/api/auth/login/code`、`/api/auth/reset-password`、`/api/auth/logout` |
| 用户 | `GET /api/user/profile`、`POST /api/user/profile` |
| 管理员 | `PUT /api/admin/correction/definition/{id}`（审核时直接改明细） |

---

## 19. 文档与代码不一致之处（建议同步）

- `API_PARAMS.md` 中的以下路径与代码不符：
  - `GET /api/word/detail/{wordId}` → 实际为 `GET /api/word/{wordId}`
  - `GET /api/audio/base64/{audioId}` → 实际为 `GET /api/audio/base64?audioId=`
  - `GET /api/wordlist/{wordListId}` → 实际为 `GET /api/wordlist/detail?wordListId=`
  - `GET /api/wordlist/{wordListId}/words` → 实际为 `GET /api/wordlist/words?wordListId=`（且当前未使用）
- `API_PARAMS.md` 仍把 `/api/review/*` 当作主流程，实际复习已切换到 `/api/fsrs/*`。

---

## 20. 统计

- 实际被调用的后端接口约 **68 个**（按 METHOD + 路径去重）。
- 其中 2 处无对应后端能力、由前端降级处理：
  - 分组撤销：无整体同步接口，非 mock 模式直接提示不可用。
  - 批量移出词单：无批量接口，循环调用 `POST /api/wordlist/unfavorite`。
