# 任务清单：进入词单加词页自动聚焦搜索框

> 拆任务的唯一标准：**每个任务都能独立做完、独立验证、独立回滚。**
>
> 任务只用复选框格式（脚本按此统计进度）：
> `- [ ] **T01** 任务描述 · 覆盖 AC-01 · 验证：… · 文件：…`

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` + `spec.md`（L1；额外写了 spec.md 以固定界面契约） |
| 任务数 | 6 |
| 预估总时长 | 约 1 小时 |

## 任务

- [x] **T01** `wordlist-add-search.wxml` 搜索 `textarea` 增加 `focus="{{searchAutoFocus}}"`（不新增元素、不改其它属性）· 覆盖 AC-01, AC-04 · 验证：WXML 仅新增一行 `focus`；其余属性逐项比对未变 · 文件：`pages/wordlist-add-search/wordlist-add-search.wxml`

- [x] **T02** `wordlist-add-search.js`：`data` 新增 `searchAutoFocus: false`；新增 `onReady()`，在页面首次渲染后延迟 300ms `setData({ searchAutoFocus: true })`；`onUnload()` 清理该定时器并置空引用 · 覆盖 AC-01, AC-02, AC-03, AC-05 · 验证：模拟器读 `searchAutoFocus`（页面出现后 392ms 置 true）；`setData` 监听确认后续不再下发；`onUnload` 清理定时器 · 文件：`pages/wordlist-add-search/wordlist-add-search.js`

- [x] **T03** 回归核对：确认搜索框占位符、`maxlength`、`auto-height`、`fixed`、`bindinput`/`bindconfirm`、查询按钮、最近查询、结果/详情/AI 查词/分组弹层/加词逻辑均未改；`git diff` 仅两文件按预期变化；`node --check` 通过 · 覆盖 AC-04, AC-06 · 验证：`git diff`（js +18/-1、wxml +2/-1）+ `node --check` OK · 文件：无

- [x] **T04** 模拟器验收：automator 打开词单加词页，验证「进入页面 ≤1s 下发聚焦」「唯一搜索框可见」「网络失败不影响」「详情返回/收键盘后不再下发聚焦」；截图为 devtools 窗口级（automator screenshot API 在本环境超时，改用 Windows PrintWindow）· 覆盖 AC-01, AC-02, AC-03, AC-04, AC-05 · 验证：`.jointest/verify-016.js` **4/4 通过**；`delay=392ms`；`setData(searchAutoFocus)` 后续写入 **0 次** · 文件：无

- [x] **T05** 真机复核：微信开发者工具「预览」→ 手机进入词单详情点「＋ 添加单词」，**进入后键盘应直接弹出、可直接打字**；看单词详情后返回列表不重复弹键盘；手动收起键盘后停留本页不再弹起 · 覆盖 AC-01, AC-02, AC-03 · 验证：**用户真机验证通过（2026-11-11，原话「真机验证通过」）** · 文件：无
  > 为什么单列：2026-11-11 实测**开发者工具模拟器不对原生 textarea 执行程序化聚焦**（同页 `input` 的 `focus` 会派发 focus 事件、`getSelectedTextRange` 成功；`textarea` 的 `focus`/`auto-focus` 静态与动态均无 focus 事件、不弹键盘），
  > 属模拟器限制，无法在工具内证明「键盘真的弹出」。代码写法与官方 textarea 示例一致（`focus="{{focus}}"` + setData），真机需人工确认一次。

- [x] **T06** 更新能力规范：`word-search` 的 `owned_paths` 增加 `pages/wordlist-add-search/`，新增 AC-WS-15（本页进入自动聚焦），更新 `last_reviewed` 与变更历史 · 覆盖 AC-06 · 验证：`node scripts/spec.js check` 无新增错误 · 文件：`specs/capabilities/word-search/spec.md`

## 执行约定

1. 一次只做一个任务；做完 → 验证 → 勾选。
2. 提交信息带编号：`feat(wordlist-add-search): 进入页面自动聚焦搜索框 [#016]`。
3. 发现范围外问题记到 `TODO.md`，不顺手改（宪法 C-12）。

## 验收记录

> 环境：微信开发者工具 Stable v2.01.2510290 / SDK 3.17.0，iPhone 12/13 Pro 模拟器；
> 后端 `http://localhost:8080` 当前未启动（正好用于验证 AC-05 网络失败降级）。
> 脚本：`.jointest/verify-016.js`。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | **通过（真机已确认）** | 模拟器：页面出现 → `searchAutoFocus=true` 用时 **392ms**（≤1s）；**用户真机预览确认：进入页面键盘直接弹出、可直接打字（2026-11-11 原话「真机验证通过」）** | 官方 textarea 示例同写法 |
| AC-02 | **通过（运行时监听）** | 钩住 `setData` 后：置 `wordDetail` → `backToResults()` → 等待 1.2s，`searchAutoFocus` 写入 **0 次**，`wordDetail=null` | 代码只有 `onReady` 一处写该字段 |
| AC-03 | **通过（运行时监听）** | `wx.hideKeyboard()` 后停留 1.5s，`searchAutoFocus` 写入 **0 次**；定时器已在首次触发后置空，无再次触发路径 | 同 AC-02 |
| AC-04 | **通过** | `.search-input` 唯一且可见（284×44）、`searchKeyword=''`；`git diff` 仅 wxml 加 `focus`、js 加 data+onReady+unload 清理 | 无新增元素/文案 |
| AC-05 | **通过** | 后端未启动（`groups=0`，登录/分组/配置请求全失败）时 `searchAutoFocus` 仍为 true、耗时 392ms | 聚焦不依赖网络 |
| AC-06 | **通过** | `node --check` OK；`node scripts/spec.js check 016-add-search-autofocus` 无错误 | 无新依赖/路由 |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 模拟器不能验证 textarea 真实聚焦/键盘 | 无法在工具内证明「键盘弹出」 | T05 真机复核（用户或后续会话补） |
| iOS 转场期间程序化聚焦可能被丢弃 | 极端情况下首次不弹键盘 | 已用 `onReady` + 300ms 延迟规避；真机若仍失败，可加大延迟或补 `auto-focus` |

## 归档前检查

- [x] 所有任务已勾选
- [x] 每条 AC 都有验收结论
- [x] 状态已由人执行 `verify` 改为 `verified`（不是 `approved`）
- [x] 能力规范已更新（`specs/capabilities/word-search/spec.md` 的 `last_reviewed`）
- [x] `node scripts/spec.js check` 通过
- [x] 没有把调试代码（临时 `bindfocus`/`bindblur`、测试页）留在仓库