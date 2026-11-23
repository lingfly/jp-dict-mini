# 项目长期记忆（jp-dict-mini）

> 只记 AGENTS.md / specs 里没有、但反复踩的事实。新状态优先写进规范库。

## 已踩两次的坑

### `packOptions.ignore` 会让本地调试配置静默失效

- **现象**：开发者工具里 `apiBaseUrl` 恒为 `https://jp-cika.cn/test-api`，Console 无报错。
- **原因**：`project.config.json` 的 `packOptions.ignore` 含 `utils/config.local.js` 时，工具**编译阶段**就剔除该文件，`require('./config.local.js')` 失败并被 `loadLocalConfig` 的 catch 吞掉 → `null` → 回落测试地址。
- **结论**：**永远不要把 `config.local.js` 放进 `packOptions.ignore`**。防「审核版误连本地」靠 `utils/config.js` 里的 `platform === 'devtools'` 判断，不靠 ignore。
- **历史**：`9ababec` 删过、`befa90b` 又加回、2026-10-22 再次删除并加注释警示。
- **排查口令**（Console）：`getApp().globalData.apiBaseUrl` → `wx.getDeviceInfo().platform` → `require('./utils/config.local.js')`，三步定位断在哪一环。

## 环境限制

- 本机无法运行微信开发者工具，任何运行时行为改动只能静态检查（`node --check`），必须由用户重新编译后确认。
