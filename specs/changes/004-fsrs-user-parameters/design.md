# 技术设计：FSRS 参数可配置（保持率 / 最大间隔）

## 元信息

| 项 | 值 |
|----|----|
| 关联 AC | AC-01 ~ AC-15 |
| 影响文件 | 见 §2 |
| 是否改接口 | 是（消费后端 v3 已上线的 `learning-config` 新字段与 PUT） |
| 是否改数据契约 | 是（L3：`fsrsRequestRetention` / `fsrsMaximumInterval`） |
| 后端状态 | v3 已上线（字段非 `null`、部分更新、错误码 `2005`） |

## 1. 方案概述

新增 `utils/fsrs/params.js` 作为**唯一的参数入口**：默认值、档位白名单、本机缓存、服务端配置映射都在这里。`utils/fsrs/fsrs.js` 创建调度器时从它取值，并提供 `applyServerConfig / applyLocalParameters` 两个入口在参数变化后重建调度器。设置页负责读写服务端并展示；复习页在算第一张卡之前把参数应用好。

不新增页面、不改 `/api/fsrs/*`、不重排已有卡片。

## 2. 影响面

| 文件 | 改动类型 | 说明 | 风险 |
|------|----------|------|------|
| `utils/fsrs/params.js` | 新增 | 默认值 / 白名单 / 缓存 / 选项与格式化 | 低（纯逻辑，可 `node --check`） |
| `utils/fsrs/fsrs.js` | 修改 | `getScheduler()` 从 params 取值；新增 `applyServerConfig` / `applyLocalParameters` / `getParameters`，重建单例 | 中（单例重建时机） |
| `utils/api.js` | 修改 | 新增 `userApi.updateFsrsConfig(patch)` | 低 |
| `pages/review-list/review-list.js` | 修改 | `onLoad` 串行：`waitForLogin → getLearningConfig → 应用参数 → initReview`；合并原 `loadCollapseConfig` | 中（首屏时序） |
| `pages/settings/settings.js` | 修改 | 分组数据、两项选择器、部分更新、恢复默认、失败回滚 | 中（picker 状态） |
| `pages/settings/settings.wxml` | 修改 | 「通用设置」「复习参数」标题；两个选择器项；两个 picker 模态；恢复默认按钮 | 低 |
| `pages/settings/settings.wxss` | 修改 | 标题行两端对齐、恢复默认按钮、底部说明样式 | 低 |
| `specs/capabilities/review-scheduling/spec.md` | 修改 | 合并新 AC（归档前补齐） | 低 |

未触及：`utils/fsrs/dataSource.js`、`utils/request.js`、`pages/*` 其它页面、任何请求签名。

## 3. 数据流 / 时序

```text
复习页 onLoad
  → setData({ loading: true })                 // 避免等待期间闪"今日已完成"
  → await getApp().waitForLogin()              // AC-01
  → await userApi.getLearningConfig()
      ├─ code=200 → fsrs.applyServerConfig(data)   // 字段缺失/非法 → 默认（AC-13）
      │             setData({ collapseDefinitionOnReview })
      ├─ code!=200 → 保留缓存/默认（请求层已提示）    // AC-04
      └─ 抛错      → 保留缓存/默认
  → initReview()（拉 due → 组队 → showCurrentCard）
      └─ getRatingPreviews / scheduleNext 使用已应用参数（AC-02/05）
```

设置页保存：

```text
picker 确定
  → 关闭模态（不提前改显示值）
  → PUT /fsrs-config { 只含本项 }              // AC-10
      ├─ 200 → fsrs.applyLocalParameters(合并后) → 更新显示 + toast「已更新」
      └─ 其它/异常 → 显示值不变（回滚），提示由请求层给出一次   // AC-11
恢复默认
  → wx.showModal 确认
  → PUT { 两项默认值 }（显式两项）             // AC-12
      └─ 200 → applyLocalParameters(默认) + 更新显示 + toast「已恢复默认」
```

**参数模块状态**

| 状态 | 位置 | 说明 |
|------|------|------|
| `_current` | `params.js` 模块级 | 本次运行内的生效参数；首次访问时读缓存 |
| 缓存 | `wx.setStorageSync('fsrsUserParams')` | 仅请求失败时兜底，不覆盖服务端值 |
| 调度器 | `fsrs.js` `_scheduler` | 参数变化后置 `null`，下次调用重建 |

## 4. 接口与模块契约

`params.js` 导出：

| 名称 | 语义 |
|------|------|
| `DEFAULTS` | `{ requestRetention: 0.9, maximumInterval: 36500 }`（与后端 DDL 同值） |
| `getCurrent()` | 返回当前生效参数（缓存 → 默认） |
| `applyServerConfig(configData)` | 从 `fsrsRequestRetention` / `fsrsMaximumInterval` 映射、白名单校验、写缓存 |
| `applyLocal(raw)` | 设置页保存成功后写入内存 + 缓存（同样校验） |
| `getRetentionOptions()` / `getIntervalOptions()` | 设置页档位（value + label） |
| `indexOfRetention(v)` / `indexOfInterval(v)` | value → picker 下标（用于回显） |

`fsrs.js` 新增：`applyServerConfig(configData)`、`applyLocalParameters(raw)`、`getParameters()`；三者都会重置 `_scheduler`。

接口（后端已实现）：

- `GET /api/user/learning-config` → `data.fsrsRequestRetention`（number，非 null）、`data.fsrsMaximumInterval`（number，非 null）。
- `PUT /api/user/learning-config/fsrs-config`：部分更新，至少一项；成功返回完整配置对象（前端忽略）；失败业务码 `2005`。
- 前端判据：`res.code === 200` 才算成功；错误提示由 `request.js` 统一弹一次，页面**不再 toast**。

## 5. 边界与降级

| 情况 | 处理 |
|------|------|
| GET 失败 / 超时 | 用本机缓存；无缓存用默认值，继续出卡（不阻塞） |
| GET 成功但字段缺失 / `null` / 越界 / 不在档位 | 按字段回落默认；写缓存；不抛错 |
| PUT 返回 `2005` | 显示值不变（回滚），请求层弹后端 message |
| PUT 网络失败 | 同上 |
| 保存中重复点击 | picker 已关闭；无重复提交入口（恢复默认需重新点开弹窗） |
| 复习中改参数 | 当前卡预览不重算；下一张卡使用新调度器 |
| 换设备改参数 | 本次运行不刷新；下次冷启动/重新进入复习页时生效（已知限制） |
| 缓存被手改 | 白名单校验回落默认，不抛 `FSRSValidationError` |

## 6. 兼容与回滚

- 旧版小程序：忽略新增字段，行为不变。
- 新版前端 + 旧后端：GET 缺字段 → 默认值；PUT 404 → 回滚并提示（请求层）。
- 回滚：revert 上述 7 个文件即可；后端字段留存无害，新版前端未发布时不读。
- 默认值双载体：后端 DDL `0.900/36500` 与 `params.js` 常量必须同值；改默认值需同时改两处。

## 7. 验证手段

| 验证项 | 手段 | 通过标准 |
|--------|------|----------|
| 语法 | `node --check` 四个 JS 文件 | 无报错 |
| 参数校验 | 开发者工具改 storage 为 `1.5` / `45` / `"yes"` | 回落默认，复习页正常 |
| 复习页时序 | Network 面板 | 先 `learning-config`，后 `due`；首卡预览使用新参数 |
| 保持率生效 | 90%→95% | 同一卡预览间隔变短 |
| 间隔档位 | 设 30 / 730 / 不限 | 预览分别被截断 / 显示 730 天内 / 可超过 365 天 |
| 部分更新 | 只改保持率 | 请求体只有 `fsrsRequestRetention` |
| 恢复默认 | 点标题右侧按钮 | 提交两项 `0.9/36500`，显示「90% / 不限」 |
| 失败提示 | 构造 2005 / 断网 | 只弹一条提示，显示值不变 |
| 不重排 | 改参数前后 `GET /api/fsrs/due` | 同一 `wordId` 的 `due` 不变 |
| 跨设备 | 手机改、平板重进 | 参数一致 |

## 8. 备选方案与否决理由

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A 新增 `params.js`（采用） | 默认值/校验/缓存集中，页面与 fsrs 都只依赖一个入口 | 多一个文件 | ✅ |
| B 参数直接写在 `fsrs.js` | 少一个文件 | 设置页要 import fsrs 拿选项；校验与缓存混进调度逻辑 | ❌ |
| C 每次计算前从 storage 现读 | 无需内存状态 | 每次 `getStorageSync`，且"本次运行保存值"与缓存容易打架 | ❌ |
| D 页面层直接传参给 `scheduleNext` | 无全局状态 | 预览与提交两处都要传，漏一处就静默用默认值 | ❌ |

## 9. 宪法对照

- [x] C-01 请求只经 `request.js`，错误提示单一出口（页面不重复 toast）
- [x] C-02 未改环境判定
- [x] C-03 参数不含 ID
- [x] C-04 未改卡片字段转换；参数映射集中在 `params.js`
- [x] C-05 复习页先 `await waitForLogin()` 再取配置
- [x] C-06 每个 catch 都有出口（保留缓存/默认 + `console.error`）
- [x] C-07 未新增页面
- [x] C-08 未引入依赖
- [x] C-10 同批更新能力规范（归档前）
- [x] C-12 未超出非目标
