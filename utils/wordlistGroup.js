/**
 * 词单分组数据源统一入口
 *
 * - USE_MOCK = true ：后端接口未就绪，使用本地临时数据（内存态，重新进入即重置）
 * - USE_MOCK = false：走后端真实接口
 *
 * 数据结构（页面与后端共用的形态）：
 * - Word  { wordId, kanji, kana, meaning, learned }
 * - Group { id, name, color, words: Word[] }
 * - 一个单词最多属于一个分组；不属于任何分组的单词平铺在 ungrouped
 *
 * 字段约定：
 * - wordId 由后端序列化为字符串（防大整数精度丢失），前端全程保持字符串，禁止 Number() 强转
 * - learned 优先取后端布尔字段，缺失时按 learningStatus 推导
 *
 * 后端实际接口（WordListController）：
 * - GET  /api/wordlist/groups?wordListId=             获取分组列表（仅分组元信息，不含单词）
 * - GET  /api/wordlist/words?wordListId=              获取词单所有单词（含分组归属）
 * - POST /api/wordlist/groups?wordListId=             创建分组
 * - PUT  /api/wordlist/groups?wordListId=&groupId=    更新分组
 * - DELETE /api/wordlist/groups?wordListId=&groupId=  删除分组
 * - PUT  /api/wordlist/word-group?wordListId=&groupId= 移动单词到分组（groupId为空=未分组）
 */
const { wordlistApi, wordlistGroupApi } = require('./api')

// 后端分组接口就绪后置为 false
const USE_MOCK = false

// 分组标识色（与项目主色 #5B8C7D 同色系，柔和低饱和）
const GROUP_COLORS = ['#5B8C7D', '#4C8DAE', '#E6A23C', '#8B7CC8', '#D4756B', '#67A86A']

/* ============ 本地临时数据（mock） ============ */
const _store = {}   // { [wordListId]: { groups: Group[], ungrouped: Word[] } }
const _seeded = {}  // { [wordListId]: true }
let _seq = 0

function nextId(prefix) {
  _seq += 1
  return `${prefix}_${Date.now()}_${_seq}`
}

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

/** 归一化单词：后端 /api/wordlist/words 返回的单词字段收敛到统一格式 */
function normalizeWord(raw) {
  if (!raw) return null
  return {
    wordId: String(raw.wordId !== undefined && raw.wordId !== null ? raw.wordId : raw.id),
    kanji: raw.kanji || raw.kana || '',
    kana: raw.kana || '',
    meaning: raw.meaning || raw.definitionCn || raw.meanings || '',
    learned: raw.learned === true || raw.learned === 1 ||
      raw.learningStatus === 'learned' || raw.learningStatus === 'mastered' ||
      raw.learningStatus === 'LEARNED' || raw.learningStatus === 'MASTERED',
    groupId: raw.groupId ? String(raw.groupId) : null
  }
}

/**
 * 内置日语测试数据（mock 专用，不依赖真实接口）
 * 每个条目：[kanji, kana, meaning, learned]
 * 覆盖：4 个分组（含 1 个空分组，用于验证空分组橙色提示）
 *       + 12 个未分组单词（超过默认渲染的 8 条，用于验证「查看全部」）
 */
const MOCK_WORDS = [
  /* ---- 分组：重点记忆（6） ---- */
  ['ありがとう', 'ありがとう', '谢谢，感谢', 1],
  ['食べる', 'たべる', '吃', 1],
  ['行く', 'いく', '去，前往', 0],
  ['見る', 'みる', '看，观看', 1],
  ['話す', 'はなす', '说话，交谈', 0],
  ['勉強', 'べんきょう', '学习，用功', 0],
  /* ---- 分组：易错词（4） ---- */
  ['高い', 'たかい', '贵的；高的', 0],
  ['安い', 'やすい', '便宜的', 0],
  ['美味しい', 'おいしい', '好吃的，美味的', 1],
  ['好き', 'すき', '喜欢', 0],
  /* ---- 分组：生活口语（4） ---- */
  ['友達', 'ともだち', '朋友', 1],
  ['家族', 'かぞく', '家人，家庭', 0],
  ['天気', 'てんき', '天气', 0],
  ['時間', 'じかん', '时间', 1],
  /* ---- 未分组（12） ---- */
  ['大学', 'だいがく', '大学', 0],
  ['学生', 'がくせい', '学生', 1],
  ['先生', 'せんせい', '老师，先生', 0],
  ['会社', 'かいしゃ', '公司', 0],
  ['電車', 'でんしゃ', '电车', 0],
  ['駅', 'えき', '车站', 0],
  ['買う', 'かう', '买', 0],
  ['嫌い', 'きらい', '讨厌', 0],
  ['難しい', 'むずかしい', '难的', 0],
  ['簡単', 'かんたん', '简单的', 0],
  ['便利', 'べんり', '方便的', 0],
  ['忙しい', 'いそがしい', '忙的', 0]
]

/** 把 [kanji, kana, meaning, learned] 元组转为 Word 结构 */
function buildWords(rows) {
  return rows.map(r => ({
    wordId: nextId('w'),
    kanji: r[0],
    kana: r[1],
    meaning: r[2],
    learned: !!r[3]
  }))
}

/**
 * 首次进入某词单时用内置测试数据播种
 * 分组切分位置按 MOCK_WORDS 中注释的分段硬编码，保证每次进入都得到一致的演示数据
 */
function seed(wordListId) {
  const all = buildWords(MOCK_WORDS)
  const groups = [
    { id: nextId('g'), name: '重点记忆', color: GROUP_COLORS[0], words: all.splice(0, 6) },
    { id: nextId('g'), name: '易错词', color: GROUP_COLORS[2], words: all.splice(0, 4) },
    { id: nextId('g'), name: '生活口语', color: GROUP_COLORS[1], words: all.splice(0, 4) },
    { id: nextId('g'), name: '待整理', color: GROUP_COLORS[3], words: [] }
  ]
  const state = { groups, ungrouped: all }
  _store[wordListId] = state
  _seeded[wordListId] = true
  return state
}

function ok(data) {
  return { code: 200, data }
}

function fail(message) {
  return { code: 500, message: message || '操作失败' }
}

/* ============ 读 ============ */

/**
 * 获取分组列表 + 未分组单词
 * 返回 { code, data: { groups: Group[], ungrouped: Word[] } }
 *
 * 后端接口分离：
 * 1. GET /api/wordlist/groups?wordListId= 返回分组元信息 [{id, groupName, color, ...}]
 * 2. GET /api/wordlist/words?wordListId=  返回所有单词，每个单词可能有 groupId 字段
 */
async function fetchGroups(wordListId) {
  if (USE_MOCK) {
    if (!_seeded[wordListId]) seed(wordListId)
    return ok(clone(_store[wordListId]))
  }
  try {
    // 并行获取分组列表和单词列表
    const [groupsRes, wordsRes] = await Promise.all([
      wordlistGroupApi.list(wordListId),
      wordlistApi.getWords(wordListId, 1, 9999) // 获取所有单词
    ])

    if (!groupsRes || groupsRes.code !== 200) {
      return groupsRes || fail('获取分组列表失败')
    }

    const groupsData = groupsRes.data || []

    // 初始化分组结构
    const groupMap = {}
    const groups = groupsData.map(g => {
      const group = {
        id: String(g.id),
        name: g.groupName || g.name || '未命名',
        color: g.color || GROUP_COLORS[0],
        words: []
      }
      groupMap[group.id] = group
      return group
    })

    // 分配单词到分组或未分组
    const ungrouped = []
    if (wordsRes && wordsRes.code === 200 && wordsRes.data) {
      const records = wordsRes.data.records || []
      records.forEach(raw => {
        const word = normalizeWord(raw)
        if (!word) return

        const groupId = raw.groupId ? String(raw.groupId) : null
        if (groupId && groupMap[groupId]) {
          groupMap[groupId].words.push(word)
        } else {
          ungrouped.push(word)
        }
      })
    }

    return ok({ groups, ungrouped })
  } catch (e) {
    console.error('获取分组失败，降级到本地临时数据:', e)
    if (!_seeded[wordListId]) seed(wordListId)
    return ok(clone(_store[wordListId]))
  }
}

/** 取本地态（供 mock 下的增删改复用） */
async function state(wordListId) {
  if (!_seeded[wordListId]) seed(wordListId)
  return _store[wordListId]
}

/* ============ 写 ============ */

/** 新建分组，返回 { code, data: { id } } */
async function createGroup(wordListId, name, color) {
  if (USE_MOCK) {
    const s = await state(wordListId)
    const group = { id: nextId('g'), name, color, words: [] }
    s.groups.unshift(group)
    return ok({ id: group.id })
  }
  try {
    const res = await wordlistGroupApi.create(wordListId, name, color)
    return res
  } catch (e) {
    return fail('新建分组失败')
  }
}

/** 重命名 / 改色 */
async function updateGroup(wordListId, groupId, name, color) {
  if (USE_MOCK) {
    Object.keys(_store).forEach(k => {
      const g = _store[k].groups.find(x => x.id === groupId)
      if (g) {
        g.name = name
        g.color = color
      }
    })
    return ok(true)
  }
  try {
    return await wordlistGroupApi.update(wordListId, groupId, name, color)
  } catch (e) {
    return fail('保存失败')
  }
}

/** 删除分组（后端会自动处理组内单词，keepWords 参数暂不使用） */
async function removeGroup(wordListId, groupId, keepWords) {
  if (USE_MOCK) {
    Object.keys(_store).forEach(k => {
      const s = _store[k]
      const g = s.groups.find(x => x.id === groupId)
      if (!g) return
      if (keepWords !== false) {
        s.ungrouped = s.ungrouped.concat(g.words)
      }
      s.groups = s.groups.filter(x => x.id !== groupId)
    })
    return ok(true)
  }
  try {
    return await wordlistGroupApi.remove(wordListId, groupId)
  } catch (e) {
    return fail('删除失败')
  }
}

/**
 * 把单词移动到目标分组（targetGroupId 为空 = 移入未分组）
 * 入参 wordIds 为字符串数组，来源是"直接选中的单词 + 选中分组内的全部单词"
 */
async function moveWords(wordListId, wordIds, targetGroupId) {
  if (!wordIds || !wordIds.length) return ok(true)
  if (USE_MOCK) {
    const s = await state(wordListId)
    const idSet = {}
    wordIds.forEach(id => { idSet[String(id)] = true })
    const picked = []
    s.groups.forEach(g => {
      g.words = g.words.filter(w => {
        if (idSet[w.wordId]) {
          picked.push(w)
          return false
        }
        return true
      })
    })
    s.ungrouped = s.ungrouped.filter(w => {
      if (idSet[w.wordId]) {
        picked.push(w)
        return false
      }
      return true
    })
    if (targetGroupId) {
      const g = s.groups.find(x => x.id === targetGroupId)
      if (g) g.words = g.words.concat(picked)
      else s.ungrouped = s.ungrouped.concat(picked)
    } else {
      s.ungrouped = s.ungrouped.concat(picked)
    }
    return ok(true)
  }
  try {
    return await wordlistGroupApi.moveWords(wordListId, wordIds, targetGroupId || null)
  } catch (e) {
    return fail('移动失败')
  }
}

/** 往分组添加单词（复用 moveWords） */
async function addWords(wordListId, groupId, wordIds) {
  return moveWords(wordListId, wordIds, groupId)
}

/** 把单词移出分组（回到未分组，复用 moveWords） */
async function removeWords(wordListId, groupId, wordIds) {
  return moveWords(wordListId, wordIds, '')
}

/** 把单词移出词单（后端暂无此接口，使用 unfavorite 替代） */
async function deleteWords(wordListId, wordIds) {
  if (!wordIds || !wordIds.length) return ok(true)
  if (USE_MOCK) {
    const s = await state(wordListId)
    const idSet = {}
    wordIds.forEach(id => { idSet[String(id)] = true })
    s.groups.forEach(g => { g.words = g.words.filter(w => !idSet[w.wordId]) })
    s.ungrouped = s.ungrouped.filter(w => !idSet[w.wordId])
    return ok(true)
  }
  try {
    // 后端没有批量删除接口，需要逐个调用 unfavorite
    for (let i = 0; i < wordIds.length; i++) {
      await wordlistApi.unfavorite(wordIds[i], wordListId)
    }
    return ok(true)
  } catch (e) {
    return fail('删除失败')
  }
}

/** 整体回写（撤销时一次性恢复分组结构，后端暂无此接口，mock only） */
async function sync(wordListId, groups, ungrouped) {
  if (USE_MOCK) {
    _store[wordListId] = clone({ groups: groups || [], ungrouped: ungrouped || [] })
    _seeded[wordListId] = true
    return ok(true)
  }
  // 后端无整体同步接口，撤销功能暂时不可用
  return fail('后端暂不支持整体同步，撤销功能不可用')
}

module.exports = {
  USE_MOCK,
  GROUP_COLORS,
  normalizeWord,
  fetchGroups,
  createGroup,
  updateGroup,
  removeGroup,
  moveWords,
  addWords,
  removeWords,
  deleteWords,
  sync
}
