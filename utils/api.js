/**
 * API 接口定义
 *
 * needAuth 参数说明：
 * - true（默认）: 需要 token 认证
 * - false: 不需要 token（如登录接口）
 */
const { get, post, put, formPost } = require('./request')

/**
 * 词单相关 API（需要认证）
 */
const wordlistApi = {
  // 获取可用词单
  getAvailable() {
    return get('/api/wordlist/available') // 需要 token
  },

  // 查询词单列表（支持分类、关键字、我的词单筛选）
  list(params) {
    return get('/api/wordlist/list', params) // 需要 token
  },

  // 获取词单分类列表
  getCategories() {
    return get('/api/wordlist/categories') // 需要 token
  },

  // 选择词单
  select(userId, wordListId) {
    return post('/api/wordlist/select', { userId, wordListId }) // 需要 token
  },

  // 获取当前词单
  getCurrent() {
    return get('/api/wordlist/current') // 需要 token
  },

  // 获取词单详情
  getDetail(wordListId) {
    return get('/api/wordlist/detail', { wordListId }) // 需要 token
  },

  // 获取词单单词列表（支持指定排序）
  // sort: addedAt（添加时间）/ kana（假名），order: asc / desc
  getWords(wordListId, page, size, sort, order) {
    const params = { wordListId, page, size }
    if (sort) params.sort = sort
    if (order) params.order = order
    return get('/api/wordlist/words', params) // 需要 token
  },

  // 获取默认词单（收藏夹）
  getDefault() {
    return get('/api/wordlist/default') // 需要 token
  },

  // 收藏单词
  favorite(wordId, wordListId) {
    return post('/api/wordlist/favorite', { wordId, wordListId }) // 需要 token
  },

  // 取消收藏
  unfavorite(wordId, wordListId) {
    return post('/api/wordlist/unfavorite', { wordId, wordListId }) // 需要 token
  }
}

/**
 * FSRS 复习 API（需要认证）
 * 对应后端 FsrsReviewController：
 * - GET  /api/fsrs/due-count?endTs=  查询当天待复习单词总数（用于角标/入口展示）
 * - GET  /api/fsrs/due?endTs=        查询当天全部待复习卡片（进入复习后拉取）
 * - GET  /api/fsrs/card/{wordId}     查询单词 FSRS 卡片状态
 * - POST /api/fsrs/review            提交复习结果（评分 + FSRS 新状态）
 *
 * endTs：本地时区当天 23:59:59.999（Unix 毫秒）
 */
const fsrsApi = {
  // 提交 FSRS 复习结果
  submitReview(data) {
    return post('/api/fsrs/review', data) // 需要 token
  },

  // 添加单个新词（创建 FSRS 学习卡，幂等：已存在返回已有卡片）
  addCard(wordId) {
    return post('/api/fsrs/card', { wordId }) // 需要 token
  },

  // 批量添加新词（创建 FSRS 学习卡，幂等：已存在的跳过）
  addCards(wordIds) {
    return post('/api/fsrs/cards', { wordIds }) // 需要 token
  },

  // 查询某单词的 FSRS 卡片状态
  getCard(wordId) {
    return get(`/api/fsrs/card/${wordId}`) // 需要 token
  },

  // 查询当天所有需要复习的单词卡片
  getDueCards(endTs) {
    return get('/api/fsrs/due', { endTs }) // 需要 token
  },

  // 查询当天需要复习的单词总数
  getDueCount(endTs) {
    return get('/api/fsrs/due-count', { endTs }) // 需要 token
  },

  // 查询未来 15 天（含今天）每天需要复习的单词数
  // 返回 List<{ date: "yyyy-MM-dd", count: int }>
  getDueForecast() {
    return get('/api/fsrs/due-forecast') // 需要 token
  }
}

/**
 * 复习相关 API（需要认证）
 * 注意：以下为旧接口（/api/review/*），新流程统一走 fsrsApi
 */
const reviewApi = {
  // 获取下一个单词（实时查询）
  getNextWord() {
    return get('/api/review/next-word') // 需要 token
  },

  // 批量获取当天待复习卡片（新词 + 到期卡，含 FSRS 状态）
  getDueCards() {
    return get('/api/review/due-cards') // 需要 token
  },

  // 提交复习结果（rating 0-3，card/log 为 FSRS 新状态）
  submitReview(data) {
    return post('/api/review/submit', data) // 需要 token
  },

  // 获取学习状态
  getLearningStatus() {
    return get('/api/review/learning-status') // 需要 token
  },

  // 获取待复习单词列表（分页）
  getDueWords(page, size) {
    return get('/api/review/due', { page, size }) // 需要 token
  },

  // 获取新词列表
  getNewWords(limit) {
    return get('/api/review/new', { limit }) // 需要 token
  },

  // 选择新词
  selectNewWords(wordListId, wordIds) {
    return post('/api/review/select-new-words', { wordListId, wordIds }) // 需要 token
  }
}

/**
 * 单词相关 API（需要认证）
 */
const wordApi = {
  // 搜索单词
  search(keyword) {
    return get('/api/word/search', { key: keyword }) // 参数名是 key
  },

  // 获取单词详情
  getDetail(wordId) {
    return get(`/api/word/${wordId}`) // 需要 token
  },

  // 批量获取单词详情（POST /api/word/batch，最多100个）
  // wordIds 保持字符串传参：wordId 可能超 JS 安全整数（后端 ToStringSerializer），Jackson 字符串→Long 无损
  getDetailBatch(wordIds) {
    return post('/api/word/batch', wordIds) // 需要 token
  }
}

/**
 * 音频相关 API（需要认证）
 */
const audioApi = {
  // 获取音频 Base64
  getBase64(audioId) {
    return get('/api/audio/base64', { audioId }) // 需要 token
  }
}

/**
 * AI 查词 API
 */
const aiDictApi = {
  // 同步查词（返回 AiDictQueryResult: { logId, words: [...] }）
  query(word, thinking, reasoningEffort) {
    return post('/api/ai-dict/query', { word, thinking, reasoningEffort })
  },

  // 反馈：符合预期（将 AI 查词结果加入词库，需传入 selectedIndex）
  markCorrect(logId, selectedIndex) {
    return post('/api/ai-dict/feedback/correct', { logId, selectedIndex })
  },

  // 反馈：不符合预期
  markIncorrect(logId) {
    return post('/api/ai-dict/feedback/incorrect', { logId })
  },

  // SSE 流式查词 URL
  getStreamUrl(word, token) {
    const app = getApp()
    return `${app.globalData.apiBaseUrl}/api/ai-dict/stream?word=${encodeURIComponent(word)}&token=${encodeURIComponent(token)}`
  }
}

/**
 * 认证相关 API
 */
const authApi = {
  // 微信登录（不需要 token）
  loginByWechat(data) {
    return post('/api/auth/login/wechat', data, false) // 登录接口不需要 token
  },

  // 发送验证码（不需要 token）
  sendCode(data) {
    return post('/api/auth/send-code', data, false)
  },

  // 注册（不需要 token）
  register(data) {
    return post('/api/auth/register', data, false)
  },

  // 密码登录（不需要 token）
  loginByPassword(data) {
    return post('/api/auth/login/password', data, false)
  },

  // 验证码登录（不需要 token）
  loginByCode(data) {
    return post('/api/auth/login/code', data, false)
  },

  // 重置密码（不需要 token）
  resetPassword(data) {
    return post('/api/auth/reset-password', data, false)
  },

  // 获取当前用户信息（需要 token）
  getCurrentUser() {
    return get('/api/auth/current-user') // 需要 token
  },

  // 登出（需要 token）
  logout() {
    return post('/api/auth/logout') // 需要 token
  }
}

/**
 * 用户相关 API（需要认证）
 */
const userApi = {
  // 获取用户信息
  getProfile() {
    return get('/api/user/profile') // 需要 token
  },

  // 更新用户信息
  updateProfile(data) {
    return post('/api/user/profile', data) // 需要 token
  },

  // 获取学习配置
  getLearningConfig() {
    return get('/api/user/learning-config') // 需要 token
  },

  // 更新每日新词数量
  updateDailyNewWords(dailyNewWords) {
    return put('/api/user/learning-config/daily-new-words', { dailyNewWords }) // 需要 token
  },

  // 更新单词发音配置
  updateVoiceConfig(voiceConfig) {
    return put('/api/user/learning-config/voice-config', { voiceConfig }) // 需要 token
  },

  // 更新查询时释义折叠配置
  updateCollapseDefinitionOnQuery(collapseDefinitionOnQuery) {
    return put('/api/user/learning-config/collapse-definition-on-query', { collapseDefinitionOnQuery }) // 需要 token
  },

  // 更新复习时释义折叠配置
  updateCollapseDefinitionOnReview(collapseDefinitionOnReview) {
    return put('/api/user/learning-config/collapse-definition-on-review', { collapseDefinitionOnReview }) // 需要 token
  }
}

/**
 * 用户反馈 API（需要认证）
 */
const feedbackApi = {
  // 提交反馈
  create(data) {
    return post('/api/feedback', data)
  },

  // 查看我的反馈列表
  list(pageNum, pageSize) {
    return get('/api/feedback/my', { pageNum, pageSize })
  },

  // 查看我的反馈详情
  getDetail(feedbackId) {
    return get(`/api/feedback/my/${feedbackId}`)
  }
}

/**
 * 纠错相关 API（需要认证）
 */
const correctionApi = {
  // 提交单词基本信息纠错（multipart/form-data）
  submitWord(data) {
    return formPost('/api/correction/word', data)
  },

  // 提交释义纠错（JSON body）
  submitDefinition(data) {
    return post('/api/correction/definition', data)
  },

  // 获取待审核纠错列表
  listPending() {
    return get('/api/correction/pending')
  },

  // 审核通过纠错（form-data，可修改字段）
  approve(correctionId, data) {
    return formPost(`/api/correction/${correctionId}/approve`, data)
  },

  // 驳回纠错
  reject(correctionId, reason) {
    return post(`/api/correction/${correctionId}/reject`, { reason })
  }
}

module.exports = {
  wordlistApi,
  fsrsApi,
  reviewApi,
  wordApi,
  audioApi,
  authApi,
  userApi,
  aiDictApi,
  feedbackApi,
  correctionApi
}
