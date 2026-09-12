/**
 * 音调型工具
 *
 * 后端一个单词的音调型可能不止一个：数据库以逗号分隔的字符串存储（如 "0,2"），
 * 接口对外统一以数组（如 [0, 2]）返回与接收。本模块负责数组、展示文本、
 * 表单输入字符串之间的转换，兼容旧的单个数字（Integer）格式。
 */

// 圆圈数字 0-10
const CIRCLES = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

// 分隔符：半角逗号 / 顿号 / 全角逗号 / 空白
const SEPARATOR_REGEX = /[,、，\s]+/

/** 全角数字 → 半角数字（中文输入法下容易输入全角数字） */
function toHalfWidthDigits(text) {
  return String(text).replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
}

/** 单个音调 → 圆圈数字（0-10 之外原样输出） */
function circleOf(num) {
  const n = Number(num)
  if (Number.isInteger(n) && n >= 0 && n <= 10) return CIRCLES[n]
  return num === null || num === undefined ? '' : String(num)
}

/**
 * 规范化音调值：兼容数组 / 逗号（、，空格）分隔字符串 / 单个数字
 * @param {Array|String|Number} accent
 * @returns {Number[]} 去重后的音调数组（保持原顺序）
 */
function normalize(accent) {
  const list = []
  const push = (v) => {
    if (v === null || v === undefined) return
    const text = toHalfWidthDigits(v).trim()
    if (text === '') return
    const n = Number(text)
    if (!Number.isInteger(n) || n < 0) return
    if (list.indexOf(n) === -1) list.push(n)
  }
  if (Array.isArray(accent)) {
    accent.forEach(push)
  } else if (typeof accent === 'string' || typeof accent === 'number') {
    String(accent).split(SEPARATOR_REGEX).forEach(push)
  }
  return list
}

/**
 * 校验用户输入的音调（表单场景），用于给出不合规提醒
 * @param {Array|String|Number} input 输入框原始值 / 接口返回的数组
 * @returns {{ ok: boolean, message: string, list: Number[] }}
 *   - 留空视为合法（音调非必填），此时 list 为空数组
 *   - 数组（接口返回）一律视为合法，仅做规范化
 */
function validate(input) {
  if (input === null || input === undefined) {
    return { ok: true, message: '', list: [] }
  }
  if (Array.isArray(input)) {
    return { ok: true, message: '', list: normalize(input) }
  }
  const text = toHalfWidthDigits(input).trim()
  if (text === '') {
    return { ok: true, message: '', list: [] }
  }

  const list = []
  const invalid = []
  text.split(SEPARATOR_REGEX).forEach((part) => {
    if (part === '') return
    if (!/^\d+$/.test(part)) {
      invalid.push(part)
      return
    }
    const n = Number(part)
    if (list.indexOf(n) === -1) list.push(n)
  })

  if (invalid.length > 0) {
    return {
      ok: false,
      message: `音调只能填非负整数，请检查「${invalid.join('、')}」`,
      list
    }
  }
  return { ok: true, message: '', list }
}

/** 音调 → 展示文本，如 [0,2] → '0、2'；无音调返回 '' */
function toText(accent) {
  return normalize(accent).join('、')
}

/** 音调 → 圆圈数字文本，如 [0,2] → '⓪②'；无音调返回 '' */
function toCircles(accent) {
  return normalize(accent).map(circleOf).join('')
}

/** 判断两个音调值是否相同（按规范化后的数组比较） */
function equals(a, b) {
  const la = normalize(a)
  const lb = normalize(b)
  if (la.length !== lb.length) return false
  return la.every((v, i) => v === lb[i])
}

/** 是否填写了音调 */
function has(accent) {
  return normalize(accent).length > 0
}

/**
 * 转为接口请求参数
 * - 表单（@RequestParam List<Integer>）传逗号分隔字符串 '0,2'
 * - JSON body（List<Integer>）传数组 [0,2]
 * @param {Array|String|Number} accent
 * @param {Boolean} asArray 是否返回数组
 * @returns {String|Array|undefined} 无音调时返回 undefined（不传该参数）
 */
function toParam(accent, asArray) {
  const list = normalize(accent)
  if (list.length === 0) return undefined
  return asArray ? list : list.join(',')
}

module.exports = {
  CIRCLES,
  circleOf,
  toHalfWidthDigits,
  normalize,
  validate,
  toText,
  toCircles,
  equals,
  has,
  toParam
}
