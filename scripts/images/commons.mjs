// Wikimedia Commons client for the image tools: official API only (no scraping), identified
// User-Agent, and a licence filter that keeps only files reusable on a commercial site with credit.
import { cachedJson, env } from './lib.mjs'

const API = 'https://commons.wikimedia.org/w/api.php'
// Wikimedia asks automated clients to identify themselves.
export const USER_AGENT = `EuroCargoImageTool/1.0 (${env.VITE_CONTACT_EMAIL || 'https://euro-cargo-6k39.vercel.app'})`

/** Licences that allow commercial reuse (with credit): public domain, CC0, CC BY, CC BY-SA. Never NC/ND. */
export function allowedLicense(shortName) {
  const name = (shortName ?? '').trim()
  if (/\b(nc|nd)\b/i.test(name)) return false
  return /^(cc0|public domain|pd\b|cc[- ]by(-sa)?[- ]\d(\.\d)?)/i.test(name)
}

const stripHtml = (html) =>
  (html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** "Willdre 00:20, 8 February 2007 (UTC)" / "X (talk) (Uploads)" → the name only. */
const cleanAuthor = (name) =>
  name
    .replace(/\d{1,2}:\d{2}, \d{1,2} \w+ \d{4} \(UTC\)/g, '')
    .replace(/\((talk|uploads|contribs)\)/gi, '')
    .replace(/,? with [^,]*$/i, '')
    .replace(/^Photographed by /i, '')
    .replace(/\s+/g, ' ')
    .trim()

export async function api(params, { fresh = false } = {}) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`
  return cachedJson(url, { headers: { 'User-Agent': USER_AGENT }, fresh })
}

export function describe(page) {
  const info = page.imageinfo?.[0]
  const meta = info?.extmetadata ?? {}
  return {
    title: page.title,
    pageUrl: info?.descriptionurl,
    thumb: info?.thumburl,
    width: info?.width,
    height: info?.height,
    mime: info?.mime,
    license: meta.LicenseShortName?.value ?? '',
    licenseUrl: meta.LicenseUrl?.value ?? '',
    author: cleanAuthor(stripHtml(meta.Artist?.value)) || 'Wikimedia Commons',
    restrictions: meta.Restrictions?.value ?? '',
    description: stripHtml(meta.ImageDescription?.value).slice(0, 200),
  }
}

export const IMAGE_PROPS = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
  iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Restrictions|ImageDescription',
}

export async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`download ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
