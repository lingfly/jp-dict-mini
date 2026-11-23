# 任务清单：AI 查词审核接口收进 `utils/api.js`

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` |
| 任务数 | 3 |
| 预估总时长 | 0.5 小时 |

## 任务

- [x] **T01** 在 `utils/api.js` 新增 `aiAuditApi`（`list` / `approve` / `reject` / `approveOverride`）并加入 `module.exports`，URL 与原值逐字一致 · 覆盖 AC-01 · 验证：读文件核对 4 条路径 · 文件：`utils/api.js`
- [x] **T02** `pages/new-word-audit/new-word-audit.js` 改调封装，删除 `require('../../utils/request')`，页面内不再出现 `/api/` 字符串 · 覆盖 AC-02 · 验证：`grep -rn "/api/ai-dict/audit" pages/` 零命中 · 文件：`pages/new-word-audit/new-word-audit.js`
- [ ] **T03** 审核页走查：列表、翻页、采纳、驳回、覆盖五条操作与改前一致 · 覆盖 AC-03 · 验证：开发者工具操作一遍，Console 无新增报错 · 文件：无（人工验证）

## 执行约定

1. 一次只做一个任务，做完 → 验证 → 勾选。
2. 提交信息带编号：`refactor(api): AI 审核接口收进 api.js [#007]`。
3. 行为必须完全不变，任何"顺手优化"都不做。

## 验收记录

> 全部任务完成后填写。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 通过（静态） | `utils/api.js` 新增 `aiAuditApi`，4 条路径与改前逐字一致 | |
| AC-02 | 通过（静态） | `grep -rn "/api/ai-dict/audit" pages/` 零命中；页面无 `utils/request` 引用 | |
| AC-03 | 未验证 | | 需在开发者工具操作审核页五条操作 |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| — | — | — |

## 归档前检查

- [ ] 所有任务已勾选
- [ ] 每条 AC 都有验收结论
- [ ] 状态改为 `verified` 后再归档
- [ ] 能力规范无需更新（本改动无行为变化）
- [ ] `node scripts/spec.js check` 通过
- [ ] 没有把调试代码留在仓库
