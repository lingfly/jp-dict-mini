# 后端对接文档：FSRS 参数（目标保持率 / 最大间隔）

> 对应需求 `#004`。前端改动见同目录 `proposal.md` / `spec.md`。
> 本文是前后端之间的接口契约。**后端已于 2026-10-26 按 v3 实现并上线；前端按 v3 实现后发版**。
> **v2（2026-10-26）**：两列改为 `NOT NULL` 并带服务端默认值，接口不再返回 `null`；错误码统一为 2005。
> **v3（2026-10-26）**：写接口改为**部分更新**——传几项就改几项，不再要求两项全量提交。变更明细见 §10。

## 1. 目的与范围

用户可自定义两个 FSRS 调度参数，存放在用户学习配置中，跨设备一致：

| 参数 | 含义 | 默认值 |
|------|------|-----------------|
| `request_retention` | 目标记忆保持率，越高复习越频繁 | `0.90` |
| `maximum_interval` | 单词最长多久再出现（天） | `36500`（界面「不限」） |

**默认值有两处载体，必须同值**：数据库列默认值（`0.900` / `36500`）与前端兜底常量（`0.90` / `36500`）。
接口不会返回 `null`，前端只在「请求失败且无本机缓存」时才用到自己的兜底值。

**后端只做两件事**：读配置时返回这两个字段、写配置时校验并保存。

**不需要做**（重要）：

- 不需要用这两个参数重算 `due` / `stability` / `due-count` / `due-forecast`。调度仍由前端 ts-fsrs 计算，`POST /api/fsrs/review` 收到的 `card` 就是最终状态，后端只持久化。
- 不需要额外写数据回填脚本（历史行由 DDL 的列默认值一次性填充）。
- 不需要在复习提交时校验参数与 `card` 是否一致。

## 2. 字段定义

| JSON 字段（camelCase） | 类型 | 数据库列 | 语义 | 空值 |
|------------------------|------|------------------|------|------|
| `fsrsRequestRetention` | number | `fsrs_request_retention DECIMAL(4,3) NOT NULL DEFAULT 0.900` | 目标保持率，如 `0.9` | 不会为 `null`，未设置时即默认值 |
| `fsrsMaximumInterval` | number | `fsrs_maximum_interval INT NOT NULL DEFAULT 36500` | 最大间隔天数，如 `730`；`36500` 表示「不限」 | 不会为 `null`，未设置时即默认值 |

- JSON 必须是 **number**，不要返回字符串（`"0.9"`）。
- 不要四舍五入到异常精度（如 `0.9000000001`）；按原值返回即可。
- 目标保持率**最多 3 位小数**（与列精度一致）：超过 3 位小数按校验失败处理，不静默四舍五入。
- 列名/表名以实际库为准；表沿用现有用户学习配置表（下文称 `user_learning_config`）。

## 3. 数据库变更

```sql
-- MySQL 示例；其他库把 DECIMAL/INT 对应替换即可
ALTER TABLE user_learning_config
  ADD COLUMN fsrs_request_retention DECIMAL(4,3) NOT NULL DEFAULT 0.900 COMMENT 'FSRS 目标记忆保持率，0<x<=1',
  ADD COLUMN fsrs_maximum_interval  INT          NOT NULL DEFAULT 36500 COMMENT 'FSRS 最大复习间隔（天），36500 表示不限';
```

回滚（结构）：

```sql
ALTER TABLE user_learning_config
  DROP COLUMN fsrs_request_retention,
  DROP COLUMN fsrs_maximum_interval;
```

回滚（只把用户值恢复为默认，保留列）：

```sql
UPDATE user_learning_config
   SET fsrs_request_retention = 0.900,
       fsrs_maximum_interval  = 36500;
```

- 历史行由 `ADD COLUMN ... NOT NULL DEFAULT` 在迁移时一次性填充为默认值，**不需要**额外回填脚本。
- 默认值同时写在数据列与前端常量里，**调整默认值时必须同时改 DDL（新迁移脚本）与前端常量**，否则未设置的用户在不同版本前端会看到不同参数。
- 已有行、新行都不允许 `NULL`。

## 4. 读接口

`GET /api/user/learning-config`（需要 token）

在现有响应 `data` 中**追加**两个字段（其余字段不变）：

```json
{
  "code": 200,
  "data": {
    "dailyNewWords": 10,
    "voiceConfig": 1,
    "collapseDefinitionOnQuery": 0,
    "collapseDefinitionOnReview": 0,
    "aiDictModel": null,
    "aiDictTemperature": null,
    "aiDictThinking": 0,
    "aiDictReasoningEffort": null,
    "fsrsRequestRetention": 0.85,
    "fsrsMaximumInterval": 730
  }
}
```

约定：

- 两个字段**始终返回且永不为 `null`**，类型为 number；从未保存过的用户读到的是默认值 `0.9` / `36500`。
- 老版本小程序会忽略新增字段，无兼容问题。
- 不因这两个字段而额外创建配置行（保持现有懒加载逻辑）。

## 5. 写接口

`PUT /api/user/learning-config/fsrs-config`（需要 token）

请求体（**部分更新**：只更新请求中出现的项，未出现的项保持原值）：

```json
{ "fsrsRequestRetention": 0.95 }                             // 只改保持率，间隔不变
{ "fsrsMaximumInterval": 365 }                               // 只改间隔，保持率不变
{ "fsrsRequestRetention": 0.95, "fsrsMaximumInterval": 365 }  // 两项都改
{}                                                           // 失败：至少提交一项
```

- `null` 与「不传」等价（服务端不区分），因此**不能**用 `null` 把参数清回默认值；要恢复默认，提交默认档位 `{"fsrsRequestRetention":0.9,"fsrsMaximumInterval":36500}`。

成功：

```json
{ "code": 200, "data": { "...与 GET 的 data 同构..." } }
```

> 成功时 `data` 返回完整配置对象（与其他配置写接口一致），前端可忽略 `data`。原文档写 `data: null`，这里放宽为超集，不影响前端。

校验规则：

| 字段 | 规则 | 失败时 |
|------|------|--------|
| `fsrsRequestRetention` | 可不传；传了则必须是 number、`0 < x <= 1`、最多 3 位小数 | 见下 |
| `fsrsMaximumInterval` | 可不传；传了则必须是 number、正整数、`1 <= x <= 36500` | 见下 |
| 整体 | 至少提交一项；两项同时提交且有一项非法时，**整次拒绝，两项都不写** | 见下 |

- **后端只校验范围，不校验档位**（`0.80/0.85/0.90/0.95`、`30/90/180/365/730/36500` 是前端产品档位；后端硬编码档位会卡住前端加档）。前端仍会做白名单，非法值回落默认。
- 校验失败：HTTP 200 + 业务码 **2005** + 可读中文原因，例如
  `{ "code": 2005, "message": "FSRS 参数不合法：最大间隔需在1到36500天之间" }`。
  **前端判据是 `code != 200`**，不要把 2005 当作未知错误。
  （原文档写 `code: 400`，本项目错误码枚举无 400，参数类错误统一 2005，不改枚举体系。）
- 两项都不传（或都为 `null`）→ 失败，message 为「FSRS 参数不合法：至少提交一项」。
- 类型错误 / 保持率超过 3 位小数 → 同样按失败返回；**不做半更新**（一项非法则另一项也不写）。
- 写操作幂等：同一请求体重复提交结果一致，不累加、不追加历史。
- 不要在这个接口里做调度重算或批量更新卡片。

## 6. 兼容与发布顺序

| 阶段 | 状态 | 前端表现 |
|------|------|----------|
| 后端未上线 | GET 无字段、PUT 404 | 参数显示默认值；保存失败（提示由请求层给出，页面只回滚） |
| 后端已上线、前端旧版 | 字段存在但旧版不读 | 行为不变，接口兼容 |
| 后端上线 + 前端新版 | 正常 | 读写生效，跨设备一致 |

发布顺序：**先发后端 → 验证 §7 用例 → 再发前端**。
回滚：只回滚前端即可（后端字段留着无害，未设置用户读到默认值）；若必须回滚后端，按 §3 的「只把用户值恢复为默认」执行，新版前端仍读到 `0.9 / 36500`。

## 7. 测试用例

以下用 `$BASE=https://jp-cika.cn`、`$TOKEN` 表示有效 token。

| # | 请求 | 期望 |
|---|------|------|
| 1 | `GET $BASE/api/user/learning-config`（新用户） | `code=200`；两字段为默认值 `0.9` / `36500`，类型为 number |
| 2 | `PUT .../fsrs-config` body `{"fsrsRequestRetention":0.95,"fsrsMaximumInterval":730}` | `code=200`；随后 GET 回读为 `0.95 / 730` |
| 3 | 重复执行 #2 | 仍 `code=200`，值不变（幂等） |
| 4 | `PUT .../fsrs-config` body `{"fsrsRequestRetention":1.5,"fsrsMaximumInterval":365}` | 业务码非 200（2005）；数据库未被修改 |
| 5 | `PUT .../fsrs-config` body `{"fsrsRequestRetention":0.9,"fsrsMaximumInterval":0}` | 业务码非 200 |
| 6 | `PUT .../fsrs-config` body `{"fsrsRequestRetention":0.9,"fsrsMaximumInterval":40000}` | 业务码非 200；保持率也未被写入（整次拒绝） |
| 7 | 先 PUT `0.90 / 730`，再 PUT 只含 `{"fsrsRequestRetention":0.85}` | `code=200`；GET 回读 `0.85 / 730`（间隔保持原值） |
| 8 | 不带 token 调 GET / PUT | HTTP 401（前端会重新登录并重试一次） |
| 9 | 设备 A PUT `0.85 / 180`，设备 B GET | B 读到 `0.85 / 180` |
| 10 | 旧版小程序（不读新字段）调 GET | 响应可正常解析，无报错 |
| 11 | `PUT .../fsrs-config` body `{"fsrsRequestRetention":0.9,"fsrsMaximumInterval":36500}` | `code=200`（上界可存，即界面「不限」） |
| 12 | `PUT .../fsrs-config` body `{"fsrsRequestRetention":0.8525,"fsrsMaximumInterval":365}` | 业务码非 200（保持率最多 3 位小数） |
| 13 | `PUT .../fsrs-config` body `{}`（或两项均为 `null`） | 业务码非 200（至少提交一项）；数据库未被修改 |

`curl` 示例：

```bash
# 读
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/user/learning-config"

# 写
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fsrsRequestRetention":0.95,"fsrsMaximumInterval":365}' \
  "$BASE/api/user/learning-config/fsrs-config"
```

## 8. 后端验收清单

- [ ] 两列已加，均为 `NOT NULL` 且默认值为 `0.900` / `36500`
- [ ] 迁移后历史行两列无 `NULL`（由列默认值填充），未执行额外 DML
- [ ] GET 始终返回两个 key，类型为 number，永不为 `null`
- [ ] PUT 支持部分更新（只改提交项）、至少提交一项、校验范围与小数位（≤3 位）、幂等，错误返回 2005
- [ ] PUT 不触发任何卡片/调度重算
- [ ] §7 的 13 条用例在自己环境全部通过（含两台设备一致性）
- [ ] 旧版小程序兼容（可忽略字段）
- [x] 后端已上线（2026-10-26），已通知前端按 v3 联调

## 9. 前端对应改动（供后端理解上下文）

- 读：复习页 `onLoad` 先 `await getApp().waitForLogin()`，再取配置并**应用后才计算**评分预览与调度。
- 兜底：配置失败 → 用本机缓存；无缓存 → 默认 `0.90 / 36500`（与后端默认值同值），不阻塞答题。
- 写：设置页「复习参数」两项选择器 + 恢复默认；**只提交改动的那一项**（部分更新），失败由请求层提示一次并回滚界面。
- 参数只影响下一次评分，不重排历史卡片。
- 注意：后端返回的两字段不会为 `null`，前端不要再写「读到 null 才用默认值」的分支；仅在请求整体失败时兜底。

## 10. 变更记录

| 日期 | 变更 | 备注 |
|------|------|------|
| 2026-10-26 | 首版 | 对应 `#004`，待后端确认字段名与接口路径 |
| 2026-10-26 | v2：两列改 `NOT NULL DEFAULT 0.900 / 36500`，接口不再返回 `null`；错误码由示例 `400` 改为项目统一 `2005`；PUT 成功返回完整配置对象；新增「保持率最多 3 位小数」校验；用例 #1 期望改为默认值、新增 #12 | 由需求方决定，前端需注意 §2 / §4 / §5 / §9 四处变化 |
| 2026-10-26 | v3：写接口改为部分更新（传几项改几项、至少一项、整次原子拒绝）；用例 #7 由"缺项失败"改为"只改保持率、间隔保持"，新增 #13 空请求体 | 前端设置页应只提交改动项，避免用陈旧值覆盖另一端 |
