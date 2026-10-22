# 任务清单：清理无调用方的接口封装与空壳页面

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` |
| 任务数 | 12（T01–T12） |
| 实际耗时 | 约 40 分钟 |
| 阻塞项 | 无（两个待确认已由用户答复，范围追加为"页面一并删除"） |

## 任务

- [x] **T01** 删除 `wordlistApi.getAvailable`、`getWords` · 覆盖 AC-01 · 验证：全仓库无调用 · 文件：`utils/api.js`
- [x] **T02** 删除 `wordlistGroupApi.list`、`getGroupWords`，并把组注释的接口清单改为 `group-content` / `all-content` / 排序接口 · 覆盖 AC-01 · 验证：注释与现存方法一一对应 · 文件：`utils/api.js`
- [x] **T03** 删除 `fsrsApi.addCard`、`getCard` · 覆盖 AC-01 · 验证：批量版 `addCards` 仍在 `wordlist-detail` 使用 · 文件：`utils/api.js`
- [x] **T04** 删除 `reviewApi` 四个方法，组注释写明"仅保留仍在用的三条" · 覆盖 AC-01 / AC-02 · 验证：`learn`、`profile`、`wordlist-detail` 三处调用未受影响 · 文件：`utils/api.js`
- [x] **T05** 删除 `aiDictApi.query`、`getStreamUrl`；`buildQueryData` 注释改为"submitAsyncQuery 内部使用" · 覆盖 AC-01 · 验证：`home.js` 只用异步三件套 · 文件：`utils/api.js`
- [x] **T06** 删除 `authApi` 六个方法、`userApi.getProfile` / `updateProfile`，两组补上"只走微信静默登录 / 资料只读"注释 · 覆盖 AC-01 / AC-07 · 验证：`app.js` 仅用 `loginByWechat` · 文件：`utils/api.js`
- [x] **T07** 删除 `adminApi.updateDefinitionCorrection` · 覆盖 AC-01 · 验证：审核两页只用 list / detail / approve / reject · 文件：`utils/api.js`
- [x] **T08** 删除 4 个空壳页面（16 文件）+ `app.json` 四行声明 + `pages/` 下 4 个空目录 · 覆盖 AC-05 / AC-06 · 验证：`app.json` 解析出 25 页、四文件齐全 0 缺失、全仓库无路径引用 · 文件：`app.json`、`pages/*`
- [x] **T09** 重跑扫描脚本：未引用方法数 21 → 1（仅 `aiDictApi.buildQueryData`，内部依赖）· 覆盖 AC-01 / AC-03 · 验证：脚本输出「未被引用的接口 (1)」
- [x] **T10** `node --check utils/api.js` 通过；全量 38 个 js 中仅 `pages/word-detail/word-detail.js` 因编辑器占用读取失败（该文件未改动）· 覆盖 AC-03 · 验证：`SYNTAX OK`
- [x] **T11** `node scripts/spec.js check` 无 ERR · 覆盖 AC-05 · 验证：路由一致性「25 个页面文件齐全」
- [ ] **T12** 微信开发者工具编译 + 8 条主链路手点 · 覆盖 AC-04 · **待用户执行**

## 文档同步

- [x] **D01** `#001 design.md` 接口规模表 88 → 67，典型接口更名，加清理脚注
- [x] **D02** `specs/capabilities/review-scheduling/spec.md` 的 `owned_paths` 移除 `pages/review-learn/`
- [x] **D03** `specs/changes/INDEX.md` 登记 `#002`
