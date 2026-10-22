# 技术设计：接口超时治理

> 现状部分为 2026-10-22 实际代码检查结果；方案部分以"改动集中、风险可控"为原则。

## 元信息

| 项 | 值 |
|----|----|
| 关联 AC | AC-01 ~ AC-14 |
| 影响文件 | `utils/request.js`（核心）、`utils/api.js`（少量）、5 个高频页面 |
| 是否改接口 | 否（后端契约完全不变） |
| 是否改数据契约 | 否 |

## 1. 方案概述

三件事：

1. **收口**：超时值从"散落在 86 个接口"改成 `request.js` 一张常量表，统一 **60 秒**；`get` / `put` / `formPost` 支持可选覆盖，为将来调参留口。
2. **分清**：把 `fail` 的一句"网络错误"拆成 `TIMEOUT / OFFLINE / SERVER / NETWORK`，业务码单独 `BIZ`。
3. **能重试**：**不自动重试**；搜索、词单列表、复习提交三处提供手动「重试」。

不改后端、不引入依赖、不动接口契约、**不改超时时长**。

## 2. 现状清单

### 2.1 接口规模

| 模块 | 接口数 | 典型接口 | 当前超时 |
|------|--------|----------|----------|
| `wordlistApi` | 15 | `list`、`detail`、`update-relations` | 60s |
| `correctionApi` | 12 | `word`（表单）、`definition` | 60s / 微信默认 |
| `wordlistGroupApi` | 7 | `group-content`、`all-content` | 60s |
| `userApi` | 6 | `learning-config` 系列 | 60s |
| `aiDictApi` | 5 | `query-async` + `query-result`、`feedback/*` | 60s |
| `fsrsApi` | 5 | `due`、`due-count`、`review` | 60s |
| `wordApi` | 4 | `search`、`detail`、`batch` | 60s |
| `adminApi` | 4 | 审核列表 | 60s |
| `reviewApi` | 3 | `next-word`、`submit`、`learning-status` | 60s |
| `feedbackApi` | 3 | `feedback` | 60s |
| `authApi` | 2 | `login/wechat`、`current-user` | 60s |
| `audioApi` | 1 | `base64` | 60s |
| **合计** | **67** | | **无显式非默认超时的调用方** |

> 本表计数为 **`#002` 清理后**的值（原 88 个，删除 21 个零调用方封装，见 `changes/002-remove-unused-api/`）。
> 其中 `aiDictApi.query` 被删后，`request.js` 的 `TIMEOUTS.AI_QUERY`（300s）与 `/api/ai-dict/query` 匹配规则**保留但暂无入口**；本变更的"超时时长不变"约束未受影响。

### 2.2 调用方

21 个页面直接调用 API，调用最密集的：`home`（14 次）、`wordlist`（11）、`settings`（10）、`word-detail`（9）、`wordlist-detail`（5）。

### 2.3 超时发生时，实际行为

| 层次 | 行为 | 问题 |
|------|------|------|
| `wx.request` | 到达 60s 后 `fail`，`errMsg = "request:fail timeout"` | 用户已等待 1 分钟 |
| `utils/request.js:157` | `console.error` + 上报 + `showErrorToast('网络错误')` | 与断网同文案 |
| 页面 `catch` | 多数再 `showToast('查询失败'/'提交失败')` | 双重提示 |
| 页面 `finally` | 仅 37/146 处有 | loading 可能不关 |
| 用户 | 无重试入口 | 只能退出重进 |

### 2.4 已确认的三个缺陷

1. **401 重试丢 timeout**：`utils/request.js:143` 重新调用 `request(url, method, data, needAuth)`，第 5 个参数缺省为 60000。
2. **无重试上限**：401 重试若再次 401，会继续递归；只有 `autoWechatLogin` 失败才会终止。
3. **并发 401 的竞态**：`app.js` 的 `autoWechatLogin` 用 `_loginPromise` 做了单例，**同时到达**的 401 只会登录一次；但每个 401 都会无条件 `clearLoginInfo()`。晚到的 401（请求慢、回包晚）会在登录成功之后才执行，把刚写入的新 token 清掉，并触发第二次登录。

```text
t0  A、B 用旧 token 发出
t1  A 401 → 清 token → 登录 P1
t2  P1 成功 → 写入新 token
t3  B 的 401 才回来（B 慢）
t4  B 401 → 清 token ← 把新 token 冲掉了
t5  → 因为 _loginPromise 已置空，触发 P2
```

单例 Promise 只解决"同一时刻"，解决不了"先后到达"。

## 3. 超时策略

集中在一张常量表，**统一 60 秒**，不做按接口分级：

| 场景 | 超时 | 说明 |
|------|------|------|
| 所有请求（默认） | **60s** | 与现状一致，只是从散落改为集中 |
| AI 查词单次轮询 `/api/ai-dict/query-result` | **60s（默认）** | 单次是短请求；总时长由页面控制（150 次 × 2s ≈ 5 分钟） |
| `/api/ai-dict/query`（同步） | **300s** | **无调用方的遗留接口**，本期不动，建议另开需求清理 |
| 页面 / 接口显式指定 | 覆盖默认 | 留口，当前除上述遗留接口外无调用方使用 |

```js
const TIMEOUTS = {
  DEFAULT: 60000,
  AI_QUERY: 300000
}
```

**为什么不分级**：现有接口的真实耗时分布未知，拍脑袋调短会误杀慢接口。先用埋点收集 2–4 周数据，再决定要不要给列表/详情单独设更短的值。这次只保证"改一处能全局生效"。

**关于 300s**：`/api/ai-dict/query` 确实设了 300 秒，但首页已经改成「异步提交 + 轮询」（`submitAsyncQuery` + `queryAsyncResult`），这个同步接口目前**没有调用方**。本期保留不动，避免顺手删代码带来风险；清理另开需求。

## 4. 错误分类

```text
wx.request 回调
├─ success 2xx
│   ├─ 业务 code == 200 → resolve(data)
│   └─ 业务 code != 200 → reject(RequestError{ type:'BIZ', code })
├─ success 401
│   ├─ 请求发出时的 token ≠ 当前 token → 已有人刷新过 → 直接用新 token 重试（不清理、不登录）
│   ├─ 本请求已重试过 1 次            → 停止，提示「登录已失效，请重新打开小程序」
│   └─ 否则                          → 清 token → autoWechatLogin（单例）→ 用原 timeout 重试 1 次
├─ success 5xx → reject(RequestError{ type:'SERVER', statusCode })
└─ fail
    ├─ errMsg 含 timeout          → type:'TIMEOUT'
    ├─ errMsg 含 ERR_INTERNET_*   → type:'OFFLINE'
    └─ 其它                        → type:'NETWORK'
```

错误对象统一为 `Error` 实例 + 附加字段（不用 class 继承，避免小程序环境差异）：

```js
{
  name: 'RequestError',
  message: '请求超时，请重试',
  type: 'TIMEOUT',        // TIMEOUT | OFFLINE | SERVER | NETWORK | BIZ | AUTH
  url: '/api/word/search',
  duration: 60012,        // 毫秒
  timeout: 60000,
  statusCode: undefined,
  code: undefined
}
```

## 5. 改造点

### 5.1 `utils/request.js`

| 改动 | 说明 |
|------|------|
| 新增 `TIMEOUTS` 常量 | `DEFAULT: 60000`、`AI_QUERY: 300000` |
| `resolveTimeout(method, url, explicit)` | 显式传入优先，其次 AI 同步查词 300s，其余 60s |
| `get` / `put` / `formPost` 增加可选 `timeout` 参数 | 向后兼容，老调用不受影响 |
| 401 分支 | 记录请求发出时的 token；回包时与当前 token 比对：不同则不清理、直接用新 token 重试；每个请求最多重试 1 次；重试保留原 timeout |
| 登录结果校验 | 不改 `app.js`：`_doAutoLogin` 会静默吞错，因此在重试前检查 `getToken()` 是否为空；空则视为登录失败并停止重试（避免改动全局登录行为） |
| `fail` 分支 | 分类 + 生成 RequestError + 记录耗时 |
| **不加重试逻辑** | 任何失败都直接 reject，由用户手动重试 |
| toast | 仅对 `TIMEOUT/OFFLINE/SERVER` 弹一次；`BIZ` 不再在请求层弹 |
| 埋点 | 失败与慢请求（>5s）上报 `path`（去掉 query）、`duration`、`timeout`、`type`；`get()` 会把参数拼进 url，上报前必须截断，避免搜索词/用户 ID 进日志 |

示意（非最终代码）：

```js
function request(url, method = 'GET', data = {}, needAuth = true, timeout) {
  const limit = timeout || resolveTimeout(method, url)
  const startedAt = Date.now()
  // ...
  fail: (err) => {
    const type = /timeout/i.test(err.errMsg || '') ? 'TIMEOUT' : 'OFFLINE'
    const e = makeRequestError(type, url, limit, Date.now() - startedAt)
    notifyOnce(e)      // 只弹一次
    reject(e)          // 不重试
  }
}
```

### 5.2 `utils/api.js`

- 保留 `ai-dict/query` 的显式 300s（与规则表一致，作为双保险）
- 其余接口**不加参数**，由 URL 规则统一接管
- 无接口签名变化

### 5.3 页面（只改 5 个高频页）

| 页面 | 改动 | 对应 AC |
|------|------|---------|
| `pages/home` | 失败时**不加错误条**：请求层 toast 已说明原因，关键词保留，用户直接再点「查询」 | AC-04、AC-05、AC-07 |
| `pages/wordlist` | 失败时展示错误态（首次失败不白屏），**复用下拉刷新重试**；`finally` 关闭 loading | AC-04、AC-07 |
| `pages/learn` | 失败时停留当前卡片、保持评分按钮可用、提示「提交超时，请重新选择」；再次点评分即重试；**不新增按钮** | AC-06、AC-07、AC-15 |
| `pages/review-list` | 失败时展示错误态，**复用下拉刷新重试** | AC-04、AC-07 |
| `pages/correction-word` | 失败时提示原因，表单内容保留，**复用「提交纠错」按钮重试** | AC-04、AC-07 |

> `learn` 不新增按钮：评分按钮本身就是重试入口。需要额外做的是两件事——失败时不跳卡，以及不把 60 秒等待算进响应时间（见 §5.4）。

### 5.4 响应时间的处理

`pages/learn/learn.js:136` 用 `Date.now() - startTime` 计算 `responseTimeMs`，而 `startTime` 只在拿到新卡片时设置（第 88 行）。

如果失败后直接让用户重新点评分，这个值会变成：

```text
首次思考 8 秒 + 超时等待 60 秒 + 第二次确认 3 秒 ≈ 71 秒
```

后端会收到一个明显失真的学习时长。处理方式：

- 失败瞬间记录 `firstResponseTime = Date.now() - startTime`
- 重试提交时使用 `firstResponseTime`，不重新计时

这样既保留真实的回忆时长，也不会因为一次网络故障污染学习数据。

### 5.5 AI 查词轮询

`pages/home/home.js:784-807`：

```js
const POLL_INTERVAL = 2000   // 2 秒
const MAX_ATTEMPTS = 150     // 约 5 分钟
```

现状：

| 问题 | 现状 |
|------|------|
| 等待反馈 | 只有 `aiStreaming: true` 的转圈，**没有任何文字说明** |
| 超时文案 | 抛 `Error('查询超时，请稍后重试')`，被 `startAiSearch` 的 catch 统一转成「AI查词失败」 |
| 单次请求 | 2 秒一次的短请求，走默认 60s，实际很少触发 |
| **单次失败** | `await queryAsyncResult(logId)` **没有 try/catch**。注释写着"异常稍后重试"，但请求抛错时异常会直接冒泡，整个轮询终止 |

### 单次轮询失败的真实后果

```text
第 3 次轮询时网络抖了一下（请求超时）
  → queryAsyncResult 抛错
  → pollAiQueryResult 直接抛出，150 次预算作废
  → startAiSearch catch → 「AI查词失败」
  → 服务端可能还在生成，额度已扣
```

一次抖动就浪费一次额度，而且用户不知道"再试一次"还要再花一次。

### 改法：截止时间 + 失败容忍

```js
const deadline = Date.now() + 5 * 60 * 1000
let consecutiveFailures = 0

while (Date.now() < deadline && consecutiveFailures < 3) {
  try {
    const res = await aiDictApi.queryAsyncResult(logId)
    consecutiveFailures = 0          // 成功一次就清零
    if (res.code === 200 && ['success', 'failed'].includes(res.data.status)) return res
  } catch (e) {
    consecutiveFailures++            // 单次失败不终止
  }
  await sleep(2000)
}
```

两个关键点：

1. **用截止时间而不是次数**：如果只是给 `await` 加 try/catch，150 次 × 60 秒最坏会跑 2.5 小时。必须用 `deadline` 把总时长钉死。
2. **连续失败 3 次才放弃**：偶发一次抖动不影响；持续不通说明网络确实断了，早停早提示。

轮询请求仍沿用 60 秒（遵守统一决定），但正常情况每次几百毫秒就返回，60 秒只是上限。

本期只改两处：

1. 超时文案透出为「AI 查词超时，请稍后重试」，不再被笼统的「AI查词失败」覆盖
2. 转圈下方显示阶段文案（「已提交，生成中…」），让用户知道系统在干活

轮询间隔与次数上限不动——5 分钟是产品已接受的等待上限。

### 5.6 切页行为（方案 A：不中断）

用户决定：**轮询不因切页中断**。原因是服务端「提交即计数」——中断等于白花一次额度，而 AI 生成本来就在服务端继续。

但"回来能看到结果"不会自动成立，要补两件事：

| 问题 | 处理 |
|------|------|
| 超时 toast 弹在别的页面 | 加 `_visible` 标记（`onShow` 置 true / `onHide` 置 false），只有可见时才 `showToast` |
| 回来看不到状态 | 把 AI 状态落到 `data.aiStatus`（`generating` / `done` / `failed`），wxml 按状态渲染 |

`onHide` 只做一件事：`this._visible = false`。`onShow` 恢复 true，并根据 `aiStreaming` 与结果展示当前状态。**轮询本身不改**。

代价（已知并接受）：用户切走后若在后台超时，这一次额度已经消耗，且无法退回。产品上不额外提示，避免制造负面情绪；但结果状态必须保留在页面上，让用户回来知道发生了什么。

> 其余 16 个页面第一阶段的收益来自请求层：超时值变短、错误可读、不再双弹业务错误。它们的 catch 里多余的 toast 记为遗留，另开需求清理。

## 6. 影响面

| 文件 | 改动类型 | 风险 |
|------|----------|------|
| `utils/request.js` | 重构核心逻辑 | **高**（所有请求都过它） |
| `utils/api.js` | 微调（保留 AI 显式值） | 低 |
| `pages/home/home.js` + `.wxml` | 新增错误态与重试 | 中 |
| `pages/wordlist/wordlist.js` + `.wxml` | 同上 | 中 |
| `pages/learn/learn.js` + `.wxml` | 失败保留卡片 | 中 |
| `pages/review-list/review-list.js` + `.wxml` | 同上 | 低 |
| `pages/correction-word/correction-word.js` | 超时提示 | 低 |

**不改**：`utils/config.js`、`utils/fsrs/*`、`app.js`、后端。

## 7. 兼容与回滚

- **老页面**：`reject` 仍抛出 Error，原 `catch` 逻辑不受影响；新增字段是附加的（AC-14）。
- **老版本小程序**：请求层随包发布，不存在"前端旧、后端新"的错配。
- **回滚**：revert `utils/request.js` 与 5 个页面即可，无数据变更、无接口变更。
- **灰度**：可先只改 `TIMEOUTS`（不动错误分类），观察一周再加错误分类与页面重试入口。

## 8. 验证手段

| 验证项 | 手段 | 通过标准 |
|--------|------|----------|
| 超时 | 临时把 `TIMEOUTS.DEFAULT` 改为 1000ms，点一次搜索 | 1 秒后提示「请求超时，请重试」，只弹 1 次，loading 关闭 |
| 断网 | 开发者工具 → 网络 → 离线 | 提示「网络不可用」，文案与超时不同 |
| 5xx | 后端 mock 500 / 抓包改响应 | 提示「服务繁忙」，不提示「网络错误」 |
| 不自动重试 | 提交复习时断网，观察后端访问日志 | 只有 1 条请求记录 |
| 并发 401 | 把 token 改成乱码，同时触发首页的 3 个请求 | 登录接口只被调用 1 次；新 token 不会被清除 |
| 晚到 401 | 抓包让其中一个请求延迟 3 秒再返回 401 | 不触发第二次登录，直接用新 token 重试 |
| 重登无效 | mock 所有请求都返回 401 | 只重试 1 次，随后提示「登录已失效，请重新打开小程序」 |
| 401 保留 timeout | 调一次 AI 查词，在重试分支打印 limit | 仍为 300000，不是 60000 |
| 401 | 手动改 storage 里的 token 为无效值 | 重登一次后成功，不循环 |
| 真机 | 飞行模式 / 地铁 | 行为与工具一致 |

> 微信开发者工具没有"延迟 N 秒"模拟，改常量是最可靠的方式；改完记得改回。

## 9. 备选方案与否决理由

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A. 只把默认 60s 改成 10s | 一行改动 | 未确认耗时分布，可能误杀慢接口 | ❌ 本次不做 |
| B. 每个接口传 timeout | 精确 | 86 处散落，难维护，新接口必漏 | ❌ |
| C. 常量表 + 错误分类 + 手动重试（采用） | 集中、可调、可观测、风险低 | 60 秒等待仍在 | ✅ |
| D. GET 自动重试 | 提升弱网成功率 | 放大后端压力，用户已决定不重试 | ❌ |
| E. 引入第三方请求库 | 功能全 | 违反 C-08 无依赖约束 | ❌ |

## 10. 宪法对照

- [x] C-01 所有请求仍经 `request.js`，页面不直接 `wx.request`
- [x] C-02 未改动 `config.js` 的环境判定
- [x] C-03 不涉及 ID 处理
- [x] C-04 不涉及 FSRS 字段转换
- [x] C-05 未改变登录时序
- [x] C-06 每个分支都有明确出口（分类错误 + 页面处理）
- [x] C-07 无新增页面
- [x] C-08 未引入任何依赖
- [x] C-12 未超出 proposal 的非目标（不改后端、不做离线队列）
