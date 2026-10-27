# 任务清单：学习统计（认知情况 / 新学复习 双图 + 点柱看详情）

## 元信息

| 项 | 值 |
|----|----|
| 关联 | `proposal.md` / `spec.md` / `design.md` |
| 任务数 | 6 |
| 预估总时长 | 半天 |

## 任务

- [x] **T01** 接口层注释与契约同步：`fsrsApi.getDueForecast` 的返回说明由数组改为 `{ days }`，并在 `API_USAGE.md` 第 11 节更新页面行为描述 · 覆盖 AC-03 · 验证：读代码与文档，无旧字段残留 · 文件：`utils/api.js`、`API_USAGE.md`
- [x] **T02** 重写数据层：等待登录、请求、按 `days` 归一化（相对日/标签/`null` 与 `0` 区分/时长文案）、四态 `loadState` · 覆盖 AC-01, AC-02, AC-03, AC-04, AC-05, AC-18, AC-24 · 验证：Network 对照 + 改响应包 · 文件：`pages/review-forecast/review-forecast.js`
- [x] **T03** 计算两套柱高与共用纵轴：五段（简单/认识/模糊/忘记/待学）与三段（新学/复习/待学），`null` 不绘、`0` 不绘、极小段 4rpx 兜底，两图同上限 · 覆盖 AC-10, AC-12, AC-13, AC-14, AC-15, AC-16 · 验证：构造 0 值与未来日数据 · 文件：`pages/review-forecast/review-forecast.js`
- [x] **T04** 视图层与样式：顶部两个切换项、纵轴、柱区（一屏 7 天、横向滚动）、横轴竖排标注、两套图例、选中列高亮、四态展示 · 覆盖 AC-06, AC-07, AC-08, AC-09, AC-11, AC-14, AC-17, AC-19 · 验证：开发者工具逐项目视 · 文件：`pages/review-forecast/review-forecast.wxml`、`review-forecast.wxss`、`review-forecast.json`
- [x] **T05** 点击与详情卡：整列点击命中、选中态、详情卡常驻渲染（含未来日「这一天还没到」与「—」）、切图重置今天并滚回 · 覆盖 AC-20, AC-21, AC-22, AC-23, AC-09, AC-19 · 验证：点击昨天/未来日/切换图三组用例 · 文件：`pages/review-forecast/review-forecast.js`、`.wxml`、`.wxss`
- [x] **T06** 回归与规范合并：个人中心入口、下拉刷新、断网、冷启动四条回归；`node scripts/spec.js check` 通过；把 AC 合并进 `specs/capabilities/review-scheduling/spec.md` · 覆盖 AC-01, AC-05 · 验证：手动回归 + 体检脚本 · 文件：`specs/capabilities/review-scheduling/spec.md`

## 执行约定

1. **一次只做一个任务。** 做完 → 验证 → 勾选，再开始下一个。
2. **提交信息带编号**：`feat(stats): 适配学习统计新接口 [#005]`。
3. **发现新问题不顺手改**：记到 `TODO.md`。
4. T02~T05 同属一个页面，允许在同一批提交内完成；T01、T06 各自独立成一次提交。

## 验收记录

| AC | 结论 | 证据 | 备注 |
|----|------|------|------|
| AC-01 | 通过 | 代码核对 `onLoad → loadStats → await getApp().waitForLogin()` 先于请求 | 与 `review-list` 同一模式 |
| AC-02 | 通过 | 桩测试：106 项输入 → `days.length = 106`，顺序未变，`todayIndex = 90` | 不做日期重排 |
| AC-03 | 通过 | `grep` 旧字段（`newLearnedCount`/`reviewCount`/`forgotCount`/`hardCount`/`goodCount`/`easyCount`）全仓库 0 命中 | 仅 `backend-api.md` 的"待删除"清单提及 |
| AC-04 | 通过 | 桩测试：`data.days` 缺失 → `loadState='empty'` | 另验证 `days: []` |
| AC-05 | 通过 | 桩测试：`code != 200` → `loadState='error'`；页面无 `showToast`，提示只由请求层给出 | C-06 出口为错误态 + 重试 |
| AC-06 | 通过 | WXML 两个 `.seg-item`，文案「认知情况」「新学复习」 | 位置在图表卡之上 |
| AC-07 | 通过 | `data.activeTab` 初始 `'cognitive'` | |
| AC-08 | 通过 | 桩测试：切 tab 后 `activeTab='reviewNew'`，柱数据未变、纵轴未变 | 两图共用同一 `niceMax` 与 `scale` |
| AC-09 | 通过 | 桩测试：选中 3 天前后切图，`selectedIndex` 回到 90（今天），详情日期回今天 | 滚动回今天另做三场景验证，均通过 |
| AC-10 | 通过 | 单一 `niceMax`/`scale` 同时生成两套柱高；同一天五段和 = 三段和（桩测试 55 = 55） | |
| AC-11 | 通过 | WXML：`yTicks` + `scroll-view` 柱区 + 竖排 `labelChars` + `.legend` | 加载/空/错误态不展示 |
| AC-12 | 通过 | 认知柱自下而上 easy/good/hard/forgot/due 五段，`justify-content: flex-end` | |
| AC-13 | 通过 | 新学复习柱 new/review/due 三段 | |
| AC-14 | 通过 | 各段 `wx:if="{{item.xxxH > 0}}"`；桩测试昨日 `dueH = 0`（不绘制） | |
| AC-15 | 通过 | 桩测试：`easy=1` 在 scale 下应为 1rpx → 实测 `easyH = 4` | `MIN_SEG_HEIGHT` |
| AC-16 | 通过 | 桩测试：未来日 `cognitive: null` → 四档 `null` → 高度 0 且详情显示「—」；历史日 `due: null` → 详情「—」 | `numOrNull` 保留 `null` |
| AC-17 | 通过 | `BAR_WIDTH = 82rpx`，7 列 = 574rpx ≤ 可用 ~590rpx | design §10 计算 |
| AC-18 | 通过 | `dayLabel()` 覆盖 前天/昨天/今天/明天/后天/N天前/N天后；桩测试「10天后」拆为 `["10","天","后"]` | |
| AC-19 | 通过 | `scrollToToday()` 依 `todayIndex` 居中；三场景桩测试（滑走后切图 / 已居中 / data 值相同）均正确 | 用 `bindscroll` 记录真实位置 |
| AC-20 | 通过 | `bindtap="onTapBar"` 挂在整列 `.bar-col`（含柱下方标签） | 命中面积 = 整列 |
| AC-21 | 通过 | 详情卡含 日期 + 相对文案 + 7 项数值 + 学习时长 | 常驻，无关闭按钮 |
| AC-22 | 通过 | 桩测试：历史日 `due` → 「—」；未来日六项 → 「—」 | |
| AC-23 | 通过 | 桩测试：未来日详情 `isFuture=true`，六项「—」+ 待学 12 | 提示文案「这一天还没到」 |
| AC-24 | 通过 | `formatDuration` 桩测试：750s→「12 分 30 秒」、45s→「45 秒」、0→「0 秒」、120s→「2 分」 | 未来日（`null`）→「—」 |

**遗留问题**

| 问题 | 影响 | 后续处理 |
|------|------|----------|
| 今日 `due` 为累计值（示例 350）会把纵轴上限顶到 450，历史日柱子偏矮（55 词 ≈ 67rpx） | 历史趋势的可读性下降 | 已按 design 决策采用全期统一上限；若实际体验不佳，另开 change 改为「按可见 7 天动态缩放」或「历史 due 视作缺失时不参与上限计算」——记 TODO |
| 需要真机验证点击命中精度（82rpx ≈ 41px） | 手指误点邻列 | 上线前真机过一遍；若差，可降到一屏 6 天（96rpx） |

## 归档前检查

- [ ] 所有任务已勾选
- [ ] 每条 AC 都有验收结论
- [ ] 状态经用户「验收通过」后改为 `verified`
- [ ] 能力规范已更新（`last_reviewed`）
- [ ] `node scripts/spec.js check` 通过
- [ ] 没有把调试代码留在仓库
