# 任务清单：AI 查词设置新增「联网搜索」开关（#019）

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` |
| 任务数 | 8 |
| 预估总时长 | 约 3 小时（含真机回归） |

## 任务

- [x] **T01** `utils/api.js`：`updateAiDictConfig` 改为单对象入参（5 个字段解构默认 `null`），注释写明全量覆盖语义 · 覆盖 AC-05, AC-06 · 验证：`grep -n "updateAiDictConfig" -r pages utils` 只剩 settings 调用点，且请求体固定 5 字段 · 文件：`utils/api.js`
- [x] **T02** `pages/settings/settings.js`：`data` 增加 `aiDictWebSearch: false`；`loadConfig` 读取并按 `=== 1` 解析；新增 `WEB_SEARCH_MODELS` / `supportsWebSearch()` / `applyAiDictConfig()`，维护 `webSearchSupported` · 覆盖 AC-01, AC-02, AC-03, AC-04 · 验证：模型为 v4-flash 时 `webSearchSupported` 为 true，置空/切 pro 后为 false · 文件：`pages/settings/settings.js`
- [x] **T03** `pages/settings/settings.js`：新增唯一保存函数 `buildAiDictPayload()` + `saveAiDictConfig(patch)`（互斥、成功用响应回填、失败保持原值、不重复 toast）与 `onToggleWebSearch` 处理器 · 覆盖 AC-05, AC-06, AC-07, AC-08, AC-09 · 验证：Network 里 PUT body 恒为 5 字段；制造失败时开关复位且只有一条 toast · 文件：`pages/settings/settings.js`
- [x] **T04** `pages/settings/settings.js`：五个既有保存入口（`confirmModelPicker` / `onChangeTemperature` 两条路径 / `onToggleThinking` / `confirmReasoningPicker`）改调 `saveAiDictConfig`，删除各自拼参 · 覆盖 AC-06 · 验证：逐个改动后 GET `aiDictWebSearch` 不变 · 文件：`pages/settings/settings.js`
- [x] **T05** `pages/settings/settings.wxml`：管理员配置区末尾新增「联网搜索」开关项，`wx:if="{{webSearchSupported}}"`，文案逐字对齐 spec 界面契约 · 覆盖 AC-02 · 验证：模型切 pro 整项消失、切回 flash 重新出现且选择保留 · 文件：`pages/settings/settings.wxml`
- [ ] **T06** 015 渲染回归：AI 查词一个派生语词与一个助动词类词，确认短义项 + `usage` + `note` 完整显示、`wordType` 原样 · 覆盖 AC-10, AC-11 · 验证：开发者工具逐项对照 spec 数据契约，**不改代码** · 文件：`pages/home/home.js`（只读）
- [x] **T07** 确认查词链路未受污染：`grep -n "webSearch" pages/ utils/` 只命中设置页与 `utils/api.js` 的配置方法，`submitAsyncQuery` 不含该字段 · 覆盖 AC-12 · 验证：`buildQueryData` 源码无 `webSearch`；命中清单仅 settings.js / settings.wxml / api.js 的 `aiDictWebSearch` · 文件：`pages/home/home.js`、`pages/wordlist-add-search/wordlist-add-search.js`（只读）
- [ ] **T08** 执行 design §7 全量验证矩阵并填写「验收记录」；`node scripts/spec.js check` 无 error · 覆盖 AC-01 ~ AC-12 · 验证：真机 iOS + Android 各一台 · 文件：`specs/changes/019-ai-dict-web-search/tasks.md`
- [x] **T09** 更新能力规范：`word-search` 新增 R7（AC-WS-21 ~ AC-WS-25）、配置依赖补 `aiDictWebSearch`、`owned_paths` 加 `pages/settings/`、更新 `last_reviewed` 与变更历史；同步 `API_USAGE.md` 的 `ai-dict-config` 行 · 覆盖 AC-01 ~ AC-09 · 验证：`node scripts/spec.js check` 中 `word-search` 路径检查通过 · 文件：`specs/capabilities/word-search/spec.md`、`API_USAGE.md`

## 执行约定

1. **一次只做一个任务。** 做完 → 验证 → 勾选 → 提交，再开始下一个。
2. **提交信息带编号**：`feat(settings): 增加联网搜索开关 [#019]`、`refactor(api): AI 配置对象入参 [#019]`。
3. **发现新问题不顺手改**：记到 `TODO.md`，必要时新建 change。
4. **每个任务结束时自问**：这条改动，三个月后的我能看懂为什么吗？

## 验收记录

> 全部任务完成后填写。L2 变更不单独写 `verify.md`，结论记在这里。
> 证据分三类：**逻辑**＝Node 桩测试（`wx`/`Page`/`userApi` 全部 mock，直接跑页面方法）；**静态**＝读码 + grep + 编译；**实机**＝开发者工具 / 真机。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 通过（逻辑） | 桩测试：`aiDictWebSearch=1` → `learningConfig.aiDictWebSearch === true`；`0/null` → false | 载荷用例见下方「验证命令」 |
| AC-02 | 通过（逻辑 + 静态） | `supportsWebSearch('deepseek-v4-flash') === true`；WXML `wx:if="{{webSearchSupported}}"`，文案逐字一致 | 视觉效果待 T08 真机确认 |
| AC-03 | 通过（逻辑） | `supportsWebSearch('')` / `('deepseek-v4-pro')` / `(null)` 均为 false → 整项不渲染 | — |
| AC-04 | 通过（逻辑） | 开→切 pro：`webSearchSupported=false` 且 `aiDictWebSearch` 仍为 true；切回 flash 恢复可见 | — |
| AC-05 | 通过（逻辑） | 开关切换的 PUT body 恰好 5 个 key，`aiDictWebSearch` 为 0 / 1 | — |
| AC-06 | 通过（逻辑） | 改温度后 PUT body 仍含 `aiDictWebSearch: 1`；温度未被清空 | 覆盖 5 个入口中的温度路径，其余入口同一函数 |
| AC-07 | 通过（逻辑） | `code=2005` → 界面保持原值，`toasts` 数量不变（无自定义 toast） | 真实 toast 由 request.js 弹 |
| AC-08 | 通过（逻辑） | mock 抛错 → 开关复位、`savingAiConfig` 解锁、请求已发出 | — |
| AC-09 | 通过（逻辑） | 保存成功用响应 `data` 回填（模型/温度/思维/推理/联网逐字段 `!== undefined` 判断） | 缺字段保留本地值由代码分支保证 |
| AC-10 | **待验证** | 静态：详情页 `definitionCn` / `usage` / `note` 三个渲染分支均在，无截断样式；015 未改前端代码 | 需用真实 AI 查词结果看一次（T06） |
| AC-11 | **待验证** | 静态：`wordType` 直出，纠错页映射表只用于 code→label，不拦截 AI 中文标签 | 需用「助动词」结果看一次（T06） |
| AC-12 | 通过（静态） | `buildQueryData` 只有 word/thinking/reasoningEffort/model/temperature；全仓库 `webSearch` 命中仅设置页与 api 配置方法 | — |

**验证命令（可复跑）**

```bash
# 1) 编译：微信开发者工具 CLI preview（已在 2026-11-27 通过，包体 578.4 KB）
"C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" preview --project "D:\Code\ai-private\jp-dict-mini" --qr-output "$env:TEMP\preview-019.png" --qr-format image

# 2) 页面逻辑桩测试（21/21，`.jointest/` 已被 gitignore，不随仓库提交）
node .jointest/verify-019.js

# 3) 规范体检
node scripts/spec.js check
```

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 本会话无法驱动开发者工具自动化（会话桌面不可见，app 服务无响应）；`cli preview` 编译已通过 | AC-02 视觉、AC-10 / AC-11 真实结果、真机未验收 | 由用户在开发者工具/真机点一遍（T06 / T08），说「验收通过」后置 `verified` |
| 已发布的老版本小程序仍只提交 4 字段，会把 `aiDictWebSearch` 写成 null | 老版本用户改 AI 配置会关掉联网 | 接受；新版发布后收敛（proposal §6） |
| `specs/changes/018-*` 空目录导致 `spec.js check` 报 5 个 error | 体检噪声，与本次无关 | 待确认 018 原委后补登记或清理 |

## 归档前检查

- [ ] 所有任务已勾选（T06 / T08 待实机验收）
- [ ] 每条 AC 都有验收结论（AC-10 / AC-11 待实机）
- [ ] 状态已改为 `verified`（由用户说「验收通过」后写入）
- [x] `specs/capabilities/word-search/spec.md` 已并入 AI 查词配置增量，`last_reviewed` 已更新
- [ ] `node scripts/spec.js check` 通过（`#019` 自身无 error；存量 `018` 空目录仍报错）
- [x] 没有把调试代码（`console.log`、临时开关）留在仓库
