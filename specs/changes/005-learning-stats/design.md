# 技术设计：学习统计（认知情况 / 新学复习 双图 + 点柱看详情）

## 元信息

| 项 | 值 |
|----|----|
| 关联 AC | AC-01 ~ AC-24 |
| 影响文件 | 见 §2 |
| 是否改接口 | 否（沿用 `GET /api/fsrs/due-forecast`，但**响应契约变了**） |
| 是否改数据契约 | 是（前端消费的后端响应结构整体替换；后端已按 spec 006 实现，本次只适配，不改契约本身） |

## 1. 方案概述

三句话：把 `review-forecast` 从「单图 + 46 天 + 旧字段」改为「两图切换 + 106 天 + 新字段」；柱高统一由一份归一化后的数据算出，两图共用纵轴；点击列只改两个 index（选中列 / 当前图），详情卡由选中列的数据直接渲染。

## 2. 影响面

| 文件 | 改动类型 | 说明 | 风险 |
|------|----------|------|------|
| `pages/review-forecast/review-forecast.js` | 重写 | 解析新契约、两套柱数据、选中态、滚动定位 | 中 |
| `pages/review-forecast/review-forecast.wxml` | 重写 | 切换项 + 两图 + 详情卡 | 中 |
| `pages/review-forecast/review-forecast.wxss` | 重写 | 新增分段控件、选中高亮、详情卡网格 | 低 |
| `pages/review-forecast/review-forecast.json` | 修改 | 标题「学习情况」→「学习统计」 | 低 |
| `utils/api.js` | 仅注释 | `getDueForecast` 的返回说明由数组改为 `{ days }`（C-01：接口声明集中处，注释与契约同步） | 低 |
| `API_USAGE.md` | 修改 | 第 11 节的接口描述与页面行为 | 低 |
| `specs/capabilities/review-scheduling/spec.md` | 修改 | 归档时合并 AC 与变更历史（§6 数据表补 `days` 口径） | 低 |

改动文件 7 个，但 `.json`/`utils/api.js`/`API_USAGE.md` 均为单行级跟随修改，不构成独立 change。

## 3. 数据流 / 时序

```text
onLoad
  → await getApp().waitForLogin()          // C-05
  → fsrsApi.getDueForecast()
  → request.js（token / 超时 / 401 / 提示统一）
  → { code: 200, data: { days: [106 项] } }
  → normalize(days)                          // 逐项算 null/0、相对日、标签
  → 一次 setData：days / barsCognitive / barsReviewNew / yTicks / maxTotal / 选中态
  → 视图渲染 + scrollToToday()
点击列 idx
  → setData({ selectedIndex: idx })          // 详情卡取 days[idx]
切换 tab
  → setData({ activeTab, selectedIndex: todayIndex }) + scrollToToday()
```

**关键状态**（`data` 新增/修改字段）

| 字段 | 类型 | 初始值 | 含义 |
|------|------|--------|------|
| `activeTab` | `'cognitive' \| 'reviewNew'` | `'cognitive'` | 当前图表 |
| `days` | Array | `[]` | 归一化后的 106 天（每项含 `date`、`offset`、`label`、`labelChars`、`isToday`、`isFuture`、`durationText`、`cognitive`、`reviewAndNew`、`due` 及其 `null` 标记） |
| `barsCognitive` | Array | `[]` | 认知图柱：`{ h... }` 五个高度 |
| `barsReviewNew` | Array | `[]` | 新学复习图柱：三个高度 |
| `yTicks` | Array\<number\> | `[]` | 10 个刻度值（顶→底） |
| `chartWidth` | number | `0` | rpx，柱区总宽 = 天数 × 列宽 |
| `todayIndex` | number | `-1` | 「今天」下标（后端保证 90） |
| `selectedIndex` | number | `-1` | 选中列下标 |
| `detail` | Object\|null | `null` | 详情卡渲染数据（由 `days[selectedIndex]` 派生） |
| `scrollLeft` | number | `0` | 初始横滚位置（px，今天居中） |
| `loadState` | `'loading' \| 'ready' \| 'empty' \| 'error'` | `'loading'` | 四态，替代原 `loading` 布尔 |

## 4. 接口约定

| 接口 | 方法 | 入参 | 出参（用到的字段） | 错误码 |
|------|------|------|-------------------|--------|
| `/api/fsrs/due-forecast` | GET | 无 | `code`、`data.days[]`：`date`、`due`、`durationSeconds`、`cognitive.{easy,good,hard,forgot}`、`reviewAndNew.{review,newLearned}` | 200 成功；非 200 由请求层提示一次 |

**取值规则（写死，避免页面层各写一套）**

| 场景 | 判定 | 处理 |
|------|------|------|
| 未来日 | `cognitive === null`（同时 `reviewAndNew === null`） | 三块全部按「不存在」处理；`due` 正常读 |
| 历史日 | `due === null` | 待学段不绘制、详情卡「—」 |
| 数值 0 | `=== 0` | 正常参与求和（和为 0 时整柱不绘） |
| 缺字段（老后端） | `undefined` | 按「不存在」处理，不抛错 |

## 5. 边界与降级

| 情况 | 处理方式 | 用户看到什么 |
|------|----------|-------------|
| 接口超时 / 网络失败 | `loadState = 'error'`；提示由 `request.js` 给一次 | 图表区「加载失败」+「重试」 |
| `data.days` 缺失/为空/非数组 | `loadState = 'empty'` | 「暂无学习记录」 |
| 未登录冷启动 | `await waitForLogin()` 后再请求 | 正常加载，无 401 |
| 下拉刷新 | 复用已有 `onPullDownRefresh`，成功后保��选中日（若仍存在） | 数据刷新 |
| 单日全为 0 | 该日柱体高度 0（不绘制），列仍可点击 | 详情卡显示各项 0 |
| `maxTotal` 为 0（全新用户） | 纵轴上限取 1 | 空白柱区，刻度 0/1 |

## 6. 兼容与回滚

- **老版本小程序**：不做兼容。后端已是破坏性变更，旧版按数组解析会走空态（`Array.isArray(res.data)` 为 false），不会崩溃，但页面空白——因此必须同版本发布。
- **后端先上/前端先上**：后端已上线；前端本次跟上。若前端先发（不可能，后端已改），旧字段已无，会走空态。
- **回滚方式**：`git revert` 本次单个 commit；无数据写入、无脏数据残留。回滚后页面在已升级的后端上会空白（与现状一致）。

## 7. 验证手段

| 验证项 | 手段 | 通过标准 |
|--------|------|----------|
| 主流程 | 开发者工具 → 个人中心 → 学习统计 | 106 天可滑到「15天后」；默认认知图 |
| 点柱详情 | 点击任意列 | 详情卡数字与 Network 中 `days[i]` 逐项一致 |
| 未来日 | 滑到最右点击 | 仅日期 + 待学，六项「—」，显示「这一天还没到」 |
| 历史日待学 | 点 90 天前 | 待学「—」，不是 0 |
| 切换 | 两图来回切 | 同一天柱高一致；选中日回今天并居中 |
| 异常 | 断网 / Network 面板改响应 | 「加载失败」+「重试」；`days` 删掉 → 「暂无学习记录」 |
| 冷启动 | 清缓存后直接进统计页 | 无 401、无「登录已失效」 |
| 回归 | 个人中心卡片、下拉刷新、返回 | 均正常 |

## 8. 备选方案与否决理由

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A：两套柱数据预计算 + 共用纵轴（采用） | 切换零计算、柱高天然一致、模板简单 | `setData` 体积略大（106×9 个高度） | ✅ |
| B：模板里实时计算高度（WXS/表达式） | 不用存高度 | WXML 里不能可靠做浮点运算；逻辑散落难维护 | ❌ |
| C：Canvas 绘图 | 渲染性能好、可做动画 | 无图表库（C-08），手写 Canvas 点击命中与滚动联动成本远高于收益 | ❌ |
| D：按可见 7 天动态缩放纵轴 | 柱子更高更好看 | 横向滑动时柱高跳动，跨图对比失真 | ❌ |
| E：详情用底部半屏弹层 | 信息容量大 | 每次需关闭才能看下一天；用户已选常驻卡片 | ❌ |

## 9. 宪法对照

- [x] C-01 请求未绕过 `request.js`（页面只用 `fsrsApi.getDueForecast`）
- [x] C-02 未改动环境判定
- [x] C-03 ID 保持字符串（本次不涉及 ID）
- [x] C-04 FSRS 字段转换未外溢（本页只读统计，不碰卡片字段）
- [x] C-05 需要 token 的请求已等待登录
- [x] C-06 每个 catch 都有出口（错误态 + 请求层提示）
- [x] C-07 路由已同步 `app.json`（不新增页面，无需改）
- [x] C-08 未引入依赖
- [x] C-12 未超出 proposal 的非目标

## 10. 尺寸与布局计算（供实现直接使用）

- 视口 750rpx，页面左右各 16px（=32rpx×2），图表卡内边距 24rpx×2，纵轴列 48rpx → 可用宽度 ≈ 750 − 64 − 48 − 48 ≈ 590rpx。
- 一屏 7 天 → 列宽取 **82rpx**（7×82 = 574rpx ≤ 590），留少量余量避免第 8 列露一角。
- 柱区总宽 = 106 × 82 = **8692rpx**。
- 绘图区高 720rpx（沿用现值），柱体最大高度 = 720rpx；每刻度 80rpx（10 档）。
- 初始滚动：`scrollLeft = (todayIndex + 0.5) × 82 × rpx2px − viewportWidth / 2`，最小 0（沿用现有 `scrollToToday` 思路，改列宽常量即可）。
