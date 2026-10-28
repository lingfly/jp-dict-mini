# 变更提案：清理 `utils/api.js` 中已无调用方的接口封装

## 元信息

| 项 | 值 |
|----|----|
| 编号 | `#002` |
| 目录 | `changes/002-remove-unused-api/` |
| slug | `remove-unused-api` |
| 级别 | L2（原判 L1；用户追加"删除无用页面"，涉及 `app.json` 路由，升为 L2） |
| 状态 | approved |
| 负责人 | — |
| 日期 | 2026-10-22 |
| 涉及能力 | 无行为变更（`word-search` / `review-scheduling` / `wordlist-group` 的能力描述不受影响） |
| 关联 | 用户指令「去掉已经不再使用的接口」；后续追加「对应的无用页面一并删除」 |

## 1. 问题（Why）

**现在发生了什么？** `utils/api.js` 共导出 12 个接口组、88 个方法。用脚本对全部 29 个页面、`utils/wordlistGroup.js`、`utils/fsrs/dataSource.js`、`app.js` 做引用比对，**21 个方法在仓库内零调用方**。它们来自四次方向调整后未清理的残留：

1. **旧复习流程**（`/api/review/due*`、`/new`、`/select-new-words`）→ 已被 FSRS 流程取代；`app.json` 里对应的 `review-learn`、`new-learn`、`select-words` 三个页面至今是 65 行的空壳模板。
2. **被新接口取代**：`wordlistApi.getAvailable` / `getWords`、`wordlistGroupApi.list` / `getGroupWords` → 已由 `wordlistGroupApi.getGroupContent`、`getAllContent` 统一承接。
3. **AI 查词的分支实现**：同步 `query` 与 SSE `getStreamUrl` 都未接线，线上只走 `submitAsyncQuery` + `queryAsyncResult`。
4. **账号体系残留**：密码登录、验证码登录、注册、重置密码、登出共 6 个封装，仓库内没有任何登录页使用（`pages/reset-password` 也是空壳）。

**谁受影响？** 维护者。读 `api.js` 时无法判断哪个是现行契约，容易照着废弃接口写新代码。

**有多疼？** 低频但阴险：`specs/constitution.md` 规则要求"业务接口只在 `utils/api.js` 中声明"，于是废弃封装会被当成可用能力继续复用。

**证据**：静态扫描结果见 §10；`#001 design.md` 第 37 行已自行标注 `aiDictApi.query`「无调用方」。

## 2. 目标（What）

让维护者能在 `utils/api.js` 里**只看到仍在使用的接口**，从而不必猜哪条是现行契约。

## 3. 非目标（Out of Scope）★

- **不改任何请求行为**：URL、参数、超时、错误提示、重试逻辑一律不动。
- **不动 `utils/request.js`**：`TIMEOUTS.AI_QUERY` 与 `/api/ai-dict/query` 的超时规则属 `#001` 范围，即使删掉 `query()` 也保留（见 §6 风险）。
- **不清理 `pages/new-word-audit`** 里直接调用 `get/post` + 硬编码 URL 的越权写法（违反宪法第 14 行规则，但不属于"未使用"）。
- **不修** `pages/learn/learn.js:213` 跳转 `/pages/index/index`（该页不存在，属独立 bug，另立需求）。
- 明确**不改**的既有行为：`reviewApi.getNextWord` / `submitReview` / `getLearningStatus` 看似"旧接口"，但 `learn`、`profile`、`wordlist-detail` 仍在调用，**保留**。

> **2026-10-28 注记（#006）**：`pages/learn` 已按用户指令下线，`reviewApi.getNextWord` / `submitReview` 随之失去唯一调用方并删除，`reviewApi` 现仅剩 `getLearningStatus`（`profile` / `wordlist-detail` 仍在用）。上文为当时的判断，保留原文以便追溯。

## 4. 用户与场景

| 角色 | 场景 | 现在怎么做 | 期望怎么做 |
|------|------|-----------|-----------|
| 维护者 | 新增一个接口前先看 `api.js` | 需逐个全局搜索确认能否复用 | 文件里剩下的都在用，直接判断 |
| 维护者 | 改后端接口路径 | 不确定废弃项要不要同步改 | 无废弃项，不需要 |

## 5. 成功标准

| 类型 | 标准 | 怎么观测 |
|------|------|----------|
| 功能 | 删除后全仓库零 `undefined is not a function` | 微信开发者工具逐个页面点一遍，Console 无新增报错 |
| 结构 | `api.js` 只剩有调用方的导出 | 重跑 §10 的扫描脚本，未引用数为 0（`buildQueryData` 除外，见 §6） |
| 一致性 | 文件从 594 行降到 489 行 | `wc -l utils/api.js` |

## 6. 风险与未知

| 风险 / 未知 | 影响 | 处理方式 |
|------------|------|----------|
| `aiDictApi.buildQueryData` 外部零引用，但被 `submitAsyncQuery` 用 `this.buildQueryData` 调用 | 误删会导致 AI 查词整体挂掉 | **保留**，并在扫描白名单里注明 |
| 密码/验证码登录可能是"计划中"功能 | 删掉后若要恢复需重写约 40 行 | 已确认：只走微信静默登录，删除 |
| 删 `query()` 后 `request.js` 的 `TIMEOUTS.AI_QUERY` 分支失去实际入口 | 静态死代码，但不影响运行 | 本次不动（属 `#001`）；在 `#001` 归档时再评估 |
| `#001 design.md` 里的接口数量表（86 / 17 / 9 / 8 …）会失真 | 文档漂移 | 已同步更新为清理后计数（67）并加脚注 |
| 删除页面需同步 `app.json` 的 `pages`，漏改会白屏 | 编译报错或整包异常 | 改后校验：声明 25 个页面、每个页面 4 个文件齐全；全仓库无残留引用 |

**待确认问题**

- [x] **待确认** 密码 / 验证码登录（`sendCode`、`loginByPassword`、`loginByCode`、`register`、`resetPassword`、`logout`）是否还有规划？→ 用户答复：「已确定只走微信静默登录」，**全部删除**。
- [x] **待确认** `userApi.getProfile` / `updateProfile` 是否计划给"编辑资料"页用？→ 用户答复：「目前无'编辑资料'计划」，**全部删除**。
- [x] **待确认** 无用页面范围 → 用户答复：「对应的无用页面一并删除」，确认为 `review-learn`、`new-learn`、`select-words`、`reset-password` 四页（`app.json` 外零引用）。

## 7. 决策记录

| 日期 | 决策 | 理由 | 被否决的备选 |
|------|------|------|-------------|
| 2026-10-22 | 以「仓库内是否有调用方」为唯一判据，不按"新旧"判断 | `reviewApi` 三个方法虽标注为旧接口但仍在用，按新旧会误删 | 按注释里的"旧接口"字样批量删 |
| 2026-10-22 | 本次只删 `api.js`，不连带删空壳页面 | 页面删除涉及 `app.json` 与路由，是独立风险面 | 一次性大扫除 |
| 2026-10-22 | 经用户确认后扩范围：4 个空壳页面一并删除，级别由 L1 升 L2 | 用户原话「对应的无用页面一并删除」；页面已零业务代码，保留只会让 `app.json` 继续声明不存在的入口 | 仅保留 `app.json` 声明、不删文件 |
| 2026-10-22 | 删除页面时同步清理 `pages/` 下 4 个空目录（`agreement`/`common`/`correction`/`login`） | 目录内无任何文件，属历史删除残留；`login` 空目录亦印证"仅微信静默登录" | 保留空目录（git 不跟踪空目录，无意义） |

## 8. 验收摘要

- AC-01：`utils/api.js` 不再包含 §10 列出的 21 个方法。
- AC-02：`module.exports` 的 12 个组名全部保留（`reviewApi` 仍有 3 个在用方法）。
- AC-03：`grep -r "reviewApi.getDueCards\|...\|adminApi.updateDefinitionCorrection"` 全仓库无结果。
- AC-04：微信开发者工具编译通过，首页/词单/词单详情/学习/复习/AI 查词/设置/纠错 8 条主链路无 `undefined is not a function`。
- AC-05：`app.json` 的 `pages` 由 29 项降为 25 项，每一项对应的 `.js/.json/.wxml/.wxss` 四文件齐全。
- AC-06：`pages/review-learn`、`pages/new-learn`、`pages/select-words`、`pages/reset-password` 目录已不存在，且全仓库无对这四条路径的引用。

## 9. 审批记录

| 日期 | 审批人 | 审核内容 | 结论 | 备注 |
|------|--------|----------|------|------|
| 2026-10-22 | 用户 | proposal + 两处待确认 | 通过（扩范围） | 用户原话：「已确定只走微信静默登录；目前无"编辑资料"计划；对应的无用页面一并删除」 |

---

## 10. 删除清单（21 个，已执行）

| 组 | 方法 | 判定依据 |
|----|------|----------|
| `wordlistApi` | `getAvailable` | 零调用；现用 `getDefault` / `list` |
| `wordlistApi` | `getWords` | 零调用；现用 `wordlistGroupApi.getAllContent` / `getGroupContent` |
| `wordlistGroupApi` | `list` | 零调用；被 `getGroupContent` 取代 |
| `wordlistGroupApi` | `getGroupWords` | 零调用；被 `getGroupContent` 取代 |
| `fsrsApi` | `addCard` | 零调用；批量版 `addCards` 在用 |
| `fsrsApi` | `getCard` | 零调用 |
| `reviewApi` | `getDueCards` | 零调用；FSRS 版 `fsrsApi.getDueCards` 在用 |
| `reviewApi` | `getDueWords` | 零调用 |
| `reviewApi` | `getNewWords` | 零调用；对应空壳页 `new-learn` |
| `reviewApi` | `selectNewWords` | 零调用；对应空壳页 `select-words` |
| `aiDictApi` | `query` | 零调用；`#001 design.md` 已标注「无调用方」 |
| `aiDictApi` | `getStreamUrl` | 零调用；SSE 分支从未接线 |
| `authApi` | `sendCode` | 零调用（已确认：仅微信登录） |
| `authApi` | `register` | 零调用（已确认：仅微信登录） |
| `authApi` | `loginByPassword` | 零调用（已确认：仅微信登录） |
| `authApi` | `loginByCode` | 零调用（已确认：仅微信登录） |
| `authApi` | `resetPassword` | 零调用（已确认：仅微信登录） |
| `authApi` | `logout` | 零调用；登出由 `app.clearLoginInfo` 本地处理 |
| `userApi` | `getProfile` | 零调用（已确认：无改资料计划） |
| `userApi` | `updateProfile` | 零调用（已确认：无改资料计划） |
| `adminApi` | `updateDefinitionCorrection` | 零调用；审核页只用 list / detail / approve / reject |

**保留但易误判**：`aiDictApi.buildQueryData`（内部依赖）、`reviewApi` 三个在用方法、`wordApi.remove`（`home` / `word-detail` 的管理员删除在用）。

## 11. 任务清单

- [x] T1 删除 `wordlistApi.getAvailable`、`getWords`
- [x] T2 删除 `wordlistGroupApi.list`、`getGroupWords`，并同步文件头注释里的接口清单
- [x] T3 删除 `fsrsApi.addCard`、`getCard`
- [x] T4 删除 `reviewApi` 四个方法，并在组注释里写清"仅剩 3 个在用"
- [x] T5 删除 `aiDictApi.query`、`getStreamUrl`；`buildQueryData` 注释改为"submitAsyncQuery 内部使用"
- [x] T6 删除 `authApi` 六个方法、`userApi.getProfile` / `updateProfile`，并给两组补上"只走微信静默登录 / 资料只读"的注释
- [x] T7 删除 `adminApi.updateDefinitionCorrection`
- [x] T8 重跑扫描脚本：未引用数 1，仅剩设计内的 `aiDictApi.buildQueryData`
- [x] T9 更新 `#001 design.md` 接口数量表（88→67）并加脚注
- [x] T11 删除 4 个空壳页面 + `app.json` 四行声明 + `pages/` 下 4 个空目录
- [ ] T10 `node --check utils/api.js` 已过（全量 38 个 js 通过，`word-detail.js` 因被编辑器占用读取失败，未改动过）；**待用户在微信开发者工具编译确认**

## 12. 执行结果（2026-10-22）

| 项 | 清理前 | 清理后 |
|----|--------|--------|
| `utils/api.js` 方法数 | 88 | 67 |
| `utils/api.js` 行数 | 594 | 489 |
| `app.json` 页面数 | 29 | 25 |
| 零调用方的接口 | 21 | 0（`buildQueryData` 为内部依赖） |
| `pages/` 目录数 | 29 + 4 个空目录 | 25 |

## 自检

- [x] 问题描述里有事实（扫描数据），不是形容词
- [x] 非目标写了 5 条
- [x] 成功标准可被第三人独立判断
- [x] 待确认问题已列出，没有替用户做决定
- [x] 级别判断为 L1（不动行为、可独立回滚）
- [x] 状态是 `draft`，未开始写代码
