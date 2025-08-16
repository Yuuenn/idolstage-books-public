// Node 18+
//
// 从 .vitepress/public_structure.csv 或 .vitepress/private_structure.csv 生成：
//   1) docs/.vitepress/sidebar.gen.json

import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// ========== 可配置：编译模式 ==========
/** @type {'PUBLIC'|'PRIVATE'} */
const MODE = 'PUBLIC' // ← 按需改成 'PRIVATE'
const HOMEPAGE_TEXT = '返回 偶活舞台：闪耀手册主页'  // ← 文案

// ========== 常量 ==========
const MAX_DEPTH = 6
const DOCS = resolve('docs')
const VP_DIR = join(DOCS, '.vitepress')
const CSV_FILE = join(VP_DIR, MODE === 'PUBLIC' ? 'public_structure.csv' : 'private_structure.csv')

const titleCase = (s) =>
  String(s || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())

const normPrefix = (p) => {
  // 绝对 URL 前缀：以 / 开头、以 / 结尾；折叠多余斜杠
  const s = '/' + String(p || '').replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
  return (s || '/').replace(/\/+$/, '') + '/'
}

const parentPrefix = (pref) => {
  // '/a/b/' → '/a/'；'/' → null
  const clean = pref.replace(/\/+$/, '')
  const idx = clean.lastIndexOf('/')
  if (idx <= 0) return null
  return normPrefix(clean.slice(0, idx))
}

const depthOfPrefix = (pref) => {
  // '/a/b/' → 2；'/' → 0
  const parts = pref.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  return parts.length
}

const isIndexMd = (relPath) => /(?:^|\/)index\.md$/i.test(relPath)

// 极简 CSV 解析：支持无引号/简单引号的两三列
function parseCsvLines(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('CSV 为空')
  const header = splitCsvLine(lines[0])
  const rows = lines.slice(1).map(splitCsvLine)
  return { header, rows }
}

function splitCsvLine(line) {
  // 简单场景：字段中不含换行；逗号分隔；允许被双引号包裹
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ',' && !inQ) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function stripInternal(node) {
  if (Array.isArray(node)) return node.map(stripInternal);
  if (node && typeof node === 'object') {
    const { _hasIndexItem, prefix, ...rest } = node; // 一起顺手去掉 prefix 等内部键
    if (Array.isArray(rest.items)) rest.items = rest.items.map(stripInternal);
    return rest;
  }
  return node;
}

// ========== 树结构 ==========
/**
 * Group 节点：{ text, collapsed, items, prefix }
 * Item  节点：{ text, link }
 */
function makeGroup(prefix) {
  const name = prefix.replace(/\/+$/,'').split('/').pop() || ''
  return { text: titleCase(name || 'Root'), collapsed: true, items: [], prefix, _hasIndexItem: false }
}

function makeItemTextFromFile(relPath) {
  const file = relPath.replace(/\\/g, '/').split('/').pop() || ''
  return titleCase(file.replace(/\.md$/i, ''))
}

function linkFromRelMd(relPath) {
  const p = relPath.replace(/\\/g, '/')
  if (isIndexMd(p)) {
    const dir = p.replace(/\/?index\.md$/i, '')
    return normPrefix(dir) // 目录链接以 / 结尾；根 index.md → '/'
  }
  return '/' + p.replace(/\.md$/i, '')
}

// ========== 主逻辑 ==========
async function build() {
  // 读取 CSV
  const csvText = await readFile(CSV_FILE, 'utf8').catch((e) => {
    throw new Error(`读取 CSV 失败：${CSV_FILE}\n${e?.message || e}`)
  })
  const { header, rows } = parseCsvLines(csvText)

  let homepageItem = null;

  // 5) 模式匹配校验：PUBLIC 必须 2 列；PRIVATE 必须 3 列
  if (MODE === 'PUBLIC' && header.length !== 2) {
    throw new Error(`模式为 PUBLIC，但 CSV 表头列数为 ${header.length}（应为 2 列：_type,_path）`)
  }
  if (MODE === 'PRIVATE' && header.length !== 3) {
    throw new Error(`模式为 PRIVATE，但 CSV 表头列数为 ${header.length}（应为 3 列：_type,_path,_scopes）`)
  }

  const rootItems = [] // 顶层 sidebar 数组
  const groups = new Map() // prefix -> group
  
  // 一个获取/创建父组并挂载到父级的工具
  function ensureGroupMounted(prefix) {
    if (prefix === '/') return null // 根不是 group
    if (!groups.has(prefix)) {
      // 为确保“严格跟随 CSV 行序”，只有在遇到 dir 行时才挂载；
      // 但为了稳健，这里也允许在确实需要时创建并立即挂载（极少触发）
      const g = makeGroup(prefix)
      groups.set(prefix, g)
      const parent = parentPrefix(prefix)
      if (parent) {
        const pg = groups.get(parent) || (() => {
          const tmp = makeGroup(parent)
          groups.set(parent, tmp)
          // 将临时父组挂到上一级（若还没有）或顶层
          const pparent = parentPrefix(parent)
          if (pparent) {
            const ppg = groups.get(pparent)
            if (!ppg) {
              // 再往上递归创建
              ensureGroupMounted(pparent)
            }
            (groups.get(pparent)).items.push(tmp)
          } else {
            rootItems.push(tmp)
          }
          return tmp
        })()
        pg.items.push(g)
      } else {
        rootItems.push(g)
      }
    }
    return groups.get(prefix)
  }

  // 严格按 CSV 行序构建
  for (const cols of rows) {
    if (cols.length < 2) continue
    const _type = cols[0]
    const relPath = cols[1].replace(/\\/g, '/')
    const scopesRaw = cols[2] ?? ''

    if (_type !== 'file' && _type !== 'dir') continue

    if (_type === 'dir') {
      const pref = normPrefix(relPath)
      const d = depthOfPrefix(pref)
      if (d > MAX_DEPTH) {
        throw new Error(`目录深度超过 ${MAX_DEPTH}：${pref}（深度=${d}）`)
      }
      // 只在遇到 dir 行时“按 CSV 顺序”挂载该组到父级
      if (!groups.has(pref)) {
        const g = makeGroup(pref)
        groups.set(pref, g)
        const parent = parentPrefix(pref)
        if (parent) {
          // 父组必须已存在或现在创建并挂载（创建父组 → 也会被挂载到更上层/根）
          ensureGroupMounted(parent)
          groups.get(parent).items.push(g)
        } else {
          rootItems.push(g)
        }
      }
      // PRIVATE 的 _scopes 由 CSV 管理；此脚本不解析分派，仅做模式校验
      // 如果你将来要在这里用 scopes，可按 `scopesRaw.split('::').map(...)` 解析
      continue
    }

    // file
    const link = linkFromRelMd(relPath)
    if (isIndexMd(relPath)) {
      // 目录首页
      const dir = relPath.replace(/\/?index\.md$/i, '')
      const pref = normPrefix(dir)
      if (pref === '/') {
        // 根 index.md：不立刻加入；PUBLIC 模式下在遍历完成后追加到最后；
        // PRIVATE 模式下则不加入 sidebar。
        if (MODE === 'PUBLIC' && !homepageItem) {
          homepageItem = { text: HOMEPAGE_TEXT || 'Home', link }
        }
      } 
      else {
        // 该目录的组必须存在（若尚未遇到 dir 行，则创建并挂到父级——极少发生）
        const g = ensureGroupMounted(pref)
        if (!g._hasIndexItem) {
          // index.md 的标题 = 该组标题
          g.items.push({ text: g.text, link })
          g._hasIndexItem = true
        }
      }
    } else {
      // 普通文档
      const parts = relPath.split('/')
      const name = parts.pop() || ''
      const dir = parts.join('/')
      const pref = normPrefix(dir)
      const item = { text: makeItemTextFromFile(name), link }

      if (pref === '/') {
        rootItems.push(item)
      } else {
        // 组应已出现（在 CSV 中，子目录的 dir 行在它的文件之前）；若没有则补挂
        const g = ensureGroupMounted(pref)
        g.items.push(item)
      }
    }
  }

  if (MODE === 'PUBLIC' && homepageItem) {
  rootItems.push(homepageItem) // 放在最后
  }

  // 写文件
  const clean = stripInternal(rootItems);
  await writeFile(join(VP_DIR, 'sidebar.gen.json'), JSON.stringify(clean, null, 2), 'utf8');

  console.log(`[ok] 模式=${MODE}  源=${CSV_FILE}`)
  console.log(`[ok] 已生成: ${join(VP_DIR, 'sidebar.gen.json')}`)
}

// 运行
build().catch((e) => {
  console.error(e)
  process.exit(1)
})
