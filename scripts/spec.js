/**
 * spec.js — 规范库体检工具（零依赖，Node 内置模块）
 *
 * 注意：本文件不要加 shebang（#!/usr/bin/env node）。
 * 微信开发者工具会把项目目录下的 .js 当成小程序源码解析，shebang 会直接报
 * "非法的文件 invalid file"，导致预览/上传构建失败。统一用 `node scripts/spec.js ...` 调用。
 *
 * 用法：
 *   node scripts/spec.js new <slug> [--level L1|L2|L3] [--title "标题"]
 *   node scripts/spec.js list
 *   node scripts/spec.js check [slug] [--strict]
 *   node scripts/spec.js archive <slug> [--force]
 *   node scripts/spec.js status
 *
 * 设计原则：只做机械检查，不判断需求好坏。
 * 没有 Node 也不影响流程——本文件是可选增强。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SPECS = path.join(ROOT, 'specs')
const CHANGES = path.join(SPECS, 'changes')
const TEMPLATE = path.join(CHANGES, '_template')
const ARCHIVE = path.join(CHANGES, 'archive')
const CAPS = path.join(SPECS, 'capabilities')

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s)
const red = (s) => paint(31, s)
const green = (s) => paint(32, s)
const yellow = (s) => paint(33, s)
const cyan = (s) => paint(36, s)
const dim = (s) => paint(2, s)
const bold = (s) => paint(1, s)

const ISSUES = { error: 0, warn: 0 }

function log(msg) {
  console.log(msg)
}
function ok(msg) {
  log(`  ${green('OK')}   ${msg}`)
}
function warn(msg) {
  ISSUES.warn++
  log(`  ${yellow('WARN')} ${msg}`)
}
function err(msg) {
  ISSUES.error++
  log(`  ${red('ERR')}  ${msg}`)
}
function info(msg) {
  log(`  ${dim('INFO')} ${msg}`)
}

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    return ''
  }
}

function exists(p) {
  return fs.existsSync(p)
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch (e) {
    return false
  }
}

/** 列出 changes 下的一级目录（排除模板与归档） */
function listChanges() {
  if (!isDir(CHANGES)) return []
  return fs
    .readdirSync(CHANGES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_template' && d.name !== 'archive')
    .map((d) => d.name)
    .sort()
}

/** 解析 proposal 表格里的级别，缺省 L2 */
function parseLevel(proposalText) {
  const m = proposalText.match(/级别[^\n|]*\|\s*\**\s*(L[123])/i)
  if (m) return m[1].toUpperCase()
  const m2 = proposalText.match(/\b(L[123])\b/)
  return m2 ? m2[1].toUpperCase() : 'L2'
}

/** 取标题：第一个 # 行，去掉前缀 */
function parseTitle(proposalText, fallback) {
  const line = proposalText.split(/\r?\n/).find((l) => /^#\s+/.test(l))
  if (!line) return fallback
  const t = line.replace(/^#\s+/, '').replace(/^[^：:]*[：:]\s*/, '').trim()
  return t || fallback
}

const STATUS_FLOW = ['draft', 'approved', 'verified', 'archived']

/** 解析状态，缺省按 draft（保守：没写状态就视为未审批） */
function parseStatus(proposalText) {
  const m = proposalText.match(/\|\s*状态\s*\|\s*`?([a-zA-Z-]+)`?\s*\|/)
  const s = m ? m[1].toLowerCase() : 'draft'
  return STATUS_FLOW.includes(s) ? s : 'draft'
}

/** 写入状态（只改元信息表那一行，不动其它内容） */
function setStatus(slug, status, baseDir) {
  const p = path.join(baseDir || CHANGES, slug, 'proposal.md')
  let text = read(p)
  if (!text) return false
  const line = `| 状态 | ${status} |`
  if (/\|\s*状态\s*\|[^|\n]*\|/.test(text)) {
    text = text.replace(/\|\s*状态\s*\|[^|\n]*\|/, line)
  } else {
    text = text.replace(/(\|\s*级别\s*\|[^|\n]*\|)/, `$1\n${line}`)
  }
  fs.writeFileSync(p, text, 'utf8')
  return true
}

/** 在「## 9. 审批记录」表格末尾追加一行（时间正序，便于审计） */
function appendApproval(slug, by, note, conclusion) {
  const p = path.join(CHANGES, slug, 'proposal.md')
  let text = read(p)
  const result = conclusion || '通过'
  const row = `| ${today()} | ${by} | proposal + spec | ${result} | ${note || '—'} |`

  // 清掉空占位行 / 未审核占位行
  text = text.replace(/^\|\s*[—]?\s*\|\s*[—]?\s*\|\s*proposal \+ spec\s*\|[^\n]*\|[ \t]*\n/gm, '')

  const start = text.indexOf('## 9. 审批记录')
  if (start >= 0) {
    const rest = text.slice(start)
    const endIdx = rest.search(/\n---\s*\n|\n##\s/)
    const head = (endIdx >= 0 ? rest.slice(0, endIdx) : rest).replace(/\s*$/, '')
    const tail = endIdx >= 0 ? rest.slice(endIdx) : ''
    text = text.slice(0, start) + head + '\n' + row + '\n' + tail
  } else {
    text += `\n## 9. 审批记录\n\n| 日期 | 审批人 | 审核内容 | 结论 | 备注 |\n|---|---|---|---|---|\n${row}\n`
  }
  // 表格与后面的 --- 之间补一个空行，避免 Markdown 把 --- 解析成表格分隔
  text = text.replace(/(\|[^\n]*\|\n)(---)/, '$1\n$2')
  fs.writeFileSync(p, text, 'utf8')
}

function statusBadge(status) {
  const padded = status.padEnd(9)
  if (status === 'draft') return yellow(padded)
  if (status === 'approved') return green(padded)
  if (status === 'verified') return cyan(padded)
  return dim(padded)
}

/**
 * 统计未关闭的待确认问题。
 * 约定写法：- [ ] **待确认** 问题（回答后改成 - [x] 并补结论）
 * 用复选框而不是裸文本，是为了让"有没有解决"可被机器判断。
 */
function openQuestions(text) {
  return (text.match(/^\s*-\s*\[ \]\s*\*\*待确认\*\*/gm) || []).length
}

/** 取某个二级标题下的内容（找不到返回空串） */
function section(text, name) {
  const lines = text.split(/\r?\n/)
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^##\\s*${name}\\s*$`).test(lines[i])) {
      start = i + 1
      continue
    }
    if (start >= 0 && /^##\s/.test(lines[i])) {
      end = i
      break
    }
  }
  return start >= 0 ? lines.slice(start, end).join('\n') : ''
}

/**
 * 统计 Markdown 复选框任务。
 * 只统计「## 任务」一节，避免把「归档前检查」的勾选项也算成任务。
 */
function countTasks(tasksText) {
  const body = section(tasksText, '任务') || tasksText
  let done = 0
  let todo = 0
  body.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*-\s*\[([ xX])\]/)
    if (!m) return
    if (m[1].toLowerCase() === 'x') done++
    else todo++
  })
  return { done, todo, total: done + todo }
}

/** 提取 AC 编号（只认 AC-两位数，不认能力规范里的 AC-XX-01） */
function extractACs(text) {
  const set = new Set()
  const re = /\bAC-\d{2}\b/g
  let m
  while ((m = re.exec(text))) set.add(m[0])
  return set
}

/** 解析 capability 的 front matter（只支持简单的 key: value 与数组） */
function parseFrontMatter(text) {
  const meta = {}
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return meta
  const lines = m[1].split(/\r?\n/)
  let currentKey = null
  lines.forEach((line) => {
    const arr = line.match(/^\s+-\s+(.+)$/)
    if (arr && currentKey) {
      meta[currentKey] = meta[currentKey] || []
      meta[currentKey].push(arr[1].trim())
      return
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) {
      currentKey = kv[1]
      meta[currentKey] = kv[2].trim()
    }
  })
  return meta
}

function daysSince(dateStr) {
  if (!dateStr) return null
  const t = Date.parse(dateStr)
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

// ---------------------------------------------------------------------------
// 需求台账（编号 = 主键，永不复用）
// ---------------------------------------------------------------------------
function registryPath() {
  return path.join(CHANGES, 'INDEX.md')
}

function readRegistry() {
  const rows = []
  read(registryPath())
    .split(/\r?\n/)
    .forEach((line) => {
      const m = line.match(/^\|\s*(\d{3})\s*\|\s*`?([^|`]+)`?\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/)
      if (!m) return
      rows.push({
        number: m[1],
        dir: m[2].trim(),
        title: m[3].trim(),
        level: m[4].trim(),
        status: m[5].trim()
      })
    })
  return rows
}

/** 取下一个编号：台账 + 进行中 + 已归档，三者取最大 */
function nextNumber() {
  const nums = readRegistry().map((r) => parseInt(r.number, 10))
  listChanges().forEach((d) => {
    const m = d.match(/^(\d{3})-/)
    if (m) nums.push(parseInt(m[1], 10))
  })
  if (isDir(ARCHIVE)) {
    fs.readdirSync(ARCHIVE, { withFileTypes: true }).forEach((d) => {
      const m = d.isDirectory() && d.name.match(/^(\d{3})-/)
      if (m) nums.push(parseInt(m[1], 10))
    })
  }
  const max = nums.filter((n) => !Number.isNaN(n)).reduce((a, b) => Math.max(a, b), 0)
  return String(max + 1).padStart(3, '0')
}

function register(number, dir, title, level) {
  const p = registryPath()
  if (!exists(p)) {
    fs.writeFileSync(
      p,
      '# 需求台账\n\n| 编号 | 目录 | 标题 | 级别 | 状态 | 建立 | 归档 |\n|------|------|------|------|------|------|------|\n',
      'utf8'
    )
  }
  fs.appendFileSync(p, `| ${number} | \`${dir}\` | ${title} | ${level} | draft | ${today()} | — |\n`, 'utf8')
}

/** 更新台账中的状态与归档日期 */
function updateRegistry(dir, patch) {
  const p = registryPath()
  if (!exists(p)) return
  const lines = read(p).split(/\r?\n/)
  const out = lines.map((line) => {
    const cells = line.split('|')
    if (cells.length < 8) return line
    if (cells[2].replace(/`/g, '').trim() !== dir) return line
    if (patch.status) cells[5] = ` ${patch.status} `
    if (patch.archived) cells[7] = ` ${patch.archived} `
    return cells.join('|')
  })
  fs.writeFileSync(p, out.join('\n'), 'utf8')
}

// ---------------------------------------------------------------------------
// new
// ---------------------------------------------------------------------------
function cmdNew(args) {
  const raw = args[0]
  const levelIdx = args.indexOf('--level')
  const level = (levelIdx >= 0 ? args[levelIdx + 1] : 'L2').toUpperCase()
  const titleIdx = args.indexOf('--title')

  if (!raw) {
    log(red('缺少名称。用法：node scripts/spec.js new my-change --level L2'))
    process.exit(1)
  }

  const numbered = raw.match(/^(\d{3})-(.+)$/)
  let number
  let name
  if (numbered) {
    number = numbered[1]
    name = numbered[2]
  } else {
    name = raw
    number = nextNumber()
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    log(red(`名称不合法：${name}（只允许小写字母、数字、连字符）`))
    process.exit(1)
  }
  if (!/^L[123]$/.test(level)) {
    log(red(`级别不合法：${level}（只允许 L1 / L2 / L3）`))
    process.exit(1)
  }

  const dirName = `${number}-${name}`
  const title = titleIdx >= 0 ? args[titleIdx + 1] : name
  const dest = path.join(CHANGES, dirName)
  if (exists(dest)) {
    log(red(`已存在：specs/changes/${dirName}`))
    process.exit(1)
  }

  const filesByLevel = {
    L1: ['proposal.md', 'tasks.md'],
    L2: ['proposal.md', 'spec.md', 'design.md', 'tasks.md'],
    L3: ['proposal.md', 'spec.md', 'design.md', 'tasks.md', 'verify.md']
  }
  const want = filesByLevel[level]

  fs.mkdirSync(dest, { recursive: true })

  want.forEach((file) => {
    const src = path.join(TEMPLATE, file)
    if (!exists(src)) {
      warn(`模板缺失：_template/${file}`)
      return
    }
    let text = read(src)
    text = text
      .replace(/<一句话标题>/g, title)
      .replace(/<标题>/g, title)
      .replace(/<编号>/g, `#${number}`)
      .replace(/<目录名>/g, dirName)
      .replace(/<slug>/g, dirName)
      .replace(/`<kebab-case，如 ai-search-toggle>`/g, `\`${name}\``)
      .replace(/\| 日期 \| \|/, `| 日期 | ${today()} |`)
      .replace(/\| 级别 \| L1 \/ L2 \/ L3 \|/, `| 级别 | ${level} |`)
    fs.writeFileSync(path.join(dest, file), text, 'utf8')
  })

  register(number, dirName, title, level)

  log(green(`\n已创建 #${number}  specs/changes/${dirName}（${level}）`))
  want.forEach((f) => log(`  + ${f}`))
  log(dim(`  已登记到 specs/changes/INDEX.md`))
  log('')
  log('下一步：')
  if (level === 'L1') {
    log(`  1. 填 proposal.md（半页即可）`)
    log(`  2. 直接实现，把任务写成 "- [x]" 形式`)
  } else {
    log(`  1. 填 proposal.md，先回答「待确认」`)
    log(`  2. 填 spec.md（EARS + AC 编号）`)
    log(`  3. 停下来，给用户三行摘要，等一句「批准」`)
    log(`  4. 批准后再填 design.md、拆 tasks.md`)
  }
  log(`  完成后：node scripts/spec.js check ${dirName}`)
  log('')
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
function cmdList() {
  const changes = listChanges()
  log(bold('\n进行中的变更\n'))
  if (!changes.length) {
    log(dim('  （空）新建：node scripts/spec.js new my-change --level L2\n'))
    return
  }
  changes.forEach((slug) => {
    const dir = path.join(CHANGES, slug)
    const proposal = read(path.join(dir, 'proposal.md'))
    const level = parseLevel(proposal)
    const title = parseTitle(proposal, slug)
    const status = parseStatus(proposal)
    const num = (slug.match(/^(\d{3})-/) || [])[1] || '???'
    const shortName = slug.replace(/^\d{3}-/, '')
    const tasks = countTasks(read(path.join(dir, 'tasks.md')))
    const stat = fs.statSync(dir)
    const age = Math.floor((Date.now() - stat.mtimeMs) / 86400000)
    const pct = tasks.total ? Math.round((tasks.done / tasks.total) * 100) : 0
    const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '·')
    const ageText = age > 14 ? yellow(`${age} 天未动`) : dim(`${age} 天前`)
    log(`  ${cyan(`#${num}`.padEnd(6))} ${shortName.padEnd(24)} ${level}  ${statusBadge(status)} ${bar} ${String(pct).padStart(3)}%  ${ageText}`)
    log(`  ${dim(' '.repeat(30) + title)}`)
    if (tasks.total) log(`  ${dim(' '.repeat(30) + `${tasks.done}/${tasks.total} 任务`)}`)
    log('')
  })
  log(dim(`共 ${changes.length} 个进行中；归档：node scripts/spec.js archive <slug>\n`))
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------
function checkStructure() {
  log(bold('\n[1/4] 目录结构'))
  const required = [
    'AGENTS.md',
    'specs/README.md',
    'specs/constitution.md',
    'specs/capabilities',
    'specs/changes/_template'
  ]
  required.forEach((rel) => {
    const p = path.join(ROOT, rel)
    if (exists(p)) ok(rel)
    else err(`缺少 ${rel}`)
  })
}

function checkChange(slug) {
  const dir = path.join(CHANGES, slug)
  log(bold(`\n变更：${slug}`))
  if (!isDir(dir)) {
    err(`不存在 specs/changes/${slug}`)
    return
  }

  if (!/^\d{3}-[a-z0-9-]+$/.test(slug)) {
    err(`目录名缺少编号：${slug}（应为 NNN-slug，如 001-fix-xxx）`)
  }

  const proposal = read(path.join(dir, 'proposal.md'))
  const level = parseLevel(proposal)
  const title = parseTitle(proposal, slug)
  const rawStatus = (proposal.match(/\|\s*状态\s*\|\s*`?([^|`]+)`?\s*\|/) || [])[1]
  if (rawStatus && !STATUS_FLOW.includes(rawStatus.trim().toLowerCase())) {
    err(`状态值非法："${rawStatus.trim()}"（可用：${STATUS_FLOW.join(' / ')}）`)
  }
  info(`${level} · ${parseStatus(proposal)} · ${title}`)

  const requiredByLevel = {
    L1: ['proposal.md'],
    L2: ['proposal.md', 'spec.md', 'design.md', 'tasks.md'],
    L3: ['proposal.md', 'spec.md', 'design.md', 'tasks.md', 'verify.md']
  }
  requiredByLevel[level].forEach((f) => {
    if (exists(path.join(dir, f))) ok(f)
    else err(`缺少 ${f}（${level} 要求）`)
  })

  const spec = read(path.join(dir, 'spec.md'))
  const tasks = read(path.join(dir, 'tasks.md'))
  // AC 覆盖只看「## 任务」一节，避免验收记录表里的 AC 造成"已覆盖"的假象
  const taskBody = section(tasks, '任务') || tasks

  // AC 覆盖
  const acs = extractACs(spec)
  const taskACs = extractACs(taskBody)
  if (acs.size) {
    const missing = [...acs].filter((a) => !taskACs.has(a))
    if (missing.length) err(`AC 未被任何任务覆盖：${missing.join(', ')}`)
    else ok(`${acs.size} 条 AC 均被任务覆盖`)
  } else if (level !== 'L1') {
    err('spec.md 里没有任何 AC-XX 编号')
  }

  // 任务引用了不存在的 AC
  const ghost = [...taskACs].filter((a) => acs.size && !acs.has(a))
  if (ghost.length) warn(`tasks.md 引用了 spec 中不存在的 AC：${ghost.join(', ')}`)

  // 任务完成度
  const t = countTasks(tasks)
  if (t.total === 0) {
    warn('tasks.md 里没有复选框任务（格式：- [ ] **T01** ...）')
  } else if (t.todo > 0) {
    warn(`还有 ${t.todo}/${t.total} 个任务未完成`)
  } else {
    ok(`${t.total} 个任务全部完成`)
  }

  // 待确认
  const open = openQuestions(proposal) + openQuestions(spec)
  if (open) warn(`还有 ${open} 个「待确认」未关闭（approve 会拒绝）`)

  // 闸门：状态与动作是否匹配
  const status = parseStatus(proposal)
  if (status === 'draft' && t.done > 0) {
    err(`状态是 draft，但已有 ${t.done} 个任务勾选 —— 未审批就开工`)
  }
  if (status === 'draft' && exists(path.join(dir, 'verify.md'))) {
    warn('状态是 draft 却已写 verify.md（通常是先做完才补文档）')
  }
  if (status === 'approved' && t.total && t.todo === 0) {
    info('任务已全部完成，执行 verify 进入待归档')
  }
  if (status === 'verified' && t.todo > 0) {
    err('状态是 verified，但仍有未完成任务')
  }

  // 界面契约：涉及界面的 AC 必须有形态描述，否则实现必然自由发挥
  const acLines = spec.split(/\r?\n/).filter((l) => /^- \*\*AC-\d+\*\*/.test(l))
  const uiAcs = acLines.filter((l) => /提示|展示|显示|按钮|弹窗|入口|文案|页面|界面/.test(l))
  const hasContract = /##\s*界面契约/.test(spec)
  if (uiAcs.length > 0 && !hasContract) {
    warn(`${uiAcs.length} 条 AC 涉及界面，但缺少「界面契约」表（位置/形态/文案/动作/消失条件）`)
  }

  // 台账一致性
  const row = readRegistry().find((r) => r.dir === slug)
  if (!row) {
    warn('台账未登记：在 specs/changes/INDEX.md 补一行（编号｜目录｜标题｜级别｜状态）')
  } else if (row.status !== status) {
    warn(`台账状态（${row.status}）与 proposal（${status}）不一致`)
  }

  // 陈旧
  const age = Math.floor((Date.now() - fs.statSync(dir).mtimeMs) / 86400000)
  if (age > 14) warn(`${age} 天未更新，考虑推进或关闭`)
}

function checkCapabilities() {
  log(bold('\n[2/4] 能力规范'))
  if (!isDir(CAPS)) {
    err('缺少 specs/capabilities')
    return
  }
  const caps = fs
    .readdirSync(CAPS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  if (!caps.length) {
    warn('还没有能力规范')
    return
  }

  caps.forEach((name) => {
    const p = path.join(CAPS, name, 'spec.md')
    if (!exists(p)) {
      err(`${name}: 缺少 spec.md`)
      return
    }
    const text = read(p)
    const meta = parseFrontMatter(text)
    const paths = Array.isArray(meta.owned_paths) ? meta.owned_paths : []

    if (!paths.length) {
      warn(`${name}: 未声明 owned_paths，无法做漂移检测`)
    } else {
      const missing = paths.filter((rel) => !exists(path.join(ROOT, rel)))
      if (missing.length) {
        err(`${name}: owned_paths 不存在 -> ${missing.join(', ')}（代码挪了？规范该更新了）`)
      } else {
        ok(`${name}: ${paths.length} 个路径存在`)
      }
    }

    const acCount = (text.match(/\bAC-[A-Z]+-\d{2}\b/g) || []).length
    if (!acCount) err(`${name}: 没有任何 AC-XX-NN 验收标准`)

    const age = daysSince(meta.last_reviewed)
    if (age === null) warn(`${name}: last_reviewed 缺失或格式不对（YYYY-MM-DD）`)
    else if (age > 90) warn(`${name}: 已 ${age} 天未复核`)
  })
}

function checkSecrets() {
  log(bold('\n[3/4] 敏感信息'))
  const scanDirs = ['utils', 'pages']
  const patterns = [
    /(appsecret|app_secret|secretkey|access[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /\bsk-[A-Za-z0-9]{16,}/,
    /(password|passwd)\s*[:=]\s*['"][^'"]{6,}['"]/i
  ]
  let hits = 0
  const walk = (dir) => {
    if (!isDir(dir)) return
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) return walk(p)
      if (!/\.(js|json|wxml|wxss)$/.test(d.name)) return
      const text = read(p)
      patterns.forEach((re) => {
        if (re.test(text)) {
          hits++
          warn(`疑似硬编码密钥：${path.relative(ROOT, p)}`)
        }
      })
    })
  }
  scanDirs.forEach((d) => walk(path.join(ROOT, d)))

  const gi = read(path.join(ROOT, '.gitignore'))
  if (/config\.local\.js/.test(gi)) ok('.gitignore 已忽略 config.local.js')
  else warn('.gitignore 未忽略 utils/config.local.js')

  if (!hits) ok('未发现明显硬编码密钥')
}

function checkAppJson() {
  log(bold('\n[4/4] 路由一致性'))
  const appJsonPath = path.join(ROOT, 'app.json')
  if (!exists(appJsonPath)) {
    warn('缺少 app.json，跳过')
    return
  }
  let app
  try {
    app = JSON.parse(read(appJsonPath))
  } catch (e) {
    err('app.json 不是合法 JSON')
    return
  }
  const pages = Array.isArray(app.pages) ? app.pages : []
  const missing = []
  pages.forEach((p) => {
    ;['js', 'wxml'].forEach((ext) => {
      const f = path.join(ROOT, `${p}.${ext}`)
      if (!exists(f)) missing.push(`${p}.${ext}`)
    })
  })
  if (missing.length) {
    missing.slice(0, 10).forEach((m) => err(`app.json 注册了但文件不存在：${m}`))
    if (missing.length > 10) err(`...另有 ${missing.length - 10} 个`)
  } else {
    ok(`${pages.length} 个页面文件齐全`)
  }

  // 反向：pages/ 下有页面但未注册（只查一层，避免误报 components）
  const pagesDir = path.join(ROOT, 'pages')
  if (isDir(pagesDir)) {
    const unregistered = fs
      .readdirSync(pagesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `pages/${d.name}/${d.name}`)
      .filter((p) => exists(path.join(ROOT, `${p}.js`)) && !pages.includes(p))
    if (unregistered.length) {
      unregistered.forEach((p) => warn(`页面未在 app.json 注册：${p}`))
    }
  }
}

function cmdCheck(args) {
  const slug = args.find((a) => !a.startsWith('--'))
  const strict = args.includes('--strict')

  log(bold('\n规范库体检'))
  log(dim(`  ${today()} · ${ROOT}\n`))

  checkStructure()

  log(bold('\n[变更] 进行中的变更'))
  const targets = slug ? [slug] : listChanges()
  if (!targets.length) info('没有进行中的变更')
  targets.forEach(checkChange)

  checkCapabilities()
  checkSecrets()
  checkAppJson()

  log(bold('\n结果'))
  if (ISSUES.error) {
    log(`  ${red(`${ISSUES.error} 个错误`)}, ${yellow(`${ISSUES.warn} 个警告`)}`)
    if (strict) process.exit(1)
  } else if (ISSUES.warn) {
    log(`  ${green('无错误')}, ${yellow(`${ISSUES.warn} 个警告`)}`)
  } else {
    log(`  ${green('全部通过')}`)
  }
  log('')
}

// ---------------------------------------------------------------------------
// approve / verify（人工闸门）
// ---------------------------------------------------------------------------
/** 收集"能否放行"的硬性问题 */
function collectGateProblems(dir, level, stage) {
  const problems = []
  const proposal = read(path.join(dir, 'proposal.md'))
  const spec = read(path.join(dir, 'spec.md'))
  const tasks = read(path.join(dir, 'tasks.md'))
  const acs = extractACs(spec)
  const taskACs = extractACs(section(tasks, '任务') || tasks)
  const missing = [...acs].filter((a) => !taskACs.has(a))

  const openP = openQuestions(proposal)
  const openS = openQuestions(spec)
  if (openP) problems.push(`proposal.md 里还有 ${openP} 个「待确认」未关闭`)
  if (openS) problems.push(`spec.md 里还有 ${openS} 个「待确认」未关闭`)

  if (level !== 'L1') {
    if (!exists(path.join(dir, 'spec.md'))) problems.push('缺少 spec.md')
    else if (!acs.size) problems.push('spec.md 里没有任何 AC-XX 编号')
  }

  // 批准发生在拆任务之前：此时只审"做什么"，不要求任务已拆好
  if (stage === 'verify') {
    if (level !== 'L1') {
      if (!exists(path.join(dir, 'design.md'))) problems.push('缺少 design.md')
      if (!exists(path.join(dir, 'tasks.md'))) problems.push('缺少 tasks.md')
    }
    if (missing.length) problems.push(`AC 未被任务覆盖：${missing.join(', ')}`)
  }

  return { problems, acs, tasks: countTasks(tasks) }
}

function cmdApprove(args) {
  const slug = args.find((a) => !a.startsWith('--'))
  const byIdx = args.indexOf('--by')
  const by = byIdx >= 0 ? args[byIdx + 1] : ''
  const noteIdx = args.indexOf('--note')
  const note = noteIdx >= 0 ? args[noteIdx + 1] : ''
  const force = args.includes('--force')

  if (!slug) {
    log(red('用法：node scripts/spec.js approve <slug> --by <你的名字> [--note "备注"]'))
    process.exit(1)
  }
  const dir = path.join(CHANGES, slug)
  if (!isDir(dir)) {
    log(red(`不存在：specs/changes/${slug}`))
    process.exit(1)
  }

  const proposal = read(path.join(dir, 'proposal.md'))
  const status = parseStatus(proposal)
  if (status !== 'draft' && !force) {
    log(red(`当前状态是 ${status}，只有 draft 才能审批`))
    process.exit(1)
  }
  if (!by && !force) {
    log(red('必须用 --by 记录审批人，批准才算留痕。例：--by 张三'))
    process.exit(1)
  }

  const level = parseLevel(proposal)
  const { problems, acs } = collectGateProblems(dir, level, 'approve')
  if (problems.length && !force) {
    log(red('\n不能批准，先把这些处理掉：'))
    problems.forEach((p) => log(`  - ${p}`))
    log(dim('\n（确认无误可加 --force，但不建议——闸门的意义就在于不被绕过）\n'))
    process.exit(1)
  }

  setStatus(slug, 'approved')
  appendApproval(slug, by || '未署名', note || `批准 ${acs.size} 条 AC`, '通过')
  log(green(`\n已批准：${slug}（${level}，${acs.size} 条 AC）`))
  log(`  审批人：${by || '未署名'} · ${today()}`)
  log('')
  log('现在可以让 AI 开始实现了。一次给它一个任务，并在指令里带上：')
  log(`  - specs/changes/${slug}/spec.md 的对应 AC`)
  log(`  - design.md 的「影响面」与「数据流」`)
  log('  - 明确的"不要做什么"（proposal 的非目标）')
  log('')
}

function cmdVerify(args) {
  const slug = args.find((a) => !a.startsWith('--'))
  const force = args.includes('--force')
  if (!slug) {
    log(red('用法：node scripts/spec.js verify <slug>'))
    process.exit(1)
  }
  const dir = path.join(CHANGES, slug)
  if (!isDir(dir)) {
    log(red(`不存在：specs/changes/${slug}`))
    process.exit(1)
  }

  const proposal = read(path.join(dir, 'proposal.md'))
  const status = parseStatus(proposal)
  if (status !== 'approved' && !force) {
    log(red(`当前状态是 ${status}，只有 approved 才能做验收`))
    process.exit(1)
  }

  const level = parseLevel(proposal)
  const { problems, tasks } = collectGateProblems(dir, level, 'verify')
  if (tasks.todo > 0) problems.unshift(`还有 ${tasks.todo}/${tasks.total} 个任务未完成`)
  if (!tasks.total) problems.push('tasks.md 里没有任务')

  if (problems.length && !force) {
    log(red('\n不能进入待归档：'))
    problems.forEach((p) => log(`  - ${p}`))
    log(dim('\n全部做完、逐条 AC 验证通过后再跑一次。\n'))
    process.exit(1)
  }

  setStatus(slug, 'verified')
  log(green(`\n验收通过：${slug}（${tasks.done}/${tasks.total} 任务）`))
  log('')
  log('接下来：')
  log('  1. 把 spec.md 的增量合并进 specs/capabilities/<能力>/spec.md')
  log(`  2. node scripts/spec.js archive ${slug}`)
  log('')
}

// ---------------------------------------------------------------------------
// reject：打回，状态回到 draft
// ---------------------------------------------------------------------------
function cmdReject(args) {
  const slug = args.find((a) => !a.startsWith('--'))
  const byIdx = args.indexOf('--by')
  const by = byIdx >= 0 ? args[byIdx + 1] : ''
  const reasonIdx = args.indexOf('--reason')
  const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : ''
  const force = args.includes('--force')

  if (!slug) {
    log(red('用法：node scripts/spec.js reject <slug> --by <名字> --reason "原因"'))
    process.exit(1)
  }
  const dir = path.join(CHANGES, slug)
  if (!isDir(dir)) {
    log(red(`不存在：specs/changes/${slug}`))
    process.exit(1)
  }

  const proposal = read(path.join(dir, 'proposal.md'))
  const status = parseStatus(proposal)
  if (status === 'draft' && !force) {
    log(red('当前已经是 draft，没有可打回的状态'))
    process.exit(1)
  }
  if (!by && !force) {
    log(red('必须用 --by 记录打回人。例：--by 张三 --reason "非目标不清晰"'))
    process.exit(1)
  }

  setStatus(slug, 'draft')
  appendApproval(slug, by || '未署名', reason || '未说明原因', '打回')

  const t = countTasks(read(path.join(dir, 'tasks.md')))
  log(yellow(`\n已打回：${slug}（状态回到 draft）`))
  log(`  打回人：${by || '未署名'} · ${today()}`)
  if (reason) log(`  原因：${reason}`)
  if (t.done > 0) {
    log('')
    log(yellow(`注意：已有 ${t.done}/${t.total} 个任务被勾选。打回意味着这些代码要一起回退，或重新评估后再继续。`))
  }
  log('')
  log('下一步：改 proposal / spec，重新 approve。')
  log('')
}

// ---------------------------------------------------------------------------
// archive
// ---------------------------------------------------------------------------
function cmdArchive(args) {
  const slug = args.find((a) => !a.startsWith('--'))
  const force = args.includes('--force')
  if (!slug) {
    log(red('用法：node scripts/spec.js archive <slug> [--force]'))
    process.exit(1)
  }

  const dir = path.join(CHANGES, slug)
  if (!isDir(dir)) {
    log(red(`不存在：specs/changes/${slug}`))
    process.exit(1)
  }

  const proposal = read(path.join(dir, 'proposal.md'))
  const spec = read(path.join(dir, 'spec.md'))
  const tasks = read(path.join(dir, 'tasks.md'))
  const t = countTasks(tasks)
  const acs = extractACs(spec)
  const taskACs = extractACs(section(tasks, '任务') || tasks)
  const missing = [...acs].filter((a) => !taskACs.has(a))

  const problems = []
  const status = parseStatus(proposal)
  if (status !== 'verified') {
    problems.push(`状态是 ${status}，不是 verified（先运行 verify ${slug}）`)
  }
  if (t.todo > 0) problems.push(`还有 ${t.todo}/${t.total} 个任务未完成`)
  if (missing.length) problems.push(`AC 未被覆盖：${missing.join(', ')}`)
  const open = openQuestions(proposal) + openQuestions(spec)
  if (open) problems.push(`还有 ${open} 个「待确认」未关闭`)

  if (problems.length && !force) {
    log(red('\n不能归档：'))
    problems.forEach((p) => log(`  - ${p}`))
    log(dim('\n确认无误可加 --force（不推荐）。或者先把它们做完。\n'))
    process.exit(1)
  }

  fs.mkdirSync(ARCHIVE, { recursive: true })
  const dest = path.join(ARCHIVE, slug)
  if (exists(dest)) {
    log(red(`归档目标已存在：archive/${slug}`))
    process.exit(1)
  }
  fs.renameSync(dir, dest)
  setStatus(slug, 'archived', ARCHIVE)
  updateRegistry(slug, { status: 'archived', archived: today() })

  const num = (slug.match(/^(\d{3})-/) || [])[1] || '???'
  log(green(`\n已归档：#${num}  specs/changes/archive/${slug}`))
  log(dim('  台账状态已更新为 archived'))
  log('')
  log(yellow('别忘了合并规范（这一步必须由人确认）：'))
  log('  1. 打开归档目录的 spec.md，把增量合并进 specs/capabilities/<能力>/spec.md')
  log('  2. 更新该文件的 last_reviewed 与「变更历史」')
  log('  3. 跑 node scripts/spec.js check 确认无漂移')
  log('')
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
function cmdStatus() {
  log(bold('\n规范库健康度\n'))

  const caps = isDir(CAPS)
    ? fs.readdirSync(CAPS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : []
  const changes = listChanges()
  const archived = isDir(ARCHIVE)
    ? fs.readdirSync(ARCHIVE, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0

  let acTotal = 0
  let stale = 0
  caps.forEach((name) => {
    const text = read(path.join(CAPS, name, 'spec.md'))
    const n = (text.match(/\bAC-[A-Z]+-\d{2}\b/g) || []).length
    acTotal += n
    const meta = parseFrontMatter(text)
    const age = daysSince(meta.last_reviewed)
    if (age !== null && age > 90) stale++
  })

  const rows = [
    ['能力规范', caps.length, '个'],
    ['验收标准', acTotal, '条'],
    ['进行中变更', changes.length, '个'],
    ['已归档', archived, '个'],
    ['超 90 天未复核', stale, '个']
  ]
  rows.forEach(([k, v, u]) => log(`  ${k.padEnd(16, ' ')} ${bold(String(v))} ${dim(u)}`))

  if (changes.length) {
    log('')
    changes.forEach((slug) => {
      const dir = path.join(CHANGES, slug)
      const t = countTasks(read(path.join(dir, 'tasks.md')))
      const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
      log(`  ${cyan(slug.padEnd(28))} ${String(pct).padStart(3)}%`)
    })
  }

  log('')
  if (stale > 0) log(yellow(`  ${stale} 个能力规范超过 90 天未复核，建议本月巡检时处理`))
  if (!caps.length) log(yellow('  还没有能力规范：先给"接下来要改的那个功能"补一份'))
  if (changes.length > 3) log(yellow(`  同时有 ${changes.length} 个变更在进行，考虑合并或关闭一些`))
  if (!stale && caps.length && changes.length <= 3) log(green('  状态健康'))
  log('')
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const [, , cmd, ...args] = process.argv
  switch (cmd) {
    case 'new':
      cmdNew(args)
      break
    case 'list':
      cmdList()
      break
    case 'check':
      cmdCheck(args)
      break
    case 'approve':
      cmdApprove(args)
      break
    case 'reject':
      cmdReject(args)
      break
    case 'verify':
      cmdVerify(args)
      break
    case 'archive':
      cmdArchive(args)
      break
    case 'status':
      cmdStatus()
      break
    default:
      log(`
${bold('spec.js')} — 规范库体检工具

  node scripts/spec.js new <slug> [--level L1|L2|L3] [--title "标题"]
  node scripts/spec.js list
  node scripts/spec.js check [slug] [--strict]
  node scripts/spec.js approve <slug> --by <名字> [--note "备注"]
  node scripts/spec.js reject <slug> --by <名字> --reason "原因"
  node scripts/spec.js verify <slug>
  node scripts/spec.js archive <slug> [--force]
  node scripts/spec.js status

${dim('状态机：draft → approved → verified → archived（用户在对话中批准，AI 写入）')}
${dim('本工具是可选体检，不是流程必需。approve/reject/verify 仅在你想批量操作时使用。')}

文档：specs/README.md · specs/guide/规范编程落地指南.md
`)
  }
}

main()
