# 项目宪法

> 12 条不可协商的规则。它们不是风格偏好，而是这个项目踩过坑之后留下的护栏。
> 违反其中任何一条，代码评审可以直接打回，不需要讨论"这次特殊"。
>
> 修改本文件需要单独提一个 L3 变更，不能夹带在功能改动里。

---

## 一、架构边界

### C-01 网络请求只有一个出口

**规则**：所有 HTTP 请求必须经 `utils/request.js`；业务接口只在 `utils/api.js` 中声明并按域导出（`wordApi`、`reviewApi`…）；页面里禁止出现 `wx.request` 和硬编码 URL。

**为什么**：token 注入、401 重试、超时、错误提示、埋点上报都收口在 request 层。绕过一次，这些能力就全部失效一次。

**怎么检查**：`grep -r "wx.request" pages/` 应该没有结果；`grep -r "https://" pages/` 应该没有结果。

---

### C-02 环境判定不可简化

**规则**：`utils/config.js` 中 `envVersion + platform` 的双重判断不得改写、不得"优化"成单一条件。

**为什么**：提交审核期间 `envVersion` 仍是 `develop`。只看它会去读 `config.local.js` 里的局域网地址，而审核人员不在内网，结果就是全站"网络错误"、审核被拒。这是真实事故。

**怎么检查**：改动 `config.js` 时，必须在 `design.md` 写明受影响的三端（工具 / 真机预览 / 审核版），并在真机预览下验证一次。

---

### C-03 雪花 ID 全程字符串

**规则**：`wordId`、`wordListId`、`groupId` 等后端 ID 在 JS 侧一律当字符串处理。禁止 `Number()`、`parseInt()`、`+id` 强转，禁止用作对象 key 之外的算术运算。

**为什么**：后端用 `ToStringSerializer` 输出的雪花 ID 超过 JS 安全整数范围（2^53-1）。转成 Number 会静默丢精度，表现为"详情页偶尔打开空数据"，且极难复现。

**怎么检查**：`grep -rn "Number(.*[Ii]d\|parseInt(.*[Ii]d" pages/ utils/` 应为空。

---

### C-04 字段命名转换只在一个地方做

**规则**：后端 camelCase 与 ts-fsrs snake_case 的转换，只允许在 `utils/fsrs/dataSource.js` 的 `toFsrsCard / toRequestCard / toRequestLog` 中进行。页面层不得直接拼装 FSRS 字段。

**为什么**：同一张卡片在三个层有三种命名。散落转换的结果是"某个字段偶尔是 undefined"，而 FSRS 对这种缺失不报错，只会算出错误的复习间隔。

**怎么检查**：`grep -rn "elapsed_days\|scheduled_days" pages/` 应为空。

---

## 二、运行时约束

### C-05 需要登录的请求要先等登录完成

**规则**：页面 `onLoad` 中若有需要 token 的请求，必须先 `await getApp().waitForLogin()`。

**为什么**：小程序冷启动时静默登录是异步的。抢跑会拿到 401，触发二次登录，用户看到的是"刚打开就弹错误"。

**怎么检查**：新增页面时检查 `onLoad` 第一行是否有等待；`spec.md` 的异常场景里必须包含"未登录冷启动"。

---

### C-06 错误必须有出口

**规则**：`catch` 块不得为空，也不得只写 `console.log`。要么给用户可理解的提示，要么上报（`reportRequestIssue`），要么明确注释"静默忽略的原因"。

**为什么**：小程序没有崩溃堆栈可看。静默失败等于用户看到白屏、开发者看不到日志。

**例外**：业务错误码 `3001`（单词已删除/移出词单）是**设计上的静默跳过**，但必须在 catch 中写明注释，不能裸吞。

**怎么检查**：`grep -rn "catch" pages/ | grep -v "console.error\|showToast\|reportRequestIssue\|静默"` 人工过一遍。

---

### C-07 新增页面必须同步路由

**规则**：新增页面时，`app.json` 的 `pages` 数组、页面目录（`.js/.json/.wxml/.wxss`）、跳转路径三者必须同时存在。

**为什么**：漏掉 `app.json` 的表现是"点击无反应"或"白屏"，微信开发者工具不一定报错。

**怎么检查**：`node scripts/spec.js check` 会对比 `app.json` 与 `pages/` 目录，发现未注册或缺文件的页面。

---

## 三、工程约束

### C-08 不引入构建链与运行时依赖

**规则**：不新增 `package.json`、不引入 npm 包、不引入 TypeScript 编译、不引入 UI 组件库。新增能力优先用原生 API 与现有 `utils/`。

**为什么**：这个项目的核心优势是"克隆下来用微信开发者工具就能跑"。一旦引入构建链，协作成本、审核风险、故障面都会上一个台阶。

**例外**：纯开发期工具（如 `scripts/spec.js`）可以用 Node 内置模块，但不得成为运行时的前置条件。

---

### C-09 一次提交只做一件事

**规则**：一个 task 对应一次（或一组）提交；提交信息格式 `type(scope): 摘要 [#NNN]`，例如 `fix(request): 分级超时 [#001]`。

**为什么**：出问题时能 `git revert` 单个任务，而不是回滚整个功能。AI 生成的代码尤其需要这个粒度。

**怎么检查**：`git log --oneline` 中不应出现"一堆改动"式的提交；超过 400 行的 diff 需要说明理由。

---

### C-10 规范与代码同批更新

**规则**：改变系统行为的提交，必须在同一批改动中更新 `specs/capabilities/` 对应规范，或在 change 的 `verify.md` 中明确记录"行为未变"。

**为什么**：规范的唯一价值是"可信"。一次不同步，后面就没人信了。而一份过期的规范比没有规范更危险——AI 会照着它自信地做错。

**怎么检查**：`node scripts/spec.js check` 会比对 change 涉及的能力是否已更新 `last_reviewed`。

---

## 四、安全与边界

### C-11 密钥与本地配置不入库

**规则**：`utils/config.local.js`、`project.private.config.json` 已在 `.gitignore` 中，不得为了"方便同事"而提交；不得把 token、AppSecret、后端密钥写进代码或注释。

**为什么**：小程序仓库经常被复制、分享、外包。一次泄露的密钥无法收回。

**怎么检查**：提交前 `git status` 确认这两个文件不在暂存区；`node scripts/spec.js check` 会扫描疑似密钥。

---

### C-12 不擅自扩大范围

**规则**：`proposal.md` 中「非目标（Out of Scope）」列出的内容，本次改动一律不碰。发现了顺路要改的问题，记到 `TODO.md`，不要顺手改。

**为什么**：AI 最危险的行为不是写错，而是"热情地多做了三件事"。多做的部分没有 spec、没有验收，是缺陷的温床。

**怎么检查**：review diff 时对照「非目标」一节；出现范围外文件改动，要求拆成新 change。

---

## 附：条款与代码的对应关系

| 条款 | 主要涉及文件 | 违反后的典型症状 |
|------|-------------|-----------------|
| C-01 | `utils/request.js` `utils/api.js` | 401 不重试、错误不提示 |
| C-02 | `utils/config.js` | 审核版全站网络错误 |
| C-03 | `utils/api.js` `utils/fsrs/*` | 详情页偶发空白 |
| C-04 | `utils/fsrs/dataSource.js` | 复习间隔算错 |
| C-05 | 各页面 `onLoad` | 冷启动弹错误 |
| C-06 | 各页面 `catch` | 白屏、无日志 |
| C-07 | `app.json` | 点击无反应 |
| C-08 | 根目录 | 新人跑不起来 |
| C-09 | git 历史 | 无法回滚 |
| C-10 | `specs/` | 规范失效、AI 照错做 |
| C-11 | `.gitignore` | 密钥泄露 |
| C-12 | `proposal.md` | 范围蔓延、评审失控 |
