/**
 * FSRS 数据源统一入口
 *
 * - USE_MOCK = true ：后端 FSRS 接口未就绪，使用本地临时数据（mockStore）
 * - USE_MOCK = false：走后端真实接口
 *   - 复习数量展示：GET /api/fsrs/due-count?endTs=（只查总数，轻量）
 *   - 进入复习后：  GET /api/fsrs/due?endTs=（一次性拉当天全部卡片）
 *   - 提交评分：    POST /api/fsrs/review
 *
 * 字段约定（对齐后端 DTO）：
 * - FsrsCardResponse 平铺返回 FSRS 字段，且为 camelCase（lastReview/elapsedDays/...）
 * - ts-fsrs 使用 snake_case（last_review/elapsed_days/...）
 * - 因此进出都需做 camelCase ↔ snake_case 转换
 * - wordId 由后端序列化为字符串（ToStringSerializer 防大整数精度丢失），前端全程保持字符串，
 *   Jackson 反序列化时字符串可无损转回 Long；切忌 Number() 强转（雪花 ID 超 JS 安全整数会丢精度）
 */
const { fsrsApi } = require('../api')
const mockStore = require('./mockStore')
const { State } = require('./fsrs')

// 后端 FSRS 接口已就绪（FsrsReviewController），置为 false 走真实接口
const USE_MOCK = false

// 与前端 ts-fsrs 版本保持一致（package: ts-fsrs v5.4.1）
const FSRS_VERSION = '5.4.1'

/**
 * 获取今天结束的毫秒时间戳（本地时区 23:59:59.999）
 * 与后端 due-count / due 接口的 endTs 参数保持一致
 */
function endOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
}

/**
 * 生成幂等请求 ID（后端 clientRequestId 必填，防止网络重试重复提交）
 */
function genClientRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 后端平铺 camelCase 卡片 → ts-fsrs snake_case 卡片
 * 输入：FsrsCardResponse（state/due/stability/... 平铺在顶层）
 * 输出：可直接喂给 scheduler.next() 的 Card 对象
 */
function toFsrsCard(flat) {
  return {
    due: flat.due,
    stability: flat.stability,
    difficulty: flat.difficulty,
    elapsed_days: flat.elapsedDays,
    scheduled_days: flat.scheduledDays,
    reps: flat.reps,
    lapses: flat.lapses,
    learning_steps: flat.learningSteps,
    state: flat.state,
    last_review: flat.lastReview
  }
}

/**
 * 前端 snake_case 卡片 → 后端 camelCase 卡片（FsrsReviewRequest.Card）
 */
function toRequestCard(card) {
  return {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due,
    lastReview: card.last_review,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps
  }
}

/**
 * 前端 snake_case 日志 → 后端 camelCase 日志（FsrsReviewRequest.Log）
 * log.rating 为 ts-fsrs Rating 枚举（Again=1/Hard=2/Good=3/Easy=4），与后端 1-4 约束一致
 */
function toRequestLog(log) {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due,
    review: log.review,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps
  }
}

/**
 * 归一化后端 due 卡片项 → 页面所需结构 { wordId, type, fsrsCard, word }
 * 后端 FsrsCardResponse 不内嵌单词数据，word 为 null，页面会逐卡拉详情兜底
 */
function normalizeDueCard(item) {
  if (!item) return null
  const fsrsCard = toFsrsCard(item)
  const wordId = item.wordId !== undefined && item.wordId !== null ? String(item.wordId) : null
  let type = item.type
  if (!type) {
    if (fsrsCard.state === State.New) {
      type = 'NEW_WORD'
    } else if (fsrsCard.state === State.Learning || fsrsCard.state === State.Relearning) {
      type = 'INTRADAY_TRIGGERED'
    } else {
      type = 'REGULAR_REVIEW'
    }
  }
  return {
    wordId,
    type: type || 'REGULAR_REVIEW',
    fsrsCard,
    word: item.word || null
  }
}

/**
 * 获取当天待复习卡片（进入复习后调用，一次拉全部）
 * 返回：{ code, data: { cards: [{ wordId, type, fsrsCard, word }], progress } }
 */
async function getDueCards() {
  if (USE_MOCK) {
    return mockStore.getDueCards()
  }
  try {
    const res = await fsrsApi.getDueCards(endOfToday())
    const list = Array.isArray(res.data)
      ? res.data
      : (res.data && Array.isArray(res.data.cards) ? res.data.cards : [])
    const cards = list.map(normalizeDueCard).filter(Boolean)
    return {
      code: 200,
      data: {
        cards,
        progress: {
          total: cards.length,
          completed: 0,
          remaining: cards.length
        }
      }
    }
  } catch (e) {
    console.error('获取待复习卡片失败，使用临时数据:', e)
    return mockStore.getDueCards()
  }
}

/**
 * 提交复习结果（评分 + FSRS 新状态）
 * 按 FsrsReviewRequest 组装：clientRequestId 必填，card/log 转 camelCase
 * 返回：{ code, data: FsrsReviewResultResponse }
 */
async function submitReview(payload) {
  if (USE_MOCK) {
    return mockStore.submitReview(payload)
  }
  try {
    const res = await fsrsApi.submitReview({
      wordId: payload.wordId,
      clientRequestId: genClientRequestId(),
      card: toRequestCard(payload.card),
      log: toRequestLog(payload.log),
      responseTimeMs: payload.responseTimeMs,
      fsrsVersion: FSRS_VERSION
    })
    // FsrsReviewResultResponse：duplicated(幂等命中) / conflict(跨设备冲突) / card(库中最新状态)
    // 将库中最新 card（camelCase 平铺）转为 ts-fsrs 卡片结构，供页面在冲突时覆盖本地状态
    if (res && res.code === 200 && res.data) {
      const data = res.data
      if (data.card) {
        data.card = toFsrsCard(data.card)
      }
      return { code: res.code, data }
    }
    return res
  } catch (e) {
    console.error('提交复习结果失败，使用临时数据:', e)
    return mockStore.submitReview(payload)
  }
}

/**
 * 获取学习状态（今日需复习数量，用于入口展示与 tabBar 角标）
 * 轻量查询：GET /api/fsrs/due-count，只取总数
 * 返回：{ code, data: { dueCount } }
 */
async function getLearningStatus() {
  if (USE_MOCK) {
    return mockStore.getLearningStatus()
  }
  try {
    const res = await fsrsApi.getDueCount(endOfToday())
    if (res.code === 200) {
      return { code: 200, data: { dueCount: Number(res.data) || 0 } }
    }
    return { code: 200, data: { dueCount: 0 } }
  } catch (e) {
    console.error('获取学习状态失败，使用临时数据:', e)
    return mockStore.getLearningStatus()
  }
}

module.exports = {
  USE_MOCK,
  getDueCards,
  submitReview,
  getLearningStatus
}
