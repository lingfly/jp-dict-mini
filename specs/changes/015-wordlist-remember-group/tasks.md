# 任务清单：加词时按词单记住上次选择的分组

> 拆任务的唯一标准：**每个任务都能独立做完、独立验证、独立回滚。**
>
> 任务**只用下面这种复选框格式**（脚本按此统计进度，表格形式不计入）：
>
> `- [ ] **T01** 任务描述 · 覆盖 AC-01 · 验证：开发者工具点击 · 文件：pages/home/home.js`

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md`（L1 不单独写 spec.md / design.md，依据 AGENTS.md §3） |
| 任务数 | 4 |
| 预估总时长 | 约 1 小时 |

## 行为规格（L1 用 AC 内联在此，替代独立 spec.md）

- **AC-01** 当用户在某词单的分组弹层里选中某分组**并加词成功**后，系统应把
  `{ [wordListId]: groupId }` 写入本地存储；再次打开**同一词单**的弹层时，
  默认选中该分组（`groupSelectedKey` 为该分组 id）。
- **AC-02** 当用户打开另一个**没记过**的词单的弹层时，系统应默认选中「无分组」；
  两个词单的记忆互不影响（key 为 `wordListId`，禁止 `Number()` 转换）。
- **AC-03** 当记忆中保存的 groupId 在当前词单的 `groups` 里**不存在**（分组被删/换了词单）时，
  系统应静默退回「无分组」并清除该条记忆，**不得**出现选中空项或提交报错。
- **AC-04** 当加词请求**失败**（业务码非 200 / 异常）时，系统**不得**写入记忆。
- **AC-05** 弹层结构不变：首行恒为「无分组」（`groupOptions[0].key === '__none_group__'`），
  其后按 `sortOrder` 列分组；`getSelectedGroupId()` 仍返回 `null` 或**字符串** groupId。
  记住「无分组」本身也是合法记忆。

## 任务

- [x] **T01** 新增分组记忆工具 `utils/groupMemory.js`：`getRememberedGroupId(wordListId)` / `rememberGroupId(wordListId, groupId)` / `forgetGroupId(wordListId)`，单 key 存 map、限制最多 50 个词单（防本地存储膨胀）· 覆盖 AC-01, AC-02 · 验证：Node 单测 10/10 通过 · 文件：`utils/groupMemory.js`

- [x] **T02** `wordlist-add-search.js` 的 `openGroupPicker()` 用记忆值做默认选中，并校验 groupId 是否存在于当前 `groups`，不存在则退回「无分组」并清除该条记忆 · 覆盖 AC-01, AC-02, AC-03 · 验证：模拟器打开弹层读 `groupSelectedKey` · 文件：`pages/wordlist-add-search/wordlist-add-search.js`

- [x] **T03** `confirmAdd()` **成功分支**写记忆（失败分支不写）· 覆盖 AC-04 · 验证：模拟器选分组加词后查 storage；再造失败请求确认不写 · 文件：`pages/wordlist-add-search/wordlist-add-search.js`

- [x] **T04** 验收：模拟器端到端跑通 AC-01~AC-05（加词→重开弹层默认选中→换词单不串→删分组退化→失败不写），并跑 `node scripts/spec.js check` · 覆盖 AC-01~AC-05 · 验证：`.jointest/verify-015.js`（5/5）+ `.jointest/verify-015-edge.js`（3/3） · 文件：无

## 执行约定

1. **一次只做一个任务。** 做完 → 验证 → 勾选 → 提交，再开始下一个。
2. **提交信息带编号**：`feat(wordlist-add-search): 记住上次分组 [#015]`。
3. **发现新问题不顺手改**：记到 `TODO.md`，必要时新建 change。
4. **每个任务结束时自问**：这条改动，三个月后的我能看懂为什么吗？

## 验收记录

> 全部任务完成后填写。验收环境：微信开发者工具 Stable v2.01.2510290 / SDK 3.17.0，
> iPhone 12/13 (Pro) 模拟器，后端 `http://localhost:8080`（dev），当前登录用户为管理员。
> 脚本：`.jointest/verify-015.js`（主用例）、`.jointest/verify-015-edge.js`（边界）、
> `.jointest/test-group-memory.js`（单元测试）。

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | **通过** | 首次打开弹层 `groupSelectedKey='__none_group__'` → 选 A组1 加词成功 → 存储写入 `{"2120101154916847616":"2120101155030093824"}` → 重开弹层 `key=2120101155030093824`、`getSelectedGroupId()` 返回同值且 `typeof==='string'` | 端到端 |
| AC-02 | **通过** | B 词单首次打开=`__none_group__`（未被 A 影响）→ 选 B组2 加词后存储两条互不覆盖 → 回 A 词单弹层仍为 A 的 `2120101155030093824` | 按词单隔离（方案 B） |
| AC-03 | **通过** | 删除 A 词单的 A组1 分组后重进页面 → 弹层默认回到 `__none_group__`，且存储里 A 的条目已被清除（只剩 B 的），无报错 | 静默退化 |
| AC-04 | **通过** | 把 `wordListId` 临时替换为不存在值制造业务失败 → 加词失败后存储为 `null`（未写入） | 只在成功时写 |
| AC-05 | **通过** | `groupOptions[0].key==='__none_group__'` 且 `groupId===null`；选中分组时 `getSelectedGroupId()` 返回 **string**，选无分组时返回 **null**（非 `"null"`） | 结构/类型不变 |

**补充边界（AC 未要求，但属真实场景）**

| 编号 | 结论 | 证据 |
|------|------|------|
| B1 选中但不提交 | 通过 | 打开弹层选 g1 后直接 `closeGroupPicker()`，存储仍为 `null`（不会记住没提交的选择） |
| B2 失败不覆盖成功记忆 | 通过 | 先成功加 g2（记忆=g2），再失败一次加 g1 → 存储仍为 g2，重开弹层仍是 g2 |
| B3 「无分组」可被记住 | 通过 | 选无分组加词后存储值 `null`，重开弹层 `key='__none_group__'`、`resolved===null` |

**单元测试（`utils/groupMemory.js`）**：10/10 通过 —— 未记过返回 `found:false`、记住分组、
跨词单隔离、记住无分组、`forget` 生效、覆盖更新取最后一次、超 50 条淘汰最旧、
存储脏数据不崩、空 `wordListId` 不写入。

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 记忆不跨设备/跨账号 | 换机或清缓存后失效 | 接受（proposal 已列为非目标） |
| 记忆最多保留 50 个词单 | 超过后最旧的被淘汰，退化为无分组 | 接受（防存储膨胀） |

## 归档前检查

- [ ] 所有任务已勾选
- [ ] 每条 AC 都有验收结论
- [ ] 状态已由人执行 `verify` 改为 `verified`（不是 `approved`）
- [ ] 能力规范已更新（`specs/capabilities/<能力>/spec.md` 的 `last_reviewed`）
- [ ] `node scripts/spec.js check` 通过
- [ ] 没有把调试代码（`console.log`、临时开关）留在仓库
