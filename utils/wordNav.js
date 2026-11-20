// utils/wordNav.js
// 单词详情页「左右滑动切换上一个 / 下一个单词」的导航上下文交接（#017）
//
// 为什么不把 id 序列拼进 URL：一个词单可能有几百个单词，URL 有长度上限。
// 为什么不用 eventChannel：navigateTo 的 success 回调与新页面 onLoad 谁先谁后取决于基础库实现，
//   监听注册晚于 emit 时事件直接丢失，滑动会静默失效且难以定位。这里用「一次性令牌 + 内存暂存」，
//   详情页在 onLoad 里同步 take()，顺序确定。
// 为什么不用 globalData 单槽：页面栈里可能同时存在多个详情页实例（列表→详情→纠错→…），
//   用令牌区分，互不覆盖。

const STAGE_TTL = 60 * 1000 // 暂存有效期：超时未取走则丢弃，避免内存滞留
const MAX_STAGE = 8         // 同时暂存的上限（正常只有 1 个）

const store = {}
let seq = 0

function nextToken() {
  seq += 1
  return 'n' + Date.now().toString(36) + seq.toString(36)
}

/** 清理过期与超量的暂存 */
function prune() {
  const now = Date.now()
  Object.keys(store).forEach((t) => {
    if (now - store[t].at > STAGE_TTL) delete store[t]
  })
  const left = Object.keys(store)
  if (left.length > MAX_STAGE) {
    left.sort((a, b) => store[a].at - store[b].at)
    left.slice(0, left.length - MAX_STAGE).forEach((t) => { delete store[t] })
  }
}

/**
 * 暂存列表顺序，返回令牌
 * @param {string[]} ids 列表当前展示顺序的单词 id（全程字符串，遵守 C-03）
 * @param {string} currentId 被点开的单词 id
 * @returns {string} 令牌；ids 为空时返回空串（详情页据此退化为「不响应滑动」）
 */
function stage(ids, currentId) {
  const list = (ids || []).map(String).filter((id) => !!id)
  if (!list.length) return ''
  prune()
  const token = nextToken()
  store[token] = { ids: list, currentId: String(currentId || ''), at: Date.now() }
  return token
}

/**
 * 取走暂存（取一次即删，避免同一令牌被重复消费）
 * @param {string} token stage() 返回的令牌
 * @returns {{ids: string[], currentId: string}|null}
 */
function take(token) {
  if (!token) return null
  const item = store[token]
  if (!item) return null
  delete store[token]
  if (Date.now() - item.at > STAGE_TTL) return null
  return { ids: item.ids, currentId: item.currentId }
}

module.exports = { stage, take }
