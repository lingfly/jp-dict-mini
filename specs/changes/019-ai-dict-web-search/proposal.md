# 变更提案：AI 查词设置新增「联网搜索」开关（#019）

> 对接文档：`D:\Code\jp-dict-java\docs\frontend-ai-dict.md`（服务端 `specs/014-ai-dict-web-search` / `specs/015-ai-dict-concise-definition`）。
> 前端这次只做「设置页开关 + 保存字段补齐」；查词链路与释义渲染按文档结论**不改代码**。

## 元信息

| 项 | 值 |
|----|----|
| 编号 | `#019` |
| 目录 | `changes/019-ai-dict-web-search/` |
| slug | `ai-dict-web-search` |
| 级别 | L2 |
| 状态 | approved |
| 负责人 | lead |
| 日期 | 2026-11-27 |
| 涉及能力 | `word-search`（AI 查词的配置面）；`review-scheduling` 仅在 `pages/settings/` 共同所有权上做登记 |
| 关联 | 后端 `specs/014-ai-dict-web-search/`、`specs/015-ai-dict-concise-definition/`、`docs/frontend-ai-dict.md` |

> **级别说明**：代码只动 3 个文件，但改了 `userApi.updateAiDictConfig` 的入参形态，并把「AI 配置保存」从 4 字段改为 5 字段全量提交（保存语义变了）。别人要重新理解「保存 AI 配置该传什么」，所以按 L2 走。

## 1. 问题（Why）

**现在发生了什么？**

服务端已上线 014 / 015：

1. `GET /api/user/learning-config` 多了一个 `aiDictWebSearch`（0 / 1 / null，null = 未设置 = 关闭）。
2. `PUT /api/user/learning-config/ai-dict-config` 是**整表单覆盖**语义：请求体里没传的字段会被**写成 null**。
3. `POST /api/ai-dict/query-async` 会按用户配置决定是否挂服务端联网工具（模型不在 flash 家族时自动降级）。

而前端 `pages/settings/settings.js` 有 **5 个**保存入口（`confirmModelPicker`、`onChangeTemperature` 的空值/数值两条路径、`onToggleThinking`、`confirmReasoningPicker`），全部只提交 4 个字段：

```js
// utils/api.js:372 现状
updateAiDictConfig(aiDictModel, aiDictTemperature, aiDictThinking, aiDictReasoningEffort) {
  return put('/api/user/learning-config/ai-dict-config', {
    aiDictModel, aiDictTemperature, aiDictThinking, aiDictReasoningEffort
  })
}
```

**后果不是"看不到开关"，而是"会静默丢配置"**：服务端升级后，管理员在设置页改任意一项 AI 配置，`aiDictWebSearch` 都会被写成 `null`（= 关闭），且前端没有任何提示。反过来，用户也无法从界面打开联网搜索。

**谁受影响？** 能进入设置页「管理员配置」的用户（当前仅管理员 `userType === 1`）。

**有多疼？** 每次改模型 / 温度 / 思维模式 / 推理强度都可能顺手关掉联网；无提示、难复现。

**证据**：`utils/api.js:372-379` 只传 4 字段；`pages/settings/settings.js:173-306` 五个入口各自拼参；后端文档 §4「⚠️ 全量覆盖语义」。

## 2. 目标（What）

> 让管理员能在设置页对 flash 家族的模型**显式开关联网搜索**，并且**任何一次 AI 配置保存都不会误清其它字段**。

## 3. 非目标（Out of Scope）★

- 本次**不做**：不扩模型下拉。仍是 `deepseek-v4-flash` / `deepseek-v4-pro`，不新增 `deepseek-flash` / `deepseek-v4.1-flash`（用户 2026-11-27 决定）。
- 本次**不做**：不在 `query-async` 请求体里传 `webSearch`。前端不提供"本次强制联网"的调试开关，一律跟随服务端用户配置。
- 本次**不做**：不改 015 的输出体例与渲染（短义项 / `usage` / `note` / `wordType`）。只做回归验证，不改代码。
- 本次**不做**：不把 AI 配置整段开放给普通用户；开关随现有「管理员配置」区一起，仅管理员可见。
- 本次**不做**：不动 `home.js` / `wordlist-add-search.js` 的配置读取（它们不需要 `aiDictWebSearch`）。
- 本次**不做**：不改后端、不改接口路径与字段名、不给 `request.js` 加新规则。
- 明确**不改**的既有行为：模型/温度/思维模式/推理强度的校验、toast 文案、picker 交互、FSRS 参数保存。

## 4. 用户与场景

| 角色 | 场景 | 现在怎么做 | 期望怎么做 |
|------|------|-----------|-----------|
| 管理员 | 选 `deepseek-v4-flash`，想让它先联网再答 | 无处可开；即使后端手工置 1，改一次温度就丢 | 设置页出现「联网搜索」开关，打开后保存并回填 |
| 管理员 | 从 flash 切到 `deepseek-v4-pro` | — | 开关隐藏，但已存的联网值**不被清空**；切回 flash 时开关保持原选择 |
| 管理员 | 从没设置过模型（显示「默认」） | — | 开关隐藏（服务端默认模型不保证支持联网） |
| 管理员 | 改温度 / 思维模式 / 推理强度 | 只提交 4 字段，联网值被写 null | 提交 5 字段，联网值原样保留 |

## 5. 成功标准

| 类型 | 标准 | 怎么观测 |
|------|------|----------|
| 功能 | flash 家族模型下开关可见且可切换；`GET learning-config` 的 `aiDictWebSearch` 与界面一致（开=1 / 关=0） | 开发者工具点一遍 + Network 看 PUT body |
| 功能 | 切到 `deepseek-v4-pro` 后开关消失，`GET` 的联网值仍是切换前的值 | 先开→切 pro→再 GET |
| 回归 | 改温度 / 思维模式 / 推理强度后，`GET` 的 `aiDictWebSearch` 不变 | 每次保存后 GET 对比 |
| 体验 | 保存失败（如后端返回 `2005`）时，开关立刻回到切换前状态，不做乐观更新 | 用文档 §9 的第 3 条 curl 造 `2005`，或临时改请求体 |
| 体验 | 保存成功无需手动刷新，表单值来自响应而不是本地拼接 | 保存后看界面与响应 `data` 一致 |

## 6. 风险与未知

| 风险 / 未知 | 影响 | 处理方式 |
|------------|------|----------|
| 已发布的老版本小程序仍只传 4 字段 | 老版本用户改 AI 配置仍会把联网值写 null | 接受（无法从旧包修）；新版发布后影响自然收敛。写入设计「兼容与回滚」 |
| 服务端 prod 未配置 `ai.dict.model`，默认是 `deepseek-chat`（不在支持集合） | 模型为空时若显示开关，用户会以为生效 | 模型为空 → 隐藏开关（已确认） |
| flash 家族白名单前后端各存一份 | 后端将来新增模型，前端可能漏显示 | 前端只做**展示用**镜像，注释指向后端 `AiDictModelSupport`；后端增模型时同步一行 |
| 开关与其它保存并发（连点） | 后发请求覆盖先发，界面与库不一致 | 保存期间忽略新的保存请求（页面级 `savingAiConfig` 标记） |

**待确认问题**（未勾选 = 阻塞批准；得到答案后改成 `- [x]`，并在冒号后补结论）

- [x] **待确认** 模型下拉是否补 `deepseek-flash` / `deepseek-v4.1-flash`：**不补**，本次只让开关识别整个 flash 家族（2026-11-27 用户选择）。
- [x] **待确认** `aiDictModel` 为空（「默认」）时开关是否显示：**隐藏**（2026-11-27 用户选择）。
- [x] **待确认** 开关归属与可见性：**留在现有「管理员配置」区，仅管理员可见**（2026-11-27 用户选择）。

## 7. 决策记录

| 日期 | 决策 | 理由 | 被否决的备选 |
|------|------|------|-------------|
| 2026-11-27 | `updateAiDictConfig` 改成**单个对象入参**，固定提交 5 个字段 | 位置参数加到第 5 个后，漏传会变成 `undefined`（JSON 序列化时被丢弃），后端照样写 null——正是本次要修的 bug | 给现有 4 参签名追加第 5 个位置参数 |
| 2026-11-27 | 设置页收敛出**唯一的保存函数**，五个既有入口全部改调它 | 避免第 6、第 7 个入口再漏字段；语义「保存整张 AI 配置表单」只写一次 | 每个 handler 各自拼 5 参数 |
| 2026-11-27 | 保存成功后**用响应 `data` 回填** | 后端文档 §7 明确要求；且全量提交下响应就是权威值 | 本地 `setData` 乐观更新 |
| 2026-11-27 | 模型为空时隐藏开关 | 服务端 prod 默认模型是 `deepseek-chat`，不在联网白名单；显示会误导 | 显示 / 显示但置灰 |

## 8. 验收摘要

- AC-01 读取配置后，开关状态 = `aiDictWebSearch === 1`（`0` / `null` 均显示关闭）。
- AC-02 / AC-03 仅当模型属于 flash 家族时显示开关；模型为 pro 或为空时隐藏。
- AC-05 / AC-06 开关切换、以及任意其它 AI 配置保存，都提交完整 5 字段，不丢联网值。
- AC-07 保存失败保持原值，错误提示由请求层统一给出。
- AC-09 / AC-10 015 的短义项 / `usage` / `note` / 「助动词」按原样渲染（回归，不改代码）。

## 9. 审批记录

| 日期 | 审批人 | 审核内容 | 结论 | 备注 |
|------|--------|----------|------|------|
| 2026-11-27 | 用户（对话） | proposal + spec | 通过 | 用户原话：「批准」 |

---

## 自检（提交前逐条打勾）

- [x] 问题描述里有事实，不是形容词（字段、行号、全量覆盖语义）
- [x] 非目标至少写了 2 条（实际 7 条）
- [x] 成功标准能被第三个人独立判断
- [x] 待确认问题已经问出去，且没有替用户做决定（3 条已由用户选择）
- [x] 改动级别判断正确（动接口入参 + 保存语义 → L2）
- [x] 状态是 `draft`，且**没有开始写业务代码**
