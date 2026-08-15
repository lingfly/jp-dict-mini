/**
 * FSRS 调度封装（基于 ts-fsrs v5.4.1）
 *
 * 设计说明：
 * - 用 ts-fsrs 替换原后端 SM-2 调度，计算在前端本地完成
 * - 前端四级评分（0=忘记 1=模糊 2=认识 3=简单）映射到 FSRS Rating
 * - 短间隔（Learning/Relearning）的"多少分钟后复习"改为"多少张卡片后复习"：
 *   1 分钟 = 1 卡片，偏移量 = Math.round((newCard.due - now) / 60000)
 * - 卡片状态字段（due/last_review）统一为毫秒时间戳，便于 JSON 存储与上报
 */
const lib = require('./index.js')

const { fsrs, createEmptyCard, Rating, State } = lib

// 前端四级评分 → FSRS Rating
const RATING_MAP = {
  0: Rating.Again, // 忘记
  1: Rating.Hard, // 模糊
  2: Rating.Good, // 认识
  3: Rating.Easy // 简单
}

let _scheduler = null

/**
 * 获取 FSRS 调度器单例
 */
function getScheduler() {
  if (!_scheduler) {
    _scheduler = fsrs({
      enable_fuzz: false,
      enable_short_term: true,
      request_retention: 0.9,
      maximum_interval: 36500,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m']
    })
  }
  return _scheduler
}

/**
 * 创建新卡片（state=New，due=now）
 */
function createCard(now) {
  return createEmptyCard(now || new Date())
}

/**
 * 时间值转毫秒时间戳
 */
function toTs(v) {
  if (v instanceof Date) return v.getTime()
  return v
}

/**
 * 规范化 card：due/last_review 统一为毫秒时间戳
 */
function normalizeCard(card) {
  return {
    due: toTs(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review ? toTs(card.last_review) : null
  }
}

/**
 * 规范化复习日志
 */
function normalizeLog(log) {
  return {
    rating: log.rating,
    state: log.state,
    due: toTs(log.due),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    review: toTs(log.review),
    learning_steps: log.learning_steps
  }
}

/**
 * 计算下次复习（FSRS 核心调用）
 * @param {Object} card 当前 FSRS 卡片（due 为时间戳或 Date）
 * @param {Number} rating 前端评分 0-3
 * @param {Date} now 当前时间
 * @returns {{ card: Object, log: Object }} 规范化后的新状态与复习日志
 */
function scheduleNext(card, rating, now) {
  const scheduler = getScheduler()
  const result = scheduler.next(card, now, RATING_MAP[rating])
  return {
    card: normalizeCard(result.card),
    log: normalizeLog(result.log)
  }
}

/**
 * 分钟 → 卡片数偏移（1 分钟 = 1 卡片）
 * 用于短间隔卡片在当天队列中的重新插入位置
 * @param {Object} card scheduleNext 返回的新卡片
 * @param {Number} nowMs 当前毫秒时间戳
 * @returns {Number} 至少为 1 的卡片偏移量
 */
function calcCardOffset(card, nowMs) {
  const diffMin = Math.round((card.due - nowMs) / 60000)
  return Math.max(1, diffMin)
}

/**
 * 将时间差格式化为可读文本
 */
function formatDueText(dueTs, nowMs) {
  const diffMs = dueTs - nowMs
  const minutes = Math.round(diffMs / 60000)
  if (minutes <= 0) return '立即'
  if (minutes < 60) return `${minutes}分钟后`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}小时后`
  const days = Math.round(hours / 24)
  return `${days}天后`
}

/**
 * 预计算四级评分（忘记/模糊/认识/简单）的下次复习时间
 * 用于评分按钮下方展示，便于用户预估选择后果
 * @param {Object} card 当前 FSRS 卡片
 * @param {Date|Number} now 当前时间
 * @returns {Array} [{ rating: 0-3, text: '10分钟后' }, ...]
 */
function getRatingPreviews(card, now) {
  const scheduler = getScheduler()
  const recordLog = scheduler.repeat(card, now)
  const nowTs = toTs(now || new Date())
  const order = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

  return order.map((grade, index) => {
    const item = recordLog[grade]
    const due = item && item.card ? toTs(item.card.due) : null
    return {
      rating: index, // 0=忘记 1=模糊 2=认识 3=简单
      text: due ? formatDueText(due, nowTs) : ''
    }
  })
}

module.exports = {
  Rating,
  State,
  createCard,
  scheduleNext,
  calcCardOffset,
  getRatingPreviews
}
