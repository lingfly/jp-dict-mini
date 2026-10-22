---
capability: wordlist-group
status: active
owned_paths:
  - pages/wordlist-group/
  - pages/wordlist-group-words/
  - pages/wordlist/
  - pages/wordlist-detail/
  - utils/wordlistGroup.js
last_reviewed: 2026-10-22
---

# 能力：词单分组（wordlist-group）

## 1. 目的

一个词单里的单词往往有成百上千条。分组让用户可以按主题、来源、掌握程度把它们切开，并在分组之间批量搬运单词，而不改变单词本身。

## 2. 范围

**负责**
- 分组的创建、重命名、改色、删除
- 分组排序（拖拽）
- 单词在分组间移动、批量移动
- 批量删除单词
- 「未分组」这一虚拟分组的展示与归入
- 分组数据的全量同步（`sync`）

**不负责**
- 词单本身的创建/选择（见 `pages/wordlist`）
- 单词内容与释义（见 `word-search`）
- 复习调度（见 `review-scheduling`）

## 3. 数据模型

```text
WordList (词单)
  ├── Group (分组): id, name, color, sortOrder
  │     └── Word[]  （通过关系表关联）
  └── Word[]（未分组，groupId 为空）
```

**关键约定**
- 「未分组」不是一条真实分组记录，而是 `groupId` 为空的那部分单词。
- 一个单词在一个词单内**只属于一个分组**（移动即改归属，不是新增）。
- 分组 id、单词 id 全程为字符串。

## 4. 行为规范

### R1 分组管理

- **AC-WG-01** 当用户创建分组时，系统应校验名称非空且在同一词单内不重名，并分配默认颜色与末尾排序。
- **AC-WG-02** 当用户重命名分组时，系统应保留其颜色、排序与组内单词。
- **AC-WG-03** 当用户删除分组时，系统应询问「组内单词如何处理」：保留为未分组，或一并删除；不得默认静默删除单词。
- **AC-WG-04** 当用户拖拽排序时，系统应在松手后提交新的顺序，失败时回滚到拖拽前的顺序。

### R2 单词移动与删除

- **AC-WG-05** 当用户把单词移动到目标分组时，系统应只改变归属，不复制单词。
- **AC-WG-06** 当用户批量移动多个单词时，系统应一次性提交，部分失败时应提示失败数量并保持其余结果。
- **AC-WG-07** 当用户批量删除单词时，系统应二次确认，并明确提示"同时会删除学习记录"。
- **AC-WG-08** 当目标分组与当前分组相同时，系统应跳过该单词，不产生无意义请求。

### R3 展示与交互

- **AC-WG-09** 系统应在同一层级平铺展示「未分组」与所有分组，未分组固定在最前。
- **AC-WG-10** 系统应展示每个分组的单词数，并在移动/删除后即时更新计数。
- **AC-WG-11** 当分组为空时，系统应展示空状态与「移入单词」入口，而不是空白区域。
- **AC-WG-12** 当处于多选模式时，系统应支持全选、反选，并在顶部展示已选数量。

### R4 一致性

- **AC-WG-13** 当本地操作完成后，系统应以服务端返回为准刷新列表，不得只更新本地状态。
- **AC-WG-14** 当网络失败时，系统应保留用户操作前的数据快照，允许重试。

## 5. 边界与异常

| 场景 | 预期行为 | 当前实现 |
|------|----------|----------|
| 分组重名 | 阻止创建并提示 | 页面校验 + 服务端校验 |
| 删除非空分组 | 二次确认，明确单词去向 | `removeGroup(wordListId, groupId, keepWords)` |
| 移动后目标组已删除 | 提示刷新，不静默丢失 | 以服务端返回为准 |
| 并发修改同一词单 | 后写覆盖前写 | `sync` 全量提交，暂未做版本号 |
| 单词属于其它词单 | 不允许跨词单移动 | 接口按 `wordListId` 隔离 |

## 6. 数据与依赖

`utils/wordlistGroup.js` 是唯一数据入口，页面不得直接调接口：

| 方法 | 作用 |
|------|------|
| `fetchGroups(wordListId)` | 拉分组列表 |
| `fetchGroupWords(wordListId, groupId)` | 拉组内单词 |
| `fetchWordIdsOfGroups(wordListId, groupIds)` | 批量取单词 id（用于全选） |
| `createGroup / updateGroup` | 增、改 |
| `updateSortOrder(wordListId, orderedGroupIds)` | 排序 |
| `removeGroup(wordListId, groupId, keepWords)` | 删组，`keepWords` 决定单词是否保留 |
| `moveWords(wordListId, wordIds, targetGroupId)` | 移动 |
| `addWords / removeWords` | 组内增删 |
| `deleteWords(wordListId, wordIds)` | 删除单词本体 |
| `sync(wordListId, groups, ungrouped)` | 全量同步 |
| `fetchJoinLists / updateRelations` | 「加入词单」弹层的数据与关系更新 |

## 7. 已知限制

- `sync` 是全量提交，分组很多时请求体偏大；后续可改为增量。
- 排序仅支持同层级，暂不支持分组嵌套（产品上也不需要）。
- 计数在弱网下可能短暂不一致，刷新后恢复。

## 8. 变更历史

| 日期 | 变更 | 变更目录 |
|------|------|----------|
| 2026-10-22 | 反向补录：首次建立能力规范（覆盖存量实现） | — |
