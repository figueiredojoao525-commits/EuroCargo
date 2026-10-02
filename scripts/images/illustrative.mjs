// Illustrative photos per part type: Wikimedia Commons (no key) and, optionally, Pexels / Pixabay (free keys).
//
//   npm run images:illustrative -- candidates [--only brake-pads,oil-filter] [--source commons|pexels|pixabay]
//        searches in pt / en / es / fr / de, checks every licence, writes images-work/illustrative/:
//        candidates.json, candidates-report.csv (found / approved / rejected / duplicate / no licence)
//        and contact sheets (sheet-*.html) to choose by eye
//   npm run images:illustrative -- build
//        downloads the photos chosen in scripts/images/illustrative-selection.json (type → one or more
//        "File:…" / "pexels:<id>" / "pixabay:<id>"), re-checks Commons licences, writes optimised WebP
//        (400 / 800 px) to public/images/illustrative/ and the credits to src/data/illustrative-images.json.
//        Photos already built are not downloaded again.
//
// These photos show the TYPE of part, never the exact product: the site always labels them "illustrative".
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_PROPS, allowedLicense, api, describe, download } from './commons.mjs'
import { ROOT, WORK, args, csv, importTs, readJson, sha256, writeJson } from './lib.mjs'
import { searchStock, stockPhoto } from './stock.mjs'

const SELECTION = join(ROOT, 'scripts/images/illustrative-selection.json')
const OUT_DIR = join(ROOT, 'public/images/illustrative')
const DATA_FILE = join(ROOT, 'src/data/illustrative-images.json')
const WIDTHS = [400, 800]
const LANGS = ['en', 'pt', 'es', 'fr', 'de']

const list = (value) => (Array.isArray(value) ? value : value ? [value] : [])
/** Image ids: the first photo of a type keeps the type key, the next ones get "-2", "-3"… */
const imageId = (type, index) => (index === 0 ? type : `${type}-${index + 1}`)

function verdict(c, seen) {
  if (seen.has(c.title)) return 'duplicada'
  if (!c.license) return 'sem licença confirmada'
  if (c.source === 'Wikimedia Commons' && !allowedLicense(c.license)) return `rejeitada: licença ${c.license}`
  if (c.restrictions) return 'rejeitada: restrições (marca / pessoas)'
  if (!/^image\/(jpeg|png|webp)$/.test(c.mime ?? '')) return `rejeitada: formato ${c.mime ?? '?'}`
  if ((c.width ?? 0) < 600 || (c.height ?? 0) < 400) return 'rejeitada: pequena'
  return 'aprovada (licença) — rever'
}

async function candidates(only, source) {
  const { PART_TYPES } = await importTs('src/utils/partTypes.ts')
  const types = only ? PART_TYPES.filter((t) => only.includes(t.key)) : PART_TYPES
  const selection = readJson(SELECTION, {})
  const out = readJson(join(WORK, 'illustrative/candidates.json'), {})
  const report = []
  for (const type of types) {
    const chosen = new Set(list(selection[type.key]))
    const seen = new Set()
    const approved = []
    const queries = [['en', type.search], ...Object.entries(type.terms ?? {})].filter(([lang]) => LANGS.includes(lang))
    for (const [lang, query] of queries) {
      let found = []
      try {
        if (source === 'commons') {
          const data = await api({
            action: 'query',
            generator: 'search',
            gsrsearch: `${query} filetype:bitmap`,
            gsrnamespace: '6',
            gsrlimit: '15',
            iiurlwidth: '320',
            ...IMAGE_PROPS,
          })
          found = (data.query?.pages ?? []).sort((a, b) => a.index - b.index).map((p) => ({ ...describe(p), source: 'Wikimedia Commons' }))
        } else {
          found = await searchStock(source, query, lang)
        }
      } catch (error) {
        console.log(`  ${type.key} [${lang}] erro: ${error.message}`)
        report.push({ type: type.key, lang, query, status: `erro: ${error.message}` })
        if (/chave|Acesso recusado/.test(error.message)) return
        continue
      }
      for (const c of found) {
        const status = chosen.has(c.title) ? 'já selecionada' : verdict(c, seen)
        seen.add(c.title)
        report.push({ type: type.key, lang, query, title: c.title, license: c.license, author: c.author, status, page: c.pageUrl })
        if (status.startsWith('aprovada')) approved.push(c)
      }
    }
    out[type.key] = approved.slice(0, 20)
    console.log(`${type.key.padEnd(22)} ${String(approved.length).padStart(3)} aprovadas pela licença (${queries.length} línguas)`)
  }
  writeJson(join(WORK, 'illustrative/candidates.json'), out)
  writeFileSync(join(WORK, 'illustrative/candidates-report.csv'), csv(report, ['type', 'lang', 'query', 'status', 'license', 'author', 'title', 'page']))
  const keys = types.map((t) => t.key)
  for (let i = 0; i < keys.length; i += 6) {
    const rows = keys
      .slice(i, i + 6)
      .map((key) => `<tr><th>${key}</th>${(out[key] ?? []).map((c, n) => `<td><img src="${c.thumb}"><br>${n} · ${c.license}</td>`).join('')}</tr>`)
      .join('')
    writeFileSync(
      join(WORK, `illustrative/sheet-${String(i / 6 + 1).padStart(2, '0')}.html`),
      `<!doctype html><meta charset="utf-8"><style>body{font:11px sans-serif;margin:4px}td,th{vertical-align:top;padding:2px;width:150px}img{width:150px;height:112px;object-fit:contain;background:#eee}</style><table>${rows}</table>`,
    )
  }
  const count = (prefix) => report.filter((r) => r.status?.startsWith(prefix)).length
  console.log(
    `\nEncontradas: ${report.filter((r) => r.title).length} · aprovadas pela licença: ${count('aprovada')} · rejeitadas: ${count('rejeitada')} · duplicadas: ${count('duplicada')} · sem licença: ${count('sem licença')} · já selecionadas: ${count('já selecionada')}`,
  )
  console.log(`Relatório e folhas de contacto em ${join(WORK, 'illustrative')}`)
}

async function details(title) {
  if (/^(pexels|pixabay):/.test(title)) {
    const photo = await stockPhoto(title)
    return { meta: photo, url: photo.full }
  }
  const info = await api({ action: 'query', titles: title, iiurlwidth: '1600', ...IMAGE_PROPS }, { fresh: true })
  const page = info.query?.pages?.[0]
  if (!page || page.missing) throw new Error(`ficheiro inexistente (${title})`)
  const meta = { ...describe(page), source: 'Wikimedia Commons' }
  if (!allowedLicense(meta.license) || meta.restrictions) throw new Error(`licença não permitida (${meta.license})`)
  return { meta, url: meta.thumb }
}

async function buildSelection() {
  const selection = readJson(SELECTION, null)
  if (!selection) throw new Error(`Falta ${SELECTION}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const previous = readJson(DATA_FILE, {})
  const data = {}
  const hashes = new Map()
  const today = new Date().toISOString().slice(0, 10)
  let downloaded = 0
  for (const [type, value] of Object.entries(selection)) {
    let index = 0
    for (const title of list(value)) {
      const id = imageId(type, index)
      const old = previous[id]
      // Entries written before "origin" existed only have the Commons file title.
      const oldOrigin = old?.origin ?? (old ? `File:${old.title}` : undefined)
      const filesExist = WIDTHS.every((w) => existsSync(join(OUT_DIR, `${id}-${w}.webp`)))
      try {
        const { meta, url } = await details(title)
        let entry
        if (old && oldOrigin === title && filesExist) {
          entry = old // licence re-checked above, files kept: no download
        } else {
          const original = await download(url)
          const hash = sha256(original)
          if (hashes.has(hash)) throw new Error(`imagem repetida (igual a ${hashes.get(hash)})`)
          let width = 0
          let height = 0
          for (const w of WIDTHS) {
            const out = await sharp(original)
              .rotate()
              .resize({ width: w, height: Math.round((w * 3) / 4), fit: 'cover', position: 'attention' })
              .webp({ quality: 76, effort: 5 })
              .toBuffer({ resolveWithObject: true })
            writeFileSync(join(OUT_DIR, `${id}-${w}.webp`), out.data)
            width = out.info.width
            height = out.info.height
          }
          downloaded++
          entry = { width, height, sha256: hash, importedAt: today }
        }
        if (hashes.has(entry.sha256)) throw new Error(`imagem repetida (igual a ${hashes.get(entry.sha256)})`)
        hashes.set(entry.sha256, id)
        data[id] = {
          type,
          width: entry.width,
          height: entry.height,
          origin: title,
          title: meta.title.replace(/^File:/, ''),
          author: meta.author.slice(0, 120),
          license: meta.license,
          licenseUrl: meta.licenseUrl,
          sourceUrl: meta.pageUrl,
          source: meta.source,
          sha256: entry.sha256,
          importedAt: entry.importedAt ?? today,
        }
        index++
      } catch (error) {
        console.log(`  ✗ ${type} (${title}): ${error.message}`)
      }
      await new Promise((r) => setTimeout(r, 150))
    }
    console.log(`✓ ${type.padEnd(22)} ${index} foto(s)`)
  }
  writeJson(DATA_FILE, data)
  console.log(`\n${Object.keys(data).length} fotografias ilustrativas (${downloaded} novas descarregadas) → ${OUT_DIR}`)
}

const a = args()
const [command] = a.positional(['--only', '--source'])
const source = a.option('source', 'commons')
if (command === 'candidates') await candidates(a.option('only')?.split(','), source)
else if (command === 'build') await buildSelection()
else {
  console.log('Uso: npm run images:illustrative -- candidates [--only chave1,chave2] [--source commons|pexels|pixabay] | build')
  process.exit(1)
}
