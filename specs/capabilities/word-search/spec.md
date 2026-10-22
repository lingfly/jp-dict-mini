---
capability: word-search
status: active
owned_paths:
  - pages/home/
  - pages/word-detail/
  - utils/api.js
  - utils/request.js
last_reviewed: 2026-10-22
---

# 能力：查词（word-search）

## 1. 目的

用户输入日语（或中文）关键词，系统返回匹配的单词列表；用户可以查看释义、听发音、把单词加入词单或复习计划。查不到时，可以用 AI 兜底。

## 2. 范围

**负责**
- 关键词搜索与结果分页
- 搜索结果 → 单词详情
- 释义折叠/展开
- 音频播放
- 加入词单（含选择分组）
- AI 查词（同步、异步轮询、流式）及每日次数限制

**不负责**
- 复习调度（见 `review-scheduling`）
- 词单的创建与分组管理（见 `wordlist-group`）
- 纠错与审核流程（另见 `pages/correction-*`）

## 3. 角色与入口

| 角色 | 入口 | 前置条件 |
|------|------|----------|
| 普通用户 | 底部 Tab「查词」 | 需要登录（静默登录） |
| 管理员 | 同上，结果项多出「删除」 | `isAdmin` 为真 |

## 4. 行为规范

### R1 关键词搜索

- **AC-WS-01** 当用户提交非空关键词时，系统应调用 `wordApi.search(keyword, 1, pageSize)`，`pageSize` 默认 20，并以列表展示结果。
- **AC-WS-02** 当结果总数超过一页时，系统应在触底时加载下一页并追加，不得清空已有结果。
- **AC-WS-03** 当关键词为空或仅空白字符时，系统应不发起请求。
- **AC-WS-04** 当请求进行中时，系统应展示加载态，并忽略重复提交。

### R2 结果展示

- **AC-WS-05** 系统应展示单词的汉字、假名、词性、JLPT 等级（存在时）。
- **AC-WS-06** 当用户开启「查词时折叠释义」配置时，系统应默认折叠释义，点击后展开。
- **AC-WS-07** 当单词存在音频时，系统应支持点击播放；播放中再次点击应停止。
- **AC-WS-08** 当用户点击结果项时，系统应跳转 `pages/word-detail/word-detail` 并携带字符串形式的 `wordId`。

### R3 AI 查词

- **AC-WS-09** 当词典无结果或用户主动触发时，系统应提供 AI 查词入口。
- **AC-WS-10** 当用户当日 AI 查词次数达到 `aiQueryLimit` 时，系统应禁用入口并提示剩余次数为 0。
- **AC-WS-11** 当 AI 查词进行中时，系统应展示流式输出的中间内容，不得阻塞页面其他操作。
- **AC-WS-12** 当 AI 返回结果后，系统应允许用户标记「符合预期 / 不符合预期」，同一条结果只能反馈一次。

### R4 加入词单

- **AC-WS-13** 当用户选择「加入词单」时，系统应展示可用词单及其分组，并标记该词当前是否已在其中。
- **AC-WS-14** 当用户确认加入时，系统应支持选择「未分组」或某个具体分组；重复加入同一位置不应产生重复数据。

## 5. 边界与异常

| 场景 | 预期行为 | 当前实现 |
|------|----------|----------|
| 未登录冷启动 | 等待静默登录完成后再搜索 | `onLoad` 中 `await getApp().waitForLogin()` |
| 搜索超时 | 提示可理解的错误，可重试 | `request.js` 统一 toast + 上报 |
| token 失效（401） | 清除 token 并重新登录，不重复弹错 | `request.js` 401 分支 |
| 单词已被删除 | 详情页提示不存在，返回列表 | 由详情页处理 |
| AI 服务不可用 | 提示稍后重试，保留普通搜索结果 | 页面 catch 处理 |
| 音频加载失败 | 提示"音频加载失败"，不阻塞页面 | 播放回调处理 |

## 6. 数据与依赖

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/word/search` | GET | 参数 `key`、`page`、`pageSize`，需要 token |
| `/api/word/{wordId}` | GET | 单词详情，`wordId` 为字符串 |
| `/api/word/batch` | POST | 批量详情，最多 100 个 |
| `/api/audio/base64` | GET | 音频 Base64 |
| `/api/ai-dict/query` | POST | 同步 AI 查词，超时 300s |
| `/api/ai-dict/query-async` | POST | 异步提交，返回 `logId` |
| `/api/ai-dict/query-result` | GET | 按 `logId` 轮询 |
| `/api/ai-dict/stream` | SSE | 流式查词，token 走 query |
| `/api/ai-dict/feedback/correct` | POST | 需 `logId` + `selectedIndex` |
| `/api/ai-dict/feedback/incorrect` | POST | 需 `logId` |

**配置依赖**：`userApi.getLearningConfig()` 返回 `collapseDefinitionOnQuery`、`aiQueryLimit`、`aiQueryUsedToday`、`aiDictModel`、`aiDictTemperature`、`aiDictThinking`、`aiDictReasoningEffort`。

## 7. 已知限制

- 搜索结果与 AI 结果是两套数据结构，页面用 `isAiResult` 区分，新增字段时两侧都要考虑。
- AI 查词次数以服务端为准，前端只在进入页面和提交后刷新，存在短时显示滞后。
- 最近搜索目前是页面内初始值 + 运行时追加，未做跨设备同步。

## 8. 变更历史

| 日期 | 变更 | 变更目录 |
|------|------|----------|
| 2026-10-22 | 反向补录：首次建立能力规范（覆盖存量实现） | — |
| 2026-10-22 | 进行中：#001 接口超时治理（影响所有联网能力，含查词） | `changes/001-api-timeout/` |
