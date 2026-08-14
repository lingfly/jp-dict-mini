/**
 * 临时数据源（mock）
 *
 * 背景：后端单独维护，`GET /api/review/due-cards`（批量返回当天卡片含 FSRS 状态）
 * 与 `POST /api/review/submit` 的 FSRS 字段扩展尚未就绪。
 *
 * 此模块在本地模拟后端行为：
 * - 内置演示词库作为"已选新词"，首次进入自动生成一批 New 状态卡片
 * - FSRS 卡片状态与复习日志持久化到本地 storage
 * - 新词提交后，由"卡片复习列表接口"（mock 版本）统一返回新词 + 到期卡
 *
 * 后端就绪后：将 dataSource.js 中 USE_MOCK 置为 false，此模块不再被使用。
 */
const fsrs = require('./fsrs')

const STORAGE_CARDS = 'fsrs_mock_cards'
const STORAGE_LOGS = 'fsrs_mock_logs'

/**
 * 演示词库（模拟后端已入库、用户已选的新词）
 */
const DEMO_WORDS = [
  {
    id: 101,
    kanji: '桜',
    kana: 'さくら',
    accent: 0,
    jlptLevel: 'N3',
    wordType: '名词',
    definitions: [
      {
        id: 1,
        definitionCn: '樱花',
        usage: '日本の春の花',
        note: '日本春天的代表花卉',
        examples: [
          { id: 1, sentenceJp: '春に桜が咲きます。', sentenceKana: 'はるにさくらがさきます。', sentenceCn: '春天樱花盛开。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 102,
    kanji: '綺麗',
    kana: 'きれい',
    accent: 1,
    jlptLevel: 'N4',
    wordType: '形容动词',
    definitions: [
      {
        id: 2,
        definitionCn: '漂亮；干净',
        usage: '見た目が美しい',
        note: '',
        examples: [
          { id: 2, sentenceJp: 'この花はとても綺麗です。', sentenceKana: 'このはなはとてもきれいです。', sentenceCn: '这朵花非常漂亮。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 103,
    kanji: '頑張る',
    kana: 'がんばる',
    accent: 3,
    jlptLevel: 'N4',
    wordType: '动词',
    definitions: [
      {
        id: 3,
        definitionCn: '努力；加油',
        usage: '力を尽くして努力する',
        note: '',
        examples: [
          { id: 3, sentenceJp: '試験に向けて頑張ります。', sentenceKana: 'しけんにむけてがんばります。', sentenceCn: '为了考试我会努力。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 104,
    kanji: '図書館',
    kana: 'としょかん',
    accent: 3,
    jlptLevel: 'N4',
    wordType: '名词',
    definitions: [
      {
        id: 4,
        definitionCn: '图书馆',
        usage: '本を読んだり借りたりする場所',
        note: '',
        examples: [
          { id: 4, sentenceJp: '図書館で勉強します。', sentenceKana: 'としょかんでべんきょうします。', sentenceCn: '在图书馆学习。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 105,
    kanji: '美味しい',
    kana: 'おいしい',
    accent: 0,
    jlptLevel: 'N5',
    wordType: '形容词',
    definitions: [
      {
        id: 5,
        definitionCn: '好吃的；美味的',
        usage: '味が良い',
        note: '',
        examples: [
          { id: 5, sentenceJp: 'この料理は美味しいです。', sentenceKana: 'このりょうりはおいしいです。', sentenceCn: '这道菜很好吃。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 106,
    kanji: '手紙',
    kana: 'てがみ',
    accent: 0,
    jlptLevel: 'N4',
    wordType: '名词',
    definitions: [
      {
        id: 6,
        definitionCn: '信；书信',
        usage: '文章を書いて相手に送るもの',
        note: '',
        examples: [
          { id: 6, sentenceJp: '友達に手紙を書きます。', sentenceKana: 'ともだちにてがみをかきます。', sentenceCn: '给朋友写信。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 107,
    kanji: '約束',
    kana: 'やくそく',
    accent: 0,
    jlptLevel: 'N3',
    wordType: '名词',
    definitions: [
      {
        id: 7,
        definitionCn: '约定；承诺',
        usage: '前もって決めたこと',
        note: '',
        examples: [
          { id: 7, sentenceJp: '友達と約束をしました。', sentenceKana: 'ともだちとやくそくをしました。', sentenceCn: '和朋友约好了。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 108,
    kanji: '経験',
    kana: 'けいけん',
    accent: 0,
    jlptLevel: 'N3',
    wordType: '名词',
    definitions: [
      {
        id: 8,
        definitionCn: '经验；经历',
        usage: '実際に体験したこと',
        note: '',
        examples: [
          { id: 8, sentenceJp: 'これは貴重な経験です。', sentenceKana: 'これはきちょうなけいけんです。', sentenceCn: '这是宝贵的经验。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 109,
    kanji: '大切',
    kana: 'たいせつ',
    accent: 0,
    jlptLevel: 'N3',
    wordType: '形容动词',
    definitions: [
      {
        id: 9,
        definitionCn: '重要；珍贵',
        usage: '大事な',
        note: '',
        examples: [
          { id: 9, sentenceJp: '家族は大切です。', sentenceKana: 'かぞくはたいせつです。', sentenceCn: '家人很重要。' }
        ]
      }
    ],
    wordAudios: []
  },
  {
    id: 110,
    kanji: '忘れる',
    kana: 'わすれる',
    accent: 0,
    jlptLevel: 'N4',
    wordType: '动词',
    definitions: [
      {
        id: 10,
        definitionCn: '忘记',
        usage: '記憶から消える',
        note: '',
        examples: [
          { id: 10, sentenceJp: '宿題を忘れました。', sentenceKana: 'しゅくだいをわすれました。', sentenceCn: '忘了作业。' }
        ]
      }
    ],
    wordAudios: []
  }
]

/**
 * 获取今天结束的毫秒时间戳
 */
function endOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
}

/**
 * 时间值统一转为毫秒时间戳（兼容 Date / ISO 字符串 / 数字）
 */
function toTs(v) {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.getTime()
  const n = Number(v)
  if (Number.isNaN(n)) {
    const parsed = Date.parse(v)
    return Number.isNaN(parsed) ? null : parsed
  }
  return n
}

/**
 * 规范化 FSRS 卡片：due/last_review 统一为毫秒时间戳数字
 * （createEmptyCard 返回的 due 是 Date，存入 storage 会被序列化为字符串，必须转换）
 */
function normalizeCard(card) {
  if (!card) return null
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
    last_review: toTs(card.last_review)
  }
}

/**
 * 初始化 mock 卡片库：首次进入用演示词库生成 New 状态卡片
 */
function initStore() {
  const store = wx.getStorageSync(STORAGE_CARDS)
  if (store && Object.keys(store).length > 0) {
    return store
  }
  const cards = {}
  const now = Date.now()
  DEMO_WORDS.forEach((word, index) => {
    const card = fsrs.createCard(new Date(now + index))
    cards[word.id] = {
      fsrsCard: normalizeCard(card),
      word: word
    }
  })
  wx.setStorageSync(STORAGE_CARDS, cards)
  wx.setStorageSync(STORAGE_LOGS, [])
  return cards
}

function getStore() {
  const raw = wx.getStorageSync(STORAGE_CARDS)
  const store = (raw && typeof raw === 'object' && Object.keys(raw).length > 0)
    ? raw
    : initStore()
  // 兼容旧数据：确保 fsrsCard 字段规范化（due 为数字时间戳），否则时间比较会失效
  Object.keys(store).forEach(wordId => {
    if (store[wordId] && store[wordId].fsrsCard) {
      store[wordId].fsrsCard = normalizeCard(store[wordId].fsrsCard)
    }
  })
  return store
}

function saveStore(store) {
  wx.setStorageSync(STORAGE_CARDS, store)
}

/**
 * 卡片类型：根据 FSRS state 推导
 */
function cardType(state) {
  if (state === fsrs.State.New) return 'NEW_WORD'
  if (state === fsrs.State.Learning || state === fsrs.State.Relearning) return 'INTRADAY_TRIGGERED'
  return 'REGULAR_REVIEW'
}

/**
 * 获取当天待复习卡片（模拟后端 GET /api/review/due-cards）
 * 返回统一结构：{ code, data: { cards, progress } }
 */
function getDueCards() {
  const store = getStore()
  const todayEnd = endOfToday()
  const cards = []

  Object.keys(store).forEach(wordId => {
    const item = store[wordId]
    if (item.fsrsCard.due <= todayEnd) {
      cards.push({
        wordId: String(wordId),
        type: cardType(item.fsrsCard.state),
        fsrsCard: item.fsrsCard,
        word: item.word // 内嵌单词数据，mock 阶段免去逐个拉详情
      })
    }
  })

  cards.sort((a, b) => a.fsrsCard.due - b.fsrsCard.due)

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
}

/**
 * 保存复习结果（模拟后端 POST /api/review/submit）
 * @param {Object} payload { wordId, rating, responseTimeMs, card, log }
 */
function submitReview(payload) {
  const store = getStore()
  const wordId = String(payload.wordId)
  if (store[wordId] && payload.card) {
    store[wordId].fsrsCard = payload.card
    saveStore(store)
  }
  // 记录复习日志
  const logs = wx.getStorageSync(STORAGE_LOGS) || []
  logs.push({
    wordId: payload.wordId,
    rating: payload.rating,
    responseTimeMs: payload.responseTimeMs,
    log: payload.log,
    time: Date.now()
  })
  wx.setStorageSync(STORAGE_LOGS, logs)
  return { code: 200, data: {} }
}

/**
 * 获取学习状态（模拟后端 GET /api/review/learning-status）
 */
function getLearningStatus() {
  const store = getStore()
  const todayEnd = endOfToday()
  let dueCount = 0
  Object.keys(store).forEach(wordId => {
    if (store[wordId].fsrsCard.due <= todayEnd) dueCount++
  })
  return {
    code: 200,
    data: { dueCount }
  }
}

module.exports = {
  DEMO_WORDS,
  getDueCards,
  submitReview,
  getLearningStatus
}
