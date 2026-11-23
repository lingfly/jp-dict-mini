# 学习统计接口（后端 spec 006）

> 对应后端 `specs/006-learning-stats/`。**破坏性变更**：响应结构整体替换，旧字段全部删除，客户端必须与后端同版本发布。

## 1. 端点

```
GET /api/fsrs/due-forecast
Header: Authorization: Bearer <token>
入参：无（窗口由服务端固定）
```

路径沿用旧名，语义已扩展为「学习统计」，下次改版再处理命名。

## 2. 响应结构

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "days": [
      {
        "date": "2026-07-29",
        "due": null,
        "durationSeconds": 0,
        "cognitive": { "easy": 0, "good": 0, "hard": 0, "forgot": 0 },
        "reviewAndNew": { "review": 0, "newLearned": 0 }
      },
      {
        "date": "2026-10-27",
        "due": 350,
        "durationSeconds": 0,
        "cognitive": { "easy": 3, "good": 42, "hard": 8, "forgot": 2 },
        "reviewAndNew": { "review": 40, "newLearned": 15 }
      },
      {
        "date": "2026-11-11",
        "due": 0,
        "durationSeconds": null,
        "cognitive": null,
        "reviewAndNew": null
      }
    ]
  }
}
```

`days` 长度**固定 106**：今天往前 90 天 + 今天 + 往后 15 天，按日期升序。
今天的下标恒为 `90`，最后一项下标 `105`。

## 3. 字段语义

| 字段 | 类型 | 历史日 | 今日 | 未来日 | 说明 |
|---|---|---|---|---|---|
| `date` | string | ✓ | ✓ | ✓ | `yyyy-MM-dd`，服务端本地时区（Asia/Shanghai） |
| `due` | number\|null | null | 数字 | 数字 | 今日=**累计**（含此前逾期未处理的卡片），与 `/due-count` 同口径；未来=该自然日到期数 |
| `durationSeconds` | number\|null | 数字 | 数字 | null | 当天学习时长（秒），`responseTimeMs` 求和后四舍五入；无记录为 0 |
| `cognitive` | object\|null | 对象 | 对象 | null | 认知情况块 |
| `cognitive.easy` | number | 数字 | 数字 | — | 简单（评分 4） |
| `cognitive.good` | number | 数字 | 数字 | — | 认识（评分 3） |
| `cognitive.hard` | number | 数字 | 数字 | — | 模糊（评分 2） |
| `cognitive.forgot` | number | 数字 | 数字 | — | 忘记（评分 1） |
| `reviewAndNew` | object\|null | 对象 | 对象 | null | 复习新学块 |
| `reviewAndNew.review` | number | 数字 | 数字 | — | 复习（当天第一次复习时卡片已有历史） |
| `reviewAndNew.newLearned` | number | 数字 | 数字 | — | 新学（当天第一次复习时卡片此前从未复习） |

## 4. 口径约定

1. **同词同日只计第一次**：同一个单词一天内被评分多次时，只计入当天第一次评分对应的档位与归属。因此 `easy + good + hard + forgot` = 当天学过的**单词数**（不是评分次数），`review + newLearned` 同理。
2. **新学与复习互斥**：两项之和等于当天涉及的单词数，不会重叠。
3. **今日 `due` 是累计值**：逾期卡片不会消失，用户打开复习页看到的就是它们；统计与角标必须一致。
4. **历史 `due` 恒为 null**：卡片表只存当前到期时间，历史到期数已不可还原，不编造。
5. **未来日只给 `due`**：`cognitive`、`reviewAndNew`、`durationSeconds` 一律为 `null`，不是 0。
6. **空值键一定存在**：三个块即使为 `null` 也会出现在 JSON 里（服务端显式 `@JsonInclude(ALWAYS)`）。前端判断请用 `=== null` 区分「这一天还没到」，用 `=== 0` 区分「学了但确实 0 次」。

## 5. 前端改动清单

`pages/review-forecast/review-forecast.js`：

- **删除**旧兜底：`const review = (d.reviewCount != null ? d.reviewCount : ratingSum) || 0`
- **删除**旧字段引用：`newLearnedCount`、`reviewCount`、`forgotCount`、`hardCount`、`goodCount`、`easyCount`、`dueCount`
- 新取值：`d.cognitive.forgot / .hard / .good / .easy`、`d.reviewAndNew.review / .newLearned`、`d.due`、`d.durationSeconds`
- 旧代码假设 `data` 是数组（`Array.isArray(res.data)`），需改为 `res.data && Array.isArray(res.data.days)`
- 渲染空值：未来日三块为 `null`，画柱时应留空而不是画 0 高度；历史日 `due` 为 `null`，待学那条线只从今日开始
- 图表横轴长度由 46 天变为 106 天（90 + 1 + 15），需要重新评估柱宽与可滚动区域

## 6. 迁移与上线

- **必须同版本发布**：旧版客户端按数组解析会拿不到数据（`Array.isArray` 为 false），统计页会空白。
- 后端为纯读接口，回滚零数据风险；但**前端不发版则无法恢复**。
- 联调自检：
  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/fsrs/due-forecast | jq '.data.days | length'      # 106
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/fsrs/due-forecast | jq '.data.days[105]'          # 未来日三块为 null
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/fsrs/due-forecast | jq '[.data.days[] | select(.cognitive == null and .due != null)] | length'   # 15
  ```
