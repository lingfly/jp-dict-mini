# 设计：清理无调用方的接口封装与空壳页面

## 1. 判定方法：怎么算"没人用"

不靠印象，靠可复现的静态比对。三步：

1. **解析定义**：从 `utils/api.js` 按 `const <name>Api = { ... }` 花括号配平，取出每组的顶层方法名。
2. **全仓库反查**：对每个 `组名.方法名` 生成 `\b<组>\.<方法>\b` 正则，扫描 `pages/`、`utils/`、`components/`、`app.js`（排除 `utils/api.js` 自身）。
3. **人工复核两类误判**：
   - **内部依赖**：`aiDictApi.buildQueryData` 在文件内被 `this.buildQueryData(...)` 调用 → 保留。
   - **同名子串**：`utils/fsrs/index.js` 里的 `forgetCard` 会命中 `getCard` 的正则 → 加词边界与人工确认。

> 项目无构建链，页面不会做 tree-shaking，也不存在 `import * as api` 的动态调用——已确认全仓库无 `wordlistApi[x]` 形式的动态取用，静态扫描即可闭环。

## 2. 影响面

### 2.1 代码

| 文件 | 动作 | 说明 |
|------|------|------|
| `utils/api.js` | 删 21 个方法，改 4 处组注释 | 594 → 489 行；`module.exports` 不变 |
| `app.json` | 删 4 行 `pages` 声明 | 29 → 25 页 |
| `pages/review-learn/`（4 文件） | 删除 | 微信默认脚手架，65 行 |
| `pages/new-learn/`（4 文件） | 删除 | 同上 |
| `pages/select-words/`（4 文件） | 删除 | 同上 |
| `pages/reset-password/`（4 文件） | 删除 | 同上，唯一与密码体系相关的页面 |
| `pages/agreement/`、`common/`、`correction/`、`login/` | 删除空目录 | 内无文件，历史残留 |

### 2.2 文档

| 文件 | 动作 |
|------|------|
| `specs/changes/001-api-timeout/design.md` | 接口规模表 88 → 67，典型接口更名，加清理脚注 |
| `specs/capabilities/review-scheduling/spec.md` | `owned_paths` 移除 `pages/review-learn/` |
| `specs/changes/INDEX.md` | 登记 `#002` |

### 2.3 不改

`utils/request.js`、任何页面业务逻辑、任何 URL 与参数、`app.js`、`components/`。

## 3. 关键取舍

**为什么不按"新旧"删？**
`reviewApi` 的组注释写着"旧接口，新流程统一走 fsrsApi"，但 `getNextWord`、`submitReview`、`getLearningStatus` 仍被 `learn`、`profile`、`wordlist-detail` 调用。按注释删会造成线上复习流程直接崩。**唯一判据只能是"有没有调用方"**。

**为什么删页面要连带删 `app.json` 声明？**
小程序启动时会按 `pages` 首项渲染首页，但**每一页的四个文件必须存在**，缺一个就编译报错。声明留着会持续制造"这个页能用"的错觉，并让 `spec check` 报 `owned_paths` 漂移。

**为什么 `TIMEOUTS.AI_QUERY` 留着？**
`#001` 的验收约束是"超时时长不变"，且 `resolveTimeout()` 的匹配规则对 `/api/ai-dict/query` 仍然有效。删掉 `aiDictApi.query` 后该分支暂无入口，属静态死代码——**留到 `#001` 归档时统一评估**，避免本次改动越界改 `request.js`。

## 4. 风险与对策

| 风险 | 触发方式 | 对策 |
|------|----------|------|
| 漏改 `app.json` 导致编译失败 | 删页面不删声明 | 改后脚本校验 25 页 × 4 文件，0 缺失 |
| 误删在用方法 | 只看注释不看调用方 | 删除前后各跑一次扫描；删除后未引用数从 21 降到 1 |
| 未来要恢复密码登录 | 产品方向变更 | 已确认不做；恢复成本约 40 行（`post(..., false)` 模板高度可复制） |
| `word-detail.js` 等大文件被编辑器占用，`node --check` 读不到 | 本地文件锁 | 用 Read 确认文件未被改动；语法校验只覆盖我改过的 `utils/api.js` |

## 5. 验收路径（给用户）

1. 微信开发者工具「编译」，Console 无新报错。
2. 依次点：首页查词 → 词单列表 → 词单详情 → 词单分组 → 学习 → 复习列表 → AI 查词 → 设置 → 纠错提交。
3. 预期：行为与清理前完全一致，无 `undefined is not a function`。
