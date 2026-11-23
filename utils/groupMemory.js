// 加词分组记忆（#015）
//
// 目的：用户往同一词单的同一分组反复加词时，不必每次重新选。
//
// 设计要点（依据 specs/changes/015-wordlist-remember-group/）：
//   - **按词单分别记忆**（用户选择方案 B）：key 是 wordListId，不同词单互不影响。
//     A 词单记「动词」不会把 B 词单的默认值也改成「动词」。
//   - **只记成功的选择**：调用方在加词成功后才调 rememberGroupId，失败不写，
//     避免记住一个没真正生效的选择。
//   - **单 key 存一个 map**：{ [wordListId]: groupId }，而不是每个词单一个 storage key，
//     避免本地存储无限增长；超过 MAX_LISTS 时按插入顺序淘汰最旧的。
//   - **groupId 全程字符串**（AGENTS.md「ID 精度」硬规则）：雪花 ID 超过 JS 安全整数，
//     禁止 Number()/parseInt 转换。null 表示「无分组」，也要能被记住
//     （用户特意选无分组是合法选择，不该被旧记忆带偏）。
//
// 存储结构示例：
//   { "2120078626299236352": "2120078626500562944",
//     "2120089438606790656": null }
//   —— value 为 null 表示"上次选的是无分组"；key 不存在表示"从没记过"。

const STORAGE_KEY = 'wordlistGroupMemory_v1'
const MAX_LISTS = 50 // 最多记多少个词单，超出淘汰最旧的

/**
 * 读整张记忆表。任何异常都返回空表（记忆是锦上添花的功能，坏了不能影响加词主流程）。
 * @returns {Object} { [wordListId]: groupId|null }
 */
function readAll() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return {}
    return raw
  } catch (e) {
    return {}
  }
}

function writeAll(map) {
  try {
    wx.setStorageSync(STORAGE_KEY, map)
  } catch (e) {
    // 写失败不影响主流程：下次就退回无分组
  }
}

/** 淘汰超出上限的旧条目（JS 对象保持插入顺序，取前 N 个删掉） */
function trim(map) {
  const keys = Object.keys(map)
  if (keys.length <= MAX_LISTS) return map
  const drop = keys.slice(0, keys.length - MAX_LISTS)
  drop.forEach((k) => { delete map[k] })
  return map
}

/**
 * 取某词单上次选的分组。
 * @param {String} wordListId 词单 ID（字符串）
 * @returns {{ found: Boolean, groupId: String|null }}
 *   found=false 表示这个词单从没记过（调用方应默认「无分组」）；
 *   found=true 且 groupId=null 表示上次特意选的就是「无分组」。
 *   用 found 而不是「返回 null」来区分这两种情况，避免调用方无法判断。
 */
function getRememberedGroupId(wordListId) {
  const id = toId(wordListId)
  if (!id) return { found: false, groupId: null }
  const map = readAll()
  if (!Object.prototype.hasOwnProperty.call(map, id)) {
    return { found: false, groupId: null }
  }
  const v = map[id]
  // 存储里可能是 null（无分组）或字符串；统一成字符串或 null，禁止数字
  return { found: true, groupId: (v === null || v === undefined) ? null : String(v) }
}

/**
 * 记住某词单本次选的分组。**只在加词成功后调用。**
 * @param {String} wordListId 词单 ID（字符串）
 * @param {String|null} groupId 选中的分组 ID（字符串），null 表示「无分组」
 */
function rememberGroupId(wordListId, groupId) {
  const id = toId(wordListId)
  if (!id) return
  const map = readAll()
  // 先删再设，让它在对象里排到最后（相当于"最近使用"），淘汰时先丢掉最久没用的
  delete map[id]
  map[id] = (groupId === null || groupId === undefined) ? null : String(groupId)
  writeAll(trim(map))
}

/**
 * 清除某词单的记忆（记忆指向的分组已被删除时用）。
 * @param {String} wordListId 词单 ID（字符串）
 */
function forgetGroupId(wordListId) {
  const id = toId(wordListId)
  if (!id) return
  const map = readAll()
  if (Object.prototype.hasOwnProperty.call(map, id)) {
    delete map[id]
    writeAll(map)
  }
}

/** 清空全部记忆（调试/登出用） */
function clearAll() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (e) {
    // ignore
  }
}

/**
 * 把入参安全转成字符串 ID。
 * 空值返回 ''；数字会被转成字符串（但雪花 ID 传数字进来已经丢精度了，
 * 所以调用方必须保证传字符串——这里兜底只为避免崩溃，不做补救）。
 */
function toId(v) {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  return s
}

module.exports = {
  getRememberedGroupId,
  rememberGroupId,
  forgetGroupId,
  clearAll,
  STORAGE_KEY,
  MAX_LISTS
}
