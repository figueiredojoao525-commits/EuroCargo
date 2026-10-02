// Optional photo sources with free API keys: Pexels and Pixabay (used by illustrative.mjs).
//
// Keys live only on this computer, in .env.local (git-ignored), WITHOUT the VITE_ prefix so they can never
// reach the website bundle:
//   PEXELS_API_KEY=...    (https://www.pexels.com/api/ → "Get started")
//   PIXABAY_API_KEY=...   (https://pixabay.com/api/docs/ → shown when logged in)
//
// Terms respected (checked 2026-10-02):
// - Pexels: Authorization header; 200 requests/hour, 20 000/month; credit the photographer and link to Pexels
//   ("Foto: <nome> (Pexels)" with a link to the photo page); no replicating Pexels' core functionality.
// - Pixabay: 100 requests/60 s; responses cached 24 h; no permanent hotlinking → images are downloaded and
//   served by EuroCargo; show where the images come from.
// Only a few hand-picked photos per part type are ever downloaded — never bulk copies of the libraries.
import { cachedJson, env } from './lib.mjs'

const LIMITS = { pexels: 150, pixabay: 90 } // per run, below the providers' limits
const used = { pexels: 0, pixabay: 0 }

export function stockKey(source) {
  return source === 'pexels' ? env.PEXELS_API_KEY : source === 'pixabay' ? env.PIXABAY_API_KEY : undefined
}

function guard(source) {
  if (!stockKey(source)) {
    throw new Error(
      `Sem chave ${source === 'pexels' ? 'PEXELS_API_KEY' : 'PIXABAY_API_KEY'}: acrescente-a ao ficheiro .env.local (ver docs/images.md).`,
    )
  }
  if (++used[source] > LIMITS[source]) throw new Error(`Limite de pedidos por execução atingido (${source}).`)
}

const fromPexels = (p) => ({
  title: `pexels:${p.id}`,
  pageUrl: p.url,
  thumb: p.src?.medium,
  full: p.src?.large2x ?? p.src?.large,
  width: p.width,
  height: p.height,
  mime: 'image/jpeg',
  license: 'Licença Pexels',
  licenseUrl: 'https://www.pexels.com/license/',
  author: p.photographer || 'Pexels',
  restrictions: '',
  description: (p.alt ?? '').slice(0, 200),
  source: 'Pexels',
})

const fromPixabay = (h) => ({
  title: `pixabay:${h.id}`,
  pageUrl: h.pageURL,
  thumb: h.previewURL ?? h.webformatURL,
  full: h.largeImageURL ?? h.webformatURL,
  width: h.imageWidth,
  height: h.imageHeight,
  mime: 'image/jpeg',
  license: 'Licença de conteúdo Pixabay',
  licenseUrl: 'https://pixabay.com/service/license-summary/',
  author: h.user || 'Pixabay',
  restrictions: '',
  description: (h.tags ?? '').slice(0, 200),
  source: 'Pixabay',
})

export async function searchStock(source, query, lang = 'en') {
  guard(source)
  const key = stockKey(source)
  if (source === 'pexels') {
    const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: '15', locale: pexelsLocale(lang) })}`
    const data = await cachedJson(url, { headers: { Authorization: key } })
    return (data.photos ?? []).map(fromPexels)
  }
  const params = new URLSearchParams({ key, q: query.slice(0, 100), image_type: 'photo', per_page: '15', safesearch: 'true', lang })
  const data = await cachedJson(`https://pixabay.com/api/?${params}`, { cacheKey: `pixabay:${lang}:${query}` })
  await new Promise((r) => setTimeout(r, 700)) // 100 requests / 60 s
  return (data.hits ?? []).map(fromPixabay)
}

/** "pexels:123" / "pixabay:456" → the photo's details (for build). */
export async function stockPhoto(id) {
  const [source, num] = id.split(':')
  guard(source)
  const key = stockKey(source)
  if (source === 'pexels') return fromPexels(await cachedJson(`https://api.pexels.com/v1/photos/${num}`, { headers: { Authorization: key } }))
  const data = await cachedJson(`https://pixabay.com/api/?${new URLSearchParams({ key, id: num })}`, { cacheKey: `pixabay:id:${num}` })
  if (!data.hits?.[0]) throw new Error(`Pixabay ${num} não encontrada`)
  return fromPixabay(data.hits[0])
}

function pexelsLocale(lang) {
  return { pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] ?? 'en-US'
}
