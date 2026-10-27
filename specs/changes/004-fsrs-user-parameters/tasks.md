# 任务清单：FSRS 参数可配置（保持率 / 最大间隔）

> 一次只做一个任务，做完勾一个。每个任务引用覆盖的 AC，并写明验证方式。
> 后端 v3 已上线，本清单只含前端与规范。
> T01~T08 已完成静态检查（`node --check` + IDE 诊断 0 错误）；运行时验收见 `verify.md`，由 T09 收口。

- [x] **T01** 新增 `utils/fsrs/params.js`：默认值（0.9 / 36500，与后端 DDL 同值）、档位白名单、`wx` 缓存读写、服务端字段映射、选项/格式化工具 · 覆盖 AC-02 / AC-03 / AC-04 / AC-13 · 验证：`node --check`；手改 storage 为非法值后 `getCurrent()` 回落默认 · 文件：`utils/fsrs/params.js`
- [x] **T02** `utils/fsrs/fsrs.js` 接入参数：`getScheduler()` 从 `params.getCurrent()` 取值；新增 `applyServerConfig` / `applyLocalParameters` / `getParameters`，参数变化后重建调度器 · 覆盖 AC-02 / AC-05 / AC-15 · 验证：调用 `applyLocalParameters` 后 `getRatingPreviews` 结果变化；`RATING_MAP`、`calcCardOffset` 不变 · 文件：`utils/fsrs/fsrs.js`
- [x] **T03** `utils/api.js` 新增 `userApi.updateFsrsConfig(patch)`（PUT `/api/user/learning-config/fsrs-config`，不传 `null`） · 覆盖 AC-10 / AC-11 · 验证：Network 请求体只含传入字段 · 文件：`utils/api.js`
- [x] **T04** 复习页加载时序：`onLoad` 先 `loading=true`、`await waitForLogin()`、`getLearningConfig()` 后 `applyServerConfig`，再 `initReview()`；合并原 `loadCollapseConfig`；失败用缓存/默认继续 · 覆盖 AC-01 / AC-02 / AC-04 / AC-05 / AC-06 / AC-14 · 验证：冷启动 Network 顺序为 `learning-config` → `due`；首卡预览用服务端参数；失败仍能出卡 · 文件：`pages/review-list/review-list.js`
- [x] **T05** 设置页分组：新增「通用设置」标题（现有四项之前）与「复习参数」标题行（右侧「恢复默认」），不改现有四项行为；补齐标题行/按钮/说明样式 · 覆盖 AC-07 · 验证：页面结构与文案符合界面契约；现有开关保存仍正常 · 文件：`pages/settings/settings.wxml`、`pages/settings/settings.wxss`
- [x] **T06** 目标记忆保持率选择器：四档、默认 90%、只提交 `fsrsRequestRetention`、成功后更新显示并 toast「已更新」、失败显示值不变 · 覆盖 AC-08 / AC-10 / AC-11 · 验证：Network 请求体只有保持率；构造 2005 后值不变且只弹一条提示 · 文件：`pages/settings/settings.js`、`pages/settings/settings.wxml`
- [x] **T07** 最大复习间隔选择器：六档（含 730 天/两年、不限）、默认「不限」、只提交 `fsrsMaximumInterval`、成功/失败口径同 T06 · 覆盖 AC-09 / AC-10 / AC-11 · 验证：选 730 后请求体只有间隔；预览不再被截断 · 文件：`pages/settings/settings.js`、`pages/settings/settings.wxml`
- [x] **T08** 恢复默认：标题行右侧入口 + `wx.showModal` 二次确认 + 显式提交两项默认值 + toast「已恢复默认」；失败不改显示 · 覆盖 AC-12 · 验证：弹窗文案符合契约；Network 请求体含两项 `0.9/36500` · 文件：`pages/settings/settings.js`、`pages/settings/settings.wxml`
- [ ] **T09** 回归与规范：逐条跑 `verify.md`；把新行为合并进 `specs/capabilities/review-scheduling/spec.md`；更新 `API_USAGE.md` 的设置页接口行 · 覆盖 AC-06 / AC-15 及全部 AC 的验收 · 验证：`node scripts/spec.js check` 无新增错误；能力规范含新 AC · 文件：`specs/capabilities/review-scheduling/spec.md`、`API_USAGE.md`、`verify.md`
