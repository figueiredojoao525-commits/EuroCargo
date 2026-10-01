// File parsers for the catalogue importer: CSV, JSON and XML → plain records.
// Pure functions (no DOM), so they also run in tests and could run in an Edge Function.

export type ImportValue = string | number | boolean | null | ImportValue[] | { [key: string]: ImportValue }
export type ImportRecord = Record<string, ImportValue>

export interface ParsedFile {
  records: ImportRecord[]
  /** Column / key names found (first-seen order). */
  columns: string[]
}

export class ImportParseError extends Error {
  readonly line?: number

  constructor(message: string, line?: number) {
    super(message)
    this.line = line
  }
}

export function detectFormat(fileName: string, text: string): 'csv' | 'json' | 'xml' {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'json') return 'json'
  if (ext === 'xml') return 'xml'
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv'
  const start = text.trimStart()[0]
  return start === '{' || start === '[' ? 'json' : start === '<' ? 'xml' : 'csv'
}

function columnsOf(records: ImportRecord[]): string[] {
  const seen = new Set<string>()
  for (const record of records.slice(0, 500)) for (const key of Object.keys(record)) seen.add(key)
  return [...seen]
}

// ─────────────── CSV ───────────────

/** Delimiter with the most occurrences (outside quotes) in the header line. */
function detectDelimiter(text: string): string {
  const header = text.slice(0, text.search(/\r?\n|$/))
  let best = ','
  let bestCount = 0
  for (const candidate of [',', ';', '\t', '|']) {
    let count = 0
    let quoted = false
    for (const ch of header) {
      if (ch === '"') quoted = !quoted
      else if (ch === candidate && !quoted) count++
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** RFC 4180 CSV (quoted fields, "" escapes, CR/LF), delimiter auto-detected. Empty lines are skipped. */
export function parseCsv(input: string, delimiter?: string): ParsedFile {
  const text = input.replace(/^﻿/, '')
  const sep = delimiter ?? detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let fieldStartLine = 1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
      fieldStartLine = line
    } else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      line++
    } else field += ch
  }
  if (quoted) throw new ImportParseError('csv_unclosed_quote', fieldStartLine)
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''))
  if (nonEmpty.length === 0) return { records: [], columns: [] }
  const header = nonEmpty[0].map((h, i) => h.trim() || `col_${i + 1}`)
  const records = nonEmpty.slice(1).map((cells) => {
    const record: ImportRecord = {}
    header.forEach((h, i) => {
      record[h] = (cells[i] ?? '').trim()
    })
    return record
  })
  return { records, columns: header }
}

// ─────────────── JSON ───────────────

/** An array of objects, or an object holding one ({items|products|data|articles|results: [...]}). */
export function parseJson(text: string): ParsedFile {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch (error) {
    throw new ImportParseError(`json_invalid: ${(error as Error).message}`)
  }
  let list: unknown = data
  if (!Array.isArray(list) && list && typeof list === 'object') {
    const obj = list as Record<string, unknown>
    const key =
      ['items', 'products', 'data', 'articles', 'results', 'rows', 'records'].find((k) => Array.isArray(obj[k])) ??
      Object.keys(obj).find((k) => Array.isArray(obj[k]))
    list = key ? obj[key] : [obj]
  }
  if (!Array.isArray(list)) throw new ImportParseError('json_no_records')
  const records = list.filter((r): r is ImportRecord => !!r && typeof r === 'object' && !Array.isArray(r))
  return { records, columns: columnsOf(records) }
}

// ─────────────── XML ───────────────

interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Minimal, non-validating XML parser (elements, attributes, text, CDATA; no DTD/entities beyond the standard five). */
export function parseXmlTree(input: string): XmlElement {
  const text = input.replace(/^﻿/, '')
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlElement[] = [root]
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([\w:.-]+)\s*>|<\s*([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(text))) {
    const current = stack[stack.length - 1]
    current.text += decodeEntities(text.slice(last, match.index))
    last = tag.lastIndex
    const [whole, cdata, closing, opening, attrText, selfClosing] = match
    if (cdata !== undefined) current.text += cdata
    else if (closing) {
      if (current.name !== closing) throw new ImportParseError(`xml_mismatched_tag: ${closing}`)
      stack.pop()
    } else if (opening) {
      const attrs: Record<string, string> = {}
      for (const a of attrText.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3])
      const element: XmlElement = { name: opening, attrs, children: [], text: '' }
      current.children.push(element)
      if (!selfClosing) stack.push(element)
    } else if (whole.startsWith('<') && !whole.startsWith('<!--') && !whole.startsWith('<?') && !whole.startsWith('<!')) {
      throw new ImportParseError('xml_invalid')
    }
  }
  if (stack.length !== 1) throw new ImportParseError(`xml_unclosed_tag: ${stack[stack.length - 1].name}`)
  if (text.slice(last).includes('<')) throw new ImportParseError('xml_invalid')
  const elements = root.children
  if (elements.length !== 1) throw new ImportParseError('xml_no_root')
  return elements[0]
}

const localName = (name: string) => name.split(':').pop() ?? name

/** Element → value: text for leaves; object for elements with attributes/children (repeated children → arrays). */
function toValue(element: XmlElement): ImportValue {
  const text = element.text.trim()
  if (element.children.length === 0 && Object.keys(element.attrs).length === 0) return text
  const obj: { [key: string]: ImportValue } = {}
  const lists = new Set<string>()
  for (const [k, v] of Object.entries(element.attrs)) obj[localName(k)] = v
  for (const child of element.children) {
    const key = localName(child.name)
    const value = toValue(child)
    const existing = obj[key]
    if (existing === undefined) obj[key] = value
    else if (lists.has(key)) (existing as ImportValue[]).push(value)
    else {
      obj[key] = [existing, value]
      lists.add(key)
    }
  }
  if (text && element.children.length === 0) obj['#text'] = text
  return obj
}

/** Shallowest element whose children repeat a name (the record list); the root otherwise. */
function findRecordParent(root: XmlElement): XmlElement {
  const queue = [root]
  while (queue.length) {
    const el = queue.shift()!
    const names = el.children.map((c) => c.name)
    if (names.some((name, i) => names.indexOf(name) !== i)) return el
    queue.push(...el.children)
  }
  return root
}

/**
 * Records are the repeated elements: `recordTag` when given, otherwise the most frequent
 * child name of the first element whose children repeat (e.g. <products><product>…</product>…</products>).
 */
export function parseXml(text: string, recordTag?: string): ParsedFile {
  const root = parseXmlTree(text)
  let elements: XmlElement[] = []
  if (recordTag) {
    const walk = (el: XmlElement) => {
      for (const child of el.children) {
        if (localName(child.name) === recordTag) elements.push(child)
        else walk(child)
      }
    }
    walk(root)
  } else {
    const parent = findRecordParent(root)
    const counts = new Map<string, number>()
    for (const child of parent.children) counts.set(child.name, (counts.get(child.name) ?? 0) + 1)
    const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    elements = name ? parent.children.filter((c) => c.name === name) : []
  }
  const records = elements.map((el) => {
    const value = toValue(el)
    return (typeof value === 'object' && value && !Array.isArray(value) ? value : { value }) as ImportRecord
  })
  return { records, columns: columnsOf(records) }
}

export function parseFile(fileName: string, text: string, options: { recordTag?: string } = {}) {
  const format = detectFormat(fileName, text)
  const parsed = format === 'json' ? parseJson(text) : format === 'xml' ? parseXml(text, options.recordTag) : parseCsv(text)
  return { format, ...parsed }
}
