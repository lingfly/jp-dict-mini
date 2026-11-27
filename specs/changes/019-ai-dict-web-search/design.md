# 技术设计：AI 查词设置新增「联网搜索」开关（#019）

## 元信息

| 项 | 值 |
|----|----|
| 关联 AC | AC-01 ~ AC-12 |
| 影响文件 | 见 §2（代码 3 个 + 规范 1 个） |
| 是否改接口 | 否（后端字段已存在）；**是**（前端 `userApi.updateAiDictConfig` 入参形态改变） |
| 是否改数据契约 | 否（消费已有可空字段，`AI 查词配置` 的 5 字段契约见 §4） |

## 1. 方案概述

1. `utils/api.js` 把 `updateAiDictConfig` 从 4 个位置参数改为**单个对象入参**，并用解构默认值保证请求体**永远**包含 5 个字段（缺失时显式 `null`，而不是被 `JSON.stringify` 丢掉）。
2. `pages/settings/settings.js` 收敛出**唯一的** `saveAiDictConfig(patch)`：从页面状态拼出完整 5 字段（可被本次改动覆盖其一）→ 调接口 → 成功用响应回填 / 失败保持原值。五个既有入口 + 新开关全部改调它。
3. `pages/settings/settings.wxml` 在管理员配置区末尾加一项「联网搜索」开关，`wx:if` 绑定由模型计算出的可见性。

**为什么这样切**：本次真正的风险不是"少一个开关"，而是"全量覆盖接口 + 多处各自拼参"。只在新开关的 handler 里补第 5 个字段，其它 5 个入口照样会把联网值写成 `null`；把"保存整张 AI 表单"这件事收敛成一个函数，才不会在下一个配置项上重演。

## 2. 影响面

| 文件 | 改动类型 | 说明 | 风险 |
|------|----------|------|------|
| `utils/api.js` | 修改 | `updateAiDictConfig(config)` 对象入参，解构默认 `null`，固定提交 5 字段 | 中（调用点漏改会静默传 null） |
| `pages/settings/settings.js` | 修改 | 新增 `aiDictWebSearch` / `webSearchSupported` / `savingAiConfig`；新增 `supportsWebSearch`、`applyAiDictConfig`、`buildAiDictPayload`、`saveAiDictConfig`；6 个入口改调统一函数 | 中（保存逻辑收敛，需逐个回归四个旧入口） |
| `pages/settings/settings.wxml` | 修改 | 管理员配置区末尾新增「联网搜索」开关项（沿用现有 class） | 低 |
| `API_USAGE.md` | 修改 | `ai-dict-config` 一行改为「五项全量提交」并更新 settings 调用行号 | 低 |
| `specs/capabilities/word-search/spec.md` | 修改 | 归档时并入 AI 查词配置行为（新增 R7），`owned_paths` 登记 `pages/settings/`；`last_reviewed` 更新 | 低 |
| `specs/capabilities/review-scheduling/spec.md` | 仅登记 | `pages/settings/` 已在其 `owned_paths`；本次不改其行为，只在变更历史写明"设置页 AI 部分归 word-search" | 低 |

> 代码 3 个文件，未超 5 个；`app.json` 不变（无新页面），`request.js` 不变（无新路径）。

## 3. 数据流 / 时序

**加载**

```text
设置页 onLoad
  → loadConfig()
  → userApi.getLearningConfig()
  → applyAiDictConfig(res.data)         // 5 个 AI 字段 + 可见性重算
  → setData({ learningConfig, webSearchSupported })
```

**保存（六个入口共用）**

```text
用户操作（切模型 / 温度 / 思维 / 推理 / 新开关）
  → handler 只算出"这次改的是哪一项"
  → saveAiDictConfig({ 目标字段: 新值 })
      ├─ 若 savingAiConfig === true → 直接 return（忽略连点）
      ├─ payload = buildAiDictPayload(patch)   // 固定 5 字段，从他处取值
      ├─ userApi.updateAiDictConfig(payload)
      │    → request.js（token / 超时 / 401 / 业务码 toast）
      ├─ res.code === 200 → applyAiDictConfig(res.data) 或 patch 兜底
      └─ 其它 / 异常 → 保持原值（开关复位），仅 console.error
  → setData
```

**关键状态**（页面 `data`）

| 字段 | 类型 | 初始值 | 含义 |
|------|------|--------|------|
| `learningConfig.aiDictWebSearch` | Boolean | `false` | 开关显示值；`1` → true，`0`/`null` → false |
| `webSearchSupported` | Boolean | `false` | 当前模型是否属于 flash 家族，决定开关是否渲染 |
| `savingAiConfig` | Boolean | `false` | 保存互斥标记，防止连点导致后发覆盖先发 |

> `savingAiConfig` 放在页面实例上（`this.savingAiConfig`）即可，不需要进 `data`——它不影响渲染。

## 4. 接口约定

| 接口 | 方法 | 入参 | 出参（用到的字段） | 错误码 |
|------|------|------|-------------------|--------|
| `/api/user/learning-config` | GET | — | `aiDictModel`、`aiDictTemperature`、`aiDictThinking`、`aiDictReasoningEffort`、`aiDictWebSearch` | `4001` |
| `/api/user/learning-config/ai-dict-config` | PUT | 上表 5 字段**全量**；`aiDictWebSearch` 只允许 `0/1/null` | `data` 同 GET | `2004` / `2005` / `4001` |
| `/api/ai-dict/query-async` | POST | **不传** `webSearch`（AC-12） | — | — |

**前端封装**

```js
// utils/api.js
// 全量覆盖：五个字段必须同时提交。这里用解构默认值兜底，
// 避免调用方漏传时 JSON.stringify 丢掉字段、后端写成 null。
updateAiDictConfig({
  aiDictModel = null,
  aiDictTemperature = null,
  aiDictThinking = null,
  aiDictReasoningEffort = null,
  aiDictWebSearch = null
} = {}) {
  return put('/api/user/learning-config/ai-dict-config', {
    aiDictModel, aiDictTemperature, aiDictThinking, aiDictReasoningEffort, aiDictWebSearch
  })
}
```

**页面侧唯一调用点**（`pages/settings/settings.js`）

```js
const WEB_SEARCH_MODELS = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4.1-flash']

function supportsWebSearch(model) {
  if (!model) return false
  return WEB_SEARCH_MODELS.includes(String(model).trim().toLowerCase())
}

// 固定 5 字段：先取页面当前值，再用 patch 覆盖本次改动项
buildAiDictPayload(patch = {}) {
  const c = this.data.learningConfig
  return {
    aiDictModel: c.aiDictModel || null,
    aiDictTemperature: c.aiDictTemperature ? parseFloat(c.aiDictTemperature) : null,
    aiDictThinking: c.aiDictThinking ? 1 : 0,
    aiDictReasoningEffort: c.aiDictReasoningEffort || null,
    aiDictWebSearch: c.aiDictWebSearch ? 1 : 0,
    ...patch
  }
}
```

> `patch` 里放的是**已经转换好的后端字段值**（如 `aiDictThinking: 1`、`aiDictWebSearch: 0`），不是界面布尔值——避免两套转换散落在六个 handler 里。

**六个入口的改动映射**

| 入口 | 现在提交 | 改后 |
|------|----------|------|
| `confirmModelPicker` | 4 字段 | `saveAiDictConfig({ aiDictModel, aiDictThinking, aiDictReasoningEffort, aiDictTemperature })`，成功后重算可见性 |
| `onChangeTemperature`（空值） | 4 字段 | `saveAiDictConfig({ aiDictTemperature: null })` |
| `onChangeTemperature`（数值） | 4 字段 | `saveAiDictConfig({ aiDictTemperature: numValue })` |
| `onToggleThinking` | 4 字段 | `saveAiDictConfig({ aiDictThinking: value ? 1 : 0 })` |
| `confirmReasoningPicker` | 4 字段 | `saveAiDictConfig({ aiDictReasoningEffort: selectedReasoning })` |
| `onToggleWebSearch`（新增） | — | `saveAiDictConfig({ aiDictWebSearch: value ? 1 : 0 })`，失败时 `setData` 回旧值 |

**成功回填**

```js
applyAiDictConfig(data) {
  if (!data) return
  const next = {}
  if (data.aiDictModel !== undefined) next.aiDictModel = data.aiDictModel || ''
  if (data.aiDictTemperature !== undefined) next.aiDictTemperature = data.aiDictTemperature != null ? String(data.aiDictTemperature) : ''
  if (data.aiDictThinking !== undefined) next.aiDictThinking = data.aiDictThinking === 1
  if (data.aiDictReasoningEffort !== undefined) next.aiDictReasoningEffort = data.aiDictReasoningEffort || ''
  if (data.aiDictWebSearch !== undefined) next.aiDictWebSearch = data.aiDictWebSearch === 1
  // 逐字段判断 undefined，响应缺字段时保留本地值（AC-09）
  this.setData({
    learningConfig: { ...this.data.learningConfig, ...next },
    webSearchSupported: supportsWebSearch(next.aiDictModel !== undefined ? next.aiDictModel : this.data.learningConfig.aiDictModel)
  })
}
```

> `loadConfig` 也复用它（只覆盖 AI 字段），避免"加载"和"保存回填"两套解析逻辑各写一遍、以后漂移。

## 5. 边界与降级

| 情况 | 处理方式 | 用户看到什么 |
|------|----------|-------------|
| 接口超时 / 断网 | 请求层 reject；页面 catch 里 `console.error` 并把开关复位 | 请求层 toast（如「网络异常，请重试」）；开关回到原状态 |
| 业务码 `2005` | 页面只复位开关，不追加 toast | 后端 `message`（请求层已弹一次） |
| 返回空数据 / 缺 AI 字段 | `applyAiDictConfig` 逐字段判 `undefined`，缺的保留本地值 | 界面不闪、不清空 |
| 未登录 / token 失效 | 请求层 401 分支重登后重试一次 | 成功则无感；失败则 toast |
| 重复提交（连点） | `savingAiConfig` 互斥，保存期间忽略后续保存 | 无 loading，最后一次成功的结果为准 |
| 配置缺失（老版本后端） | `aiDictWebSearch === undefined` → 视为 `null` → 开关关闭 | 开关显示关闭，功能不报错 |
| 模型为空 / 非 flash | `webSearchSupported = false`，整项不渲染 | 看不到开关 |

## 6. 兼容与回滚

- **老版本小程序**（用户没更新）：仍只提交 4 字段 → 后端把 `aiDictWebSearch` 写成 `null`。这是**已知且无法从旧包修复**的跨版本问题；服务端 `null` 等价关闭，不会报错。新版发布后新增保存都不再丢值，用户重新打开一次开关即可。
- **后端先上 / 前端先上**：后端已上线；前端未升级时行为与今天一致（无开关 + 保存清空）。前端可独立发版，无需后端配合。
- **回滚**：`git revert` 本次三个代码文件的 commit 即可；无数据迁移、无脏数据。回滚后联网值保持当前值（可能为 `null`），可在服务端置 0 关闭（对接文档 §10）。
- **能力规范**：归档时把本增量并入 `word-search`，`pages/settings/` 加入其 `owned_paths`；`review-scheduling` 只在变更历史补一行"设置页 AI 配置归 word-search"，不改其 AC。

## 7. 验证手段

| 验证项 | 手段 | 通过标准 |
|--------|------|----------|
| 主流程（可见 + 保存） | 开发者工具，管理员账号，模型 `deepseek-v4-flash` | 开关出现；打开后 Network 里 PUT body 含 5 字段且 `aiDictWebSearch: 1`；重新进入设置页开关仍为开 |
| 模型为空 / pro 隐藏 | 分别把 `aiDictModel` 置空、切 `deepseek-v4-pro` | 开关消失；GET 的 `aiDictWebSearch` 不变 |
| 切回 flash | 从 pro 切回 `deepseek-v4-flash` | 开关重新出现且保持原选择（AC-04） |
| 全量保存不丢值 | 依次改温度、思维模式、推理强度 | 每次 PUT body 都带 `aiDictWebSearch`；GET 值未变（AC-06） |
| 失败回滚 | 临时让 `onToggleWebSearch` 提交 `2`（仅本地验证后恢复），或断网 | 开关复位；toast 后端 `message` / 网络提示（AC-07 / AC-08） |
| 响应回填 | 保存后对比界面与响应 `data` | 一致；不依赖本地拼接（AC-09） |
| 015 回归 | AI 查词「エモい」（派生语）与一个「助动词」类词 | 释义短、语源前置、`usage` 长解释与 `note` 完整显示；`wordType` 原样（AC-10 / AC-11） |
| 真机 | 预览二维码（iOS + Android 各一台） | 开关位置、点击、toast 正常 |
| 回归 | 温度空值清除、温度越界提示、picker 取消 | 与改动前一致 |

## 8. 备选方案与否决理由

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A：对象入参 + 页面唯一保存函数（采用） | 全量提交只写一处；漏字段有兜底；以后加配置项只改一处 | 需改 5 个既有入口，diff 稍大 | ✅ |
| B：给现有 4 参签名追加第 5 个位置参数 | 改动最小 | 任一调用点漏传 → `undefined` → JSON 丢字段 → 后端写 null，**正是本次要修的 bug** | ❌ |
| C：只在新开关 handler 里提交 5 字段 | 只碰新代码 | 另外 5 个入口仍会清空联网值 | ❌ |
| D：不隐藏开关，非 flash 时置灰 + 提示 | 用户知道存在这个能力 | 文案要新增、置灰态无现成样式；且用户确认「隐藏」 | ❌ |

## 9. 宪法对照

- [x] C-01 请求未绕过 `request.js`（仍走 `put()`）
- [x] C-02 未改动环境判定
- [x] C-03 无 ID 处理，未引入数值转换
- [x] C-04 未触碰 FSRS 字段转换
- [x] C-05 不改 `onLoad` 时序；既有 `loadConfig` 由请求层处理 token 等待/401
- [x] C-06 每个 catch 都有出口（`console.error` + 请求层已 toast；不裸吞）
- [x] C-07 无新增页面，`app.json` 不变
- [x] C-08 未引入依赖、未引入构建链
- [x] C-09 按任务拆分提交
- [x] C-10 归档时同步 `word-search` 能力规范
- [x] C-11 无密钥
- [x] C-12 严格按 proposal 非目标，不动查词请求、模型选项、015 渲染
