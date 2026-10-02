// Illustrative photos per part type, from Wikimedia Commons (official API, freely licensed files only).
//
//   npm run images:illustrative -- candidates [--only brake-pads,oil-filter]   → images-work/illustrative/
//        searches Commons, keeps only commercially reusable licences, writes candidates + contact sheets
//   npm run images:illustrative -- build                                        → public/images/illustrative/
//        downloads the files chosen in scripts/images/illustrative-selection.json, re-checks the licence,
//        writes optimised WebP (400 / 800 px) and src/data/illustrative-images.json (credits shown on the site)
//
// These photos show the TYPE of part, never the exact product: the site always labels them "illustrative".
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { IMAGE_PROPS, allowedLicense, api, describe, download } from './commons.mjs'
import { ROOT, WORK, args, importTs, readJson, sha256, writeJson } from './lib.mjs'

const SELECTION = join(ROOT, 'scripts/images/illustrative-selection.json')
const OUT_DIR = join(ROOT, 'public/images/illustrative')
const DATA_FILE = join(ROOT, 'src/data/illustrative-images.json')
const WIDTHS = [400, 800]

async function candidates(only) {
  const { PART_TYPES } = await importTs('src/utils/partTypes.ts')
  const types = only ? PART_TYPES.filter((t) => only.includes(t.key)) : PART_TYPES
  const out = readJson(join(WORK, 'illustrative/candidates.json'), {})
  for (const type of types) {
    const data = await api({
      action: 'query',
      generator: 'search',
      gsrsearch: `${type.search} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: '30',
      iiurlwidth: '320',
      ...IMAGE_PROPS,
    })
    const pages = (data.query?.pages ?? []).sort((a, b) => a.index - b.index).map(describe)
    const ok = pages.filter(
      (p) =>
        allowedLicense(p.license) &&
        !p.restrictions &&
        /^image\/(jpeg|png|webp)$/.test(p.mime ?? '') &&
        (p.width ?? 0) >= 600 &&
        (p.height ?? 0) >= 400,
    )
    out[type.key] = ok.slice(0, 10)
    console.log(`${type.key.padEnd(22)} ${String(ok.length).padStart(2)} válidas de ${pages.length}`)
    await new Promise((r) => setTimeout(r, 300))
  }
  writeJson(join(WORK, 'illustrative/candidates.json'), out)

  // Contact sheets (HTML; open in a browser or screenshot) to choose visually.
  const keys = Object.keys(out)
  for (let i = 0; i < keys.length; i += 6) {
    const rows = keys
      .slice(i, i + 6)
      .map(
        (key) =>
          `<tr><th>${key}</th>${out[key]
            .map((c, n) => `<td><img src="${c.thumb}"><br>${n} · ${c.license}</td>`)
            .join('')}</tr>`,
      )
      .join('')
    writeFileSync(
      join(WORK, `illustrative/sheet-${String(i / 6 + 1).padStart(2, '0')}.html`),
      `<!doctype html><meta charset="utf-8"><style>body{font:11px sans-serif;margin:4px}td,th{vertical-align:top;padding:2px;width:150px}img{width:150px;height:112px;object-fit:contain;background:#eee}</style><table>${rows}</table>`,
    )
  }
  console.log(`\nCandidatas e folhas de contacto em ${join(WORK, 'illustrative')}`)
}

async function buildSelection() {
  const selection = readJson(SELECTION, null)
  if (!selection) throw new Error(`Falta ${SELECTION}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const data = {}
  const seen = new Map()
  for (const [key, title] of Object.entries(selection)) {
    if (!title) continue
    // Re-check the licence at build time (it can change on Commons).
    const info = await api({ action: 'query', titles: title, iiurlwidth: '1600', ...IMAGE_PROPS })
    const page = info.query?.pages?.[0]
    if (!page || page.missing) {
      console.log(`✗ ${key}: ficheiro inexistente (${title})`)
      continue
    }
    const meta = describe(page)
    if (!allowedLicense(meta.license) || meta.restrictions) {
      console.log(`✗ ${key}: licença não permitida (${meta.license})`)
      continue
    }
    const original = await download(meta.thumb)
    const hash = sha256(original)
    if (seen.has(hash)) console.log(`  aviso: ${key} usa a mesma imagem que ${seen.get(hash)}`)
    seen.set(hash, key)
    let width = 0
    let height = 0
    for (const w of WIDTHS) {
      const out = await sharp(original)
        .rotate()
        .resize({ width: w, height: Math.round((w * 3) / 4), fit: 'cover', position: 'attention' })
        .webp({ quality: 76, effort: 5 })
        .toBuffer({ resolveWithObject: true })
      writeFileSync(join(OUT_DIR, `${key}-${w}.webp`), out.data)
      width = out.info.width
      height = out.info.height
    }
    data[key] = {
      width,
      height,
      title: meta.title.replace(/^File:/, ''),
      author: meta.author.slice(0, 120),
      license: meta.license,
      licenseUrl: meta.licenseUrl,
      sourceUrl: meta.pageUrl,
      sha256: hash,
    }
    console.log(`✓ ${key.padEnd(22)} ${meta.license.padEnd(14)} ${meta.author.slice(0, 40)}`)
    await new Promise((r) => setTimeout(r, 300))
  }
  writeJson(DATA_FILE, data)
  console.log(`\n${Object.keys(data).length} fotografias ilustrativas → ${OUT_DIR}`)
}

const a = args()
const [command] = a.positional(['--only'])
if (command === 'candidates') await candidates(a.option('only')?.split(','))
else if (command === 'build') await buildSelection()
else {
  console.log('Uso: npm run images:illustrative -- candidates [--only chave1,chave2] | build')
  process.exit(existsSync(SELECTION) ? 0 : 1)
}
