# 变更提案：AI 查词审核接口收进 `utils/api.js`

## 元信息

| 项 | 值 |
|----|----|
| 编号 | `#007` |
| 目录 | `changes/007-ai-audit-api-encapsulation/` |
| slug | `ai-audit-api-encapsulation` |
| 级别 | L1 |
| 状态 | approved |
| 负责人 | 用户 + AI |
| 日期 | 2026-10-28 |
| 涉及能力 | 无行为变更（接口声明位置调整，`pages/new-word-audit` 的可观测行为不变） |
| 关联 | `#006` 遗留问题；`TODO.md` 20261028 第 1 条；宪法 C-01 |

## 1. 问题（Why）

**现在发生了什么？** `pages/new-word-audit/new-word-audit.js` 从 `utils/request.js` 直接取底层 `get` / `post`，并在页面里硬编码 4 条 URL：

| 行 | 调用 |
|----|------|
| 66、95 | `get('/api/ai-dict/audit/list')` |
| 206 | `post('/api/ai-dict/audit/approve-override')` |
| 235–238 | `post('/api/ai-dict/audit/approve' \| '/api/ai-dict/audit/reject')` |

其余页面一律走 `utils/api.js` 的域封装（`wordApi.search`、`fsrsApi.submitReview` 等）。宪法 **C-01** 明确：业务接口只在 `utils/api.js` 声明并按域导出，页面里禁止出现硬编码 URL。

**谁受影响？** 维护者。

**有多疼？** 低频但会累积：① 想知道「谁在调 `/api/ai-dict/audit/list`」只能全仓库 grep；② `api.js` 里查不到这 4 个能力，读代码会低估系统能力；③ `#002` 那种「零调用方」扫描以 `api.js` 导出名做，绕过声明的接口永远扫不到——`#006` 下线 `pages/learn` 时就是靠反查页面才发现两个旧接口的唯一调用方。

**证据**：`pages/new-word-audit/new-word-audit.js:3` 的 `require('../../utils/request')`；同文件 66/95/206/235 行的字面量路径。

## 2. 目标（What）

> 一句话：让**维护者**在 `utils/api.js` 里就能看到 AI 查词审核的全部 4 个接口，页面不再出现任何 URL 字符串，从而让「系统有哪些接口」只有一个事实来源。

## 3. 非目标（Out of Scope）★

- **不改任何请求行为**：URL、查询参数、请求体、超时、错误提示、`res.code` 判定一律不动。
- **不改页面结构与交互**：列表、翻页、tab 缓存、采纳/驳回/覆盖的二次确认、`afterAudit` 本地状态更新都不动。
- **不动 `utils/request.js`**。
- 明确**不改**的既有行为：管理员权限校验、token 注入、401 重试。

## 4. 用户与场景

| 角色 | 场景 | 现在怎么做 | 期望怎么做 |
|------|------|-----------|-----------|
| 维护者 | 查「AI 审核有哪些接口」 | grep 页面才找得到 | 打开 `api.js` 看 `aiAuditApi` 四个方法 |
| 管理员 | 审核 AI 查词结果 | 列表/采纳/驳回/覆盖 | 完全一致，无感 |

## 5. 成功标准

| 类型 | 标准 | 怎么观测 |
|------|------|----------|
| 结构 | `grep -rn "/api/ai-dict/audit" pages/` 零命中 | 命令输出为空 |
| 结构 | `pages/new-word-audit` 不再 `require('../../utils/request')` | 读文件头 |
| 功能 | 审核页列表、翻页、采纳、驳回、覆盖五条操作与改前一致 | 开发者工具走一遍，Console 无报错 |

## 6. 风险与未知

| 风险 / 未知 | 影响 | 处理方式 |
|------------|------|----------|
| 搬运时把 GET 参数写成 POST body | 列表接口取不到数据 | `list` 用 `get(url, params)`，其余三条用 `post(url, data)`，与原写法一一对应 |
| `approve` / `reject` 共用一处 `type` 分支 | 误删分支导致某一边失效 | 保留 `type` 判定，只把 URL 换成方法调用 |
| 页面 `require` 未清理 | 残留无效依赖 | 同一提交内删除 |

**待确认问题**

- 无。行为完全不变，无产品决策。

## 7. 决策记录

| 日期 | 决策 | 理由 | 被否决的备选 |
|------|------|------|-------------|
| 2026-10-28 | 新建独立组 `aiAuditApi`，不塞进 `adminApi` | 四个接口都是 `/api/ai-dict/audit/*`，与 `adminApi` 的 `/api/admin/correction/*` 不同域；按域分组是现有约定 | 并入 `adminApi`（跨域混放） |
| 2026-10-28 | 并入本轮处理，不单独立项到下一轮 | 用户要求"在本轮修改"；改法与 `#002` 同源，风险仅为搬运 | 留在 `TODO.md` 等下轮 |

## 8. 验收摘要

- AC-01：`utils/api.js` 导出 `aiAuditApi`（`list` / `approve` / `reject` / `approveOverride`），URL 与原值逐字一致。
- AC-02：`pages/new-word-audit` 的 4 处调用改为封装，页面内无 `/api/` 字符串、无 `require('../../utils/request')`。
- AC-03：审核页五条操作（列表、翻页、采纳、驳回、覆盖）行为与改前一致，Console 无新增报错。

## 9. 审批记录

| 日期 | 审批人 | 审核内容 | 结论 | 备注 |
|------|--------|----------|------|------|
| 2026-10-28 | 用户 | 方案（上一轮对话中给出：加 `aiAuditApi` 四个封装、页面改为调用、零行为变化） | 通过 | 用户原话：「在本轮修改」 |

---

## 自检

- [x] 问题描述里有事实，不是形容词
- [x] 非目标至少写了 2 条
- [x] 成功标准能被第三个人独立判断
- [x] 没有替用户做产品决策（本改动无产品决策）
- [x] 改动级别判断正确（L1：2 文件、单页面、行为不变）
