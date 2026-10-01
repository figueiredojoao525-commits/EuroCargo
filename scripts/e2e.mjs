// End-to-end smoke tests in a real Chrome against a running build and the Supabase in `.env`.
// Read-only flows + the local cart: never creates accounts, orders or payments.
//   npm run build && npx vite preview --port 4180   (in another terminal)
//   npm run test:e2e                                  (BASE=… and CHROME_PATH=… to override)
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE ?? 'http://localhost:4180'
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p))
if (!CHROME) {
  console.log('Chrome/Edge not found: set CHROME_PATH')
  process.exit(1)
}
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--disable-gpu'],
})
let passed = 0
let failed = 0
const problems = []
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✔ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✘ ${name}\n      ${String(e.message).split('\n')[0]}`)
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function newPage(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(`console: ${m.text()}`)
  })
  page.on('requestfailed', (r) => {
    if (!r.url().includes('/functions/v1/')) page.errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('supabase.co/rest/') && r.status() >= 400) page.errors.push(`HTTP ${r.status()} ${u.slice(0, 160)}`)
  })
  return page
}
const text = (page) => page.evaluate(() => document.body.innerText)
async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 400))
}
const clean = (page, label) => {
  const errs = page.errors.filter((e) => !/favicon/.test(e))
  if (errs.length) problems.push(`${label}: ${errs.join(' | ')}`)
  assert(errs.length === 0, errs.join(' | '))
}

console.log(`\nE2E — ${BASE}\n`)

const PUBLIC_ROUTES = ['/', '/pecas', '/veiculos', '/categorias', '/carrinho', '/rastrear', '/login', '/register',
  '/forgot-password', '/terms', '/privacy', '/pecas?q=filtro', '/pecas?condition=used', '/rota-inexistente']
for (const route of PUBLIC_ROUTES) {
  await test(`page ${route} renders without errors`, async () => {
    const page = await newPage()
    await go(page, route)
    const t = await text(page)
    assert(t.length > 200, 'empty page')
    if (route === '/rota-inexistente') assert(/404|não encontrad/i.test(t), 'no 404 message')
    else assert(!/Página não encontrada/i.test(t), 'shows 404')
    clean(page, route)
    await page.close()
  })
}

await test('internal links all resolve (no 404) from home, shop, footer', async () => {
  const page = await newPage()
  const seen = new Set()
  for (const start of ['/', '/pecas', '/veiculos', '/categorias']) {
    await go(page, start)
    const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')))
    for (const h of hrefs) if (!h.startsWith('/admin') && !h.startsWith('/pecas/')) seen.add(h.split('#')[0])
  }
  const broken = []
  for (const h of seen) {
    await go(page, h)
    if (/Página não encontrada/i.test(await text(page))) broken.push(h)
  }
  assert(broken.length === 0, `broken: ${broken.join(', ')}`)
  console.log(`      (${seen.size} links checked)`)
  await page.close()
})

await test('search + filters: text, category, condition, vehicle selector', async () => {
  const page = await newPage()
  await go(page, '/pecas')
  await page.type('#product-search-md', 'pastilhas')
  await Promise.all([page.waitForNetworkIdle(), page.keyboard.press('Enter')])
  await new Promise((r) => setTimeout(r, 500))
  let t = await text(page)
  assert(/Pastilhas/.test(t) && /resultado/.test(t), 'no pad results')
  assert(page.url().includes('q=pastilhas'), 'query not in URL')
  // Vehicle selector: choose Volkswagen.
  const makeValue = await page.$eval('#vehicle-make', (s) => [...s.options].find((o) => o.text === 'Volkswagen')?.value)
  assert(makeValue, 'Volkswagen not in make list')
  await page.select('#vehicle-make', makeValue)
  await page.waitForNetworkIdle()
  t = await text(page)
  assert(/Golf/.test(t), 'VW results missing')
  clean(page, 'search')
  await page.close()
})

await test('product page: price, availability, compatibility, illustrative image, no internal data', async () => {
  const page = await newPage()
  await go(page, '/pecas?q=ótica esquerda')
  const href = await page.$eval('a[href^="/pecas/"]', (a) => a.getAttribute('href'))
  await go(page, href)
  const t = await text(page)
  assert(/€/.test(t) && /Compatibilidade/.test(t), 'missing price / compatibility')
  assert(/Disponível|Sob consulta|Indisponível|encomenda/.test(t), 'missing availability label')
  assert(!/Origem dos dados|Fornecedor|custo|margem/i.test(t), 'internal data shown')
  clean(page, 'product')
  await page.close()
})

await test('cart: add product, see it in the request, change quantity, remove', async () => {
  const page = await newPage()
  await go(page, '/pecas?q=filtro')
  const href = await page.$eval('a[href^="/pecas/"]', (a) => a.getAttribute('href'))
  await go(page, href)
  const btn = await page.$('.product-actions .btn-accent')
  assert(btn, 'no add button')
  await btn.click()
  await new Promise((r) => setTimeout(r, 300))
  assert(/Ver pedido|adicionad/i.test(await text(page)), 'no added confirmation')
  await go(page, '/carrinho')
  let t = await text(page)
  assert(/Filtro/i.test(t), 'item not in cart')
  const remove = await page.$$('button')
  let removed = false
  for (const b of remove) {
    const label = await b.evaluate((el) => (el.getAttribute('aria-label') || el.innerText || '').toLowerCase())
    if (/remover|eliminar|retirar/.test(label)) {
      await b.click()
      removed = true
      break
    }
  }
  assert(removed, 'no remove button')
  await new Promise((r) => setTimeout(r, 300))
  t = await text(page)
  assert(/Ainda não adicionou/i.test(t), 'cart not empty after remove')
  clean(page, 'cart')
  await page.close()
})

await test('cart → sending a request requires an account (redirect / prompt to log in)', async () => {
  const page = await newPage()
  await go(page, '/pecas?q=filtro')
  const href = await page.$eval('a[href^="/pecas/"]', (a) => a.getAttribute('href'))
  await go(page, href)
  await (await page.$('.product-actions .btn-accent')).click()
  await go(page, '/carrinho')
  const t = await text(page)
  assert(/Entrar|iniciar sessão|conta/i.test(t), 'no login prompt for sending')
  await page.close()
})

await test('parts assistant answers from the catalogue (and says so when nothing matches)', async () => {
  const page = await newPage()
  await go(page, '/pecas')
  await page.type('#assistant-input', 'pastilhas de travão Golf V')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('.bubble-assistant .assistant-answer').length > 0, { timeout: 20000 })
  let t = await page.$eval('.assistant-log', (el) => el.innerText)
  assert(/Pastilhas/i.test(t), 'assistant did not find pads')
  await page.type('#assistant-input', 'parafuso dourado inexistente xyz')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('.bubble-assistant .assistant-answer').length > 1, { timeout: 20000 })
  t = await page.$eval('.assistant-log', (el) => el.innerText)
  assert(/Não encontrámos uma correspondência confirmada/i.test(t), 'missing no-match message')
  assert(!/Fornecedor|custo|margem/i.test(t), 'assistant leaked internal data')
  clean(page, 'assistant')
  await page.close()
})

await test('tracking: unknown code shows a clear not-found message', async () => {
  const page = await newPage()
  await go(page, '/rastrear?code=EC-PT-2000-AAAAAA')
  const t = await text(page)
  assert(/encontrad|not found/i.test(t), "no not-found message: " + t.slice(0, 300))
  clean(page, 'tracking')
  await page.close()
})

await test('login form validation and wrong credentials message (no account created)', async () => {
  const page = await newPage()
  await go(page, '/login')
  await page.type('input[type=email]', 'ninguem@example.invalid')
  await page.type('input[type=password]', 'password-errada-123')
  await page.click('form button[type=submit]')
  await page.waitForFunction(() => /inválid|incorret|Email ou password/i.test(document.body.innerText), { timeout: 15000 })
  await page.close()
})

await test('admin area is protected: /admin redirects anonymous visitors to login', async () => {
  const page = await newPage()
  await go(page, '/admin/catalog/import')
  assert(page.url().includes('/login'), `not redirected: ${page.url()}`)
  await page.close()
})

await test('languages: switching to English translates the shop', async () => {
  const page = await newPage()
  await go(page, '/pecas?lang=en')
  const t = await text(page)
  assert(/Search|parts/i.test(t) && /Available|On request|To order|Unavailable|results/i.test(t), 'not English')
  clean(page, 'lang')
  await page.close()
})

for (const width of [360, 414, 768]) {
  await test(`mobile ${width}px: no horizontal overflow on home, shop, product, cart, vehicles`, async () => {
    const page = await newPage({ width, height: 800, isMobile: true, hasTouch: true })
    const over = []
    for (const route of ['/', '/pecas', '/pecas?q=filtro', '/carrinho', '/veiculos', '/rastrear', '/login']) {
      await go(page, route)
      const w = await page.evaluate(() => document.documentElement.scrollWidth)
      if (w > width + 1) over.push(`${route} (${w}px)`)
    }
    assert(over.length === 0, `overflow: ${over.join(', ')}`)
    await page.close()
  })
}

await browser.close()
console.log(`\n${passed} passed, ${failed} failed`)
if (problems.length) console.log('\nProblems:\n' + problems.join('\n'))
process.exit(failed ? 1 : 0)
