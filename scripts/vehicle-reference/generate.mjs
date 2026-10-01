// Real European vehicle reference data (makes → models → engine versions) from the European
// Environment Agency's monitoring of new passenger cars registered in the EU (2010–2022).
//   node scripts/vehicle-reference/generate.mjs [--fetch]
// --fetch downloads the aggregates again from the EEA DiscoData API into ./cache (gitignored).
// Writes supabase/migrations/20261006000000_vehicle_reference_eea.sql and
// apply_20261006_transaction.sql (same SQL in one transaction, for the SQL Editor).
//
// Source: European Environment Agency (EEA), "Monitoring of CO2 emissions from passenger cars",
// licensed CC BY 4.0 — https://www.eea.europa.eu/en/datahub (credited in the site footer).
// Only what was registered is used: model names, years with real registrations, displacement,
// power and fuel. Nothing is invented; a year outside the data window stays empty.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeOf, baseName, parentOf, display, slugify } from './normalize.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const cache = join(here, 'cache')
const API = 'https://discodata.eea.europa.eu/sql'
const TABLE = '[CO2Emission].[latest].[co2cars]'
const QUERIES = {
  'eea_model_years.json': `SELECT Mk, Cn, [Year] AS y, SUM(R) AS regs FROM ${TABLE} GROUP BY Mk, Cn, [Year] HAVING SUM(R) >= 50`,
  'eea_variants.json': `SELECT Mk, Cn, Ft, [Ec (cm3)] AS ec, [Ep (KW)] AS ep, [Year] AS y, SUM(R) AS regs FROM ${TABLE}
    GROUP BY Mk, Cn, Ft, [Ec (cm3)], [Ep (KW)], [Year] HAVING SUM(R) >= 100`,
}
const MIN_MODEL_REGS = 20000 // a model needs ≥ 20 000 new registrations in the EU (2010–2022)

async function fetchAll() {
  mkdirSync(cache, { recursive: true })
  for (const [file, query] of Object.entries(QUERIES)) {
    const url = `${API}?${new URLSearchParams({ query, p: '1', nrOfHits: '2000000' })}`
    const res = await fetch(url, { headers: { 'User-Agent': 'EuroCargoVehicleRef/1.0' } })
    if (!res.ok) throw new Error(`EEA ${file}: HTTP ${res.status}`)
    writeFileSync(join(cache, file), await res.text())
    console.log(`fetched ${file}`)
  }
}
const load = (file) => {
  if (!existsSync(join(cache, file))) throw new Error(`missing ${file} — run with --fetch`)
  return JSON.parse(readFileSync(join(cache, file), 'utf8')).results
}

// Years on sale: first / last year with a meaningful volume (≥ 2 % of the best year and ≥ minYear),
// so isolated registrations do not stretch the range. 2010 = data start (on sale since ≤ 2010) and
// 2021+ = still sold at the end of the data: both are left open (null) rather than invented.
function years(byYear, minYear) {
  const peak = Math.max(...Object.values(byYear))
  const ys = Object.entries(byYear).filter(([, n]) => n >= Math.max(minYear, peak * 0.02)).map(([y]) => Number(y)).sort()
  if (!ys.length) return null
  return { yearFrom: ys[0] > 2010 ? ys[0] : null, yearTo: ys.at(-1) < 2021 ? ys.at(-1) : null }
}
const addYears = (t, f) => { for (const [y, n] of Object.entries(f)) t[y] = (t[y] ?? 0) + n }

function buildModels() {
  const g = new Map()
  const alias = new Map() // make|raw key → make|final key
  for (const r of load('eea_model_years.json')) {
    const mk = makeOf(r.Mk); if (!mk) continue
    const key = baseName(mk[1], r.Cn); if (!key) continue
    const id = `${mk[1]}|${key}`
    const e = g.get(id) ?? { make: mk[0], slug: mk[1], key, years: {}, regs: 0 }
    e.years[r.y] = (e.years[r.y] ?? 0) + r.regs
    e.regs += r.regs
    g.set(id, e)
  }
  const into = (e, t) => {
    addYears(t.years, e.years)
    t.regs += e.regs
    g.delete(`${e.slug}|${e.key}`)
    alias.set(`${e.slug}|${e.key}`, `${t.slug}|${t.key}`)
  }
  // Same model spelled with / without spaces or dashes: keep the most used spelling.
  const byCompact = new Map()
  for (const e of [...g.values()].sort((a, b) => b.regs - a.regs)) {
    const c = `${e.slug}|${e.key.replace(/[^A-Z0-9+!_]/g, '')}`
    const t = byCompact.get(c)
    if (t) into(e, t)
    else byCompact.set(c, e)
  }
  // "POLO MATCH" → "POLO" when the extra words are not a model of their own (longest names first).
  const keys = {}
  for (const e of g.values()) (keys[e.slug] ??= new Set()).add(e.key)
  for (const e of [...g.values()].sort((a, b) => b.key.split(' ').length - a.key.split(' ').length)) {
    const p = parentOf(e.key, keys[e.slug], e.slug)
    if (p) {
      into(e, g.get(`${e.slug}|${p}`))
      keys[e.slug].delete(e.key)
    }
  }
  const models = []
  const bySlug = new Map()
  for (const e of [...g.values()].sort((a, b) => b.regs - a.regs)) {
    if (e.regs < MIN_MODEL_REGS) continue
    const name = display(e.key, e.slug)
    const slug = slugify(name)
    const dup = bySlug.get(`${e.slug}|${slug}`)
    if (dup) {
      addYears(dup.byYear, e.years)
      dup.regs += e.regs
      alias.set(`${e.slug}|${e.key}`, dup.id)
      continue
    }
    const m = { id: `${e.slug}|${e.key}`, make: e.make, makeSlug: e.slug, name, slug, byYear: { ...e.years }, regs: e.regs }
    bySlug.set(`${e.slug}|${slug}`, m)
    models.push(m)
  }
  for (const m of models) Object.assign(m, years(m.byYear, 300))
  const final = new Map(models.map((m) => [m.id, m]))
  const resolve = (slug, key) => {
    let id = `${slug}|${key}`
    for (let i = 0; i < 10 && !final.has(id) && alias.has(id); i++) id = alias.get(id)
    return final.get(id) ?? null
  }
  return { models: models.sort((a, b) => a.make.localeCompare(b.make) || a.name.localeCompare(b.name)), resolve }
}

const FUEL = (ft) => {
  const f = (ft ?? '').toUpperCase().trim()
  if (/^(PETROL|DIESEL)[/-]ELECTRIC$|PHEV/.test(f)) return 'hybrid'
  if (f === 'PETROL') return 'petrol'
  if (f === 'DIESEL' || f === 'BIODIESEL') return 'diesel'
  if (f === 'ELECTRIC') return 'electric'
  if (f === 'LPG') return 'lpg'
  if (/^(NG|CNG|NG-BIOMETHANE|E85|HYDROGEN)$/.test(f)) return 'other'
  return null
}
const FUEL_PT = { petrol: 'Gasolina', diesel: 'Diesel', hybrid: 'Híbrido', electric: 'Elétrico', lpg: 'GPL', other: 'GNC/E85' }

// Engine versions per model: fuel + displacement (to 0.1 L) + power (kW), as registered.
function buildVariants(resolve) {
  const g = new Map()
  for (const r of load('eea_variants.json')) {
    const mk = makeOf(r.Mk); if (!mk) continue
    const key = baseName(mk[1], r.Cn); if (!key) continue
    const model = resolve(mk[1], key); if (!model) continue
    const fuel = FUEL(r.Ft)
    const kw = Math.round(Number(r.ep))
    if (!fuel || !(kw >= 20 && kw <= 1000)) continue
    const cc = fuel === 'electric' ? null : Math.round(Number(r.ec))
    if (fuel !== 'electric' && !(cc >= 600 && cc <= 8500)) continue
    const litres = cc ? (Math.round(cc / 100) / 10).toFixed(1) : null
    const id = `${model.id}|${fuel}|${litres ?? 'ev'}|${kw}`
    const e = g.get(id) ?? { model, fuel, litres, kw, ccs: {}, byYear: {}, regs: 0 }
    if (cc) e.ccs[cc] = (e.ccs[cc] ?? 0) + r.regs
    e.byYear[r.y] = (e.byYear[r.y] ?? 0) + r.regs
    e.regs += r.regs
    g.set(id, e)
  }
  const per = new Map()
  for (const e of g.values()) {
    // A version needs ≥ 2 000 registrations and ≥ 1 % of its model's.
    if (e.regs < Math.max(2000, e.model.regs * 0.01)) continue
    const y = years(e.byYear, 100)
    if (!y) continue
    const cc = e.litres ? Number(Object.entries(e.ccs).sort((a, b) => b[1] - a[1])[0][0]) : null
    const hp = Math.round(e.kw * 1.35962)
    const v = {
      model: e.model, fuel: e.fuel, cc, kw: e.kw, hp, ...y, regs: e.regs,
      name: `${e.litres ? `${e.litres} ` : ''}${FUEL_PT[e.fuel]} ${e.kw} kW (${hp} cv)`,
      externalId: `eea:${e.model.makeSlug}/${e.model.slug}/${e.fuel}-${e.litres ?? 'ev'}-${e.kw}`,
    }
    if (!per.has(e.model.id)) per.set(e.model.id, [])
    per.get(e.model.id).push(v)
  }
  const out = []
  for (const list of per.values()) {
    const sorted = list.sort((a, b) => b.regs - a.regs)
    // Electric power figures vary per battery / motor: keep the 3 most registered.
    const ev = sorted.filter((v) => v.fuel === 'electric').slice(0, 3)
    out.push(...sorted.filter((v) => v.fuel !== 'electric').slice(0, 30), ...ev)
  }
  return out.sort((a, b) => a.model.make.localeCompare(b.model.make) || a.model.name.localeCompare(b.model.name)
    || a.name.localeCompare(b.name, 'pt', { numeric: true }))
}

// ─────────────── Checks before writing (the database constraints, in JS) ───────────────
function check(makes, models, variants) {
  const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/
  const seen = new Set()
  for (const [name, slug] of makes) {
    if (!slugRe.test(slug) || name.length > 60) throw new Error(`make ${name}`)
  }
  for (const m of models) {
    if (!slugRe.test(m.slug) || m.name.length > 80) throw new Error(`model ${m.make} ${m.name}`)
    if (seen.has(`${m.makeSlug}/${m.slug}`)) throw new Error(`duplicate model ${m.makeSlug}/${m.slug}`)
    seen.add(`${m.makeSlug}/${m.slug}`)
    if (m.yearFrom && m.yearTo && m.yearTo < m.yearFrom) throw new Error(`years ${m.name}`)
  }
  const ext = new Set()
  for (const v of variants) {
    if (v.name.length > 120 || ext.has(v.externalId)) throw new Error(`variant ${v.externalId}`)
    ext.add(v.externalId)
    if (v.yearFrom && v.yearTo && v.yearTo < v.yearFrom) throw new Error(`years ${v.externalId}`)
    if (v.kw > 2000 || v.hp > 2700 || (v.cc && v.cc > 20000)) throw new Error(`figures ${v.externalId}`)
  }
}

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const n = (x) => (x === null || x === undefined ? 'null' : String(x))

function sql(makes, models, variants) {
  const makeRows = makes.map(([name, slug]) => `  (${q(name)}, ${q(slug)})`).join(',\n')
  const modelRows = models.map((m) => `  (${q(m.makeSlug)}, ${q(m.name)}, ${q(m.slug)}, ${n(m.yearFrom)}, ${n(m.yearTo)})`).join(',\n')
  const variantRows = variants.map((v) =>
    `  (${q(v.model.makeSlug)}, ${q(v.model.slug)}, ${q(v.name)}, ${q(v.fuel)}, ${n(v.cc)}, ${n(v.kw)}, ${n(v.hp)}, ${n(v.yearFrom)}, ${n(v.yearTo)}, ${q(v.externalId)})`).join(',\n')
  return `-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — real European vehicle reference data (makes → models → engine versions)
--
-- Source: European Environment Agency (EEA), monitoring of CO2 emissions from new passenger cars
-- registered in the EU, 2010–2022 — licensed CC BY 4.0 (credited in the site footer).
-- Generated by scripts/vehicle-reference/generate.mjs (normalisation rules in normalize.mjs):
--   ${makes.length} makes, ${models.length} models (≥ ${MIN_MODEL_REGS.toLocaleString('en')} EU registrations), ${variants.length} engine versions
--   (fuel, displacement, power; ≥ 2 000 registrations).
-- Years: first / last year with real registrations. Empty = on sale before 2010 (start) or still
-- on sale at the end of the data (end): never invented.
--
-- Reference data only (data_source = 'eea'): no products, prices or stock.
-- Incremental and non-destructive. Existing rows keep their names, years and generations; DEMO
-- makes / models with the same slug only become reference rows (their DEMO products keep working;
-- "Apagar dados de demonstração" no longer removes them). Safe to run again (updates the 'eea' rows).
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── Makes ───────────────
update public.vehicle_makes m set data_source = 'eea', external_id = 'eea:' || v.slug
from (values
${makeRows}
) as v(name, slug)
where m.slug = v.slug and m.data_source = 'demo';

insert into public.vehicle_makes (name, slug, data_source, external_id)
select v.name, v.slug, 'eea', 'eea:' || v.slug
from (values
${makeRows}
) as v(name, slug)
where not exists (select 1 from public.vehicle_makes m where m.slug = v.slug or lower(m.name) = lower(v.name));

-- ─────────────── Models ───────────────
-- DEMO rows with the same slug become reference rows but keep their name, years and generation;
-- rows from an earlier run of this migration get the current years; manual rows are untouched.
update public.vehicle_models md set
  data_source = 'eea', external_id = 'eea:' || v.make_slug || '/' || v.slug,
  year_from = case when md.data_source = 'eea' then v.year_from else md.year_from end,
  year_to = case when md.data_source = 'eea' then v.year_to else md.year_to end,
  updated_at = now()
from (values
${modelRows}
) as v(make_slug, name, slug, year_from, year_to)
join public.vehicle_makes mk on mk.slug = v.make_slug
where md.make_id = mk.id and md.slug = v.slug and md.data_source in ('demo', 'eea');

insert into public.vehicle_models (make_id, name, slug, year_from, year_to, data_source, external_id)
select mk.id, v.name, v.slug, v.year_from, v.year_to, 'eea', 'eea:' || v.make_slug || '/' || v.slug
from (values
${modelRows}
) as v(make_slug, name, slug, year_from, year_to)
join public.vehicle_makes mk on mk.slug = v.make_slug
on conflict (make_id, slug) do nothing;

-- ─────────────── Engine versions ───────────────
insert into public.vehicle_variants (model_id, name, fuel, engine_cc, power_kw, power_hp, year_from, year_to,
                                     data_source, external_id)
select md.id, v.name, v.fuel, v.engine_cc, v.power_kw, v.power_hp, v.year_from, v.year_to, 'eea', v.external_id
from (values
${variantRows}
) as v(make_slug, model_slug, name, fuel, engine_cc, power_kw, power_hp, year_from, year_to, external_id)
join public.vehicle_makes mk on mk.slug = v.make_slug
join public.vehicle_models md on md.make_id = mk.id and md.slug = v.model_slug
on conflict (data_source, external_id) where external_id is not null do update set
  name = excluded.name, fuel = excluded.fuel, engine_cc = excluded.engine_cc, power_kw = excluded.power_kw,
  power_hp = excluded.power_hp, year_from = excluded.year_from, year_to = excluded.year_to, updated_at = now();
`
}

if (process.argv.includes('--fetch')) await fetchAll()
const { models, resolve } = buildModels()
const variants = buildVariants(resolve)
const makes = [...new Map(models.map((m) => [m.makeSlug, [m.make, m.makeSlug]])).values()].sort((a, b) => a[0].localeCompare(b[0]))
check(makes, models, variants)
const body = sql(makes, models, variants)
const migration = join(root, 'supabase', 'migrations', '20261006000000_vehicle_reference_eea.sql')
writeFileSync(migration, body)
writeFileSync(join(root, 'apply_20261006_transaction.sql'),
  `-- EuroCargo — 20261006000000_vehicle_reference_eea, numa única transação (tudo ou nada).
-- Colar inteiro no Supabase → SQL Editor → Run. Só acrescenta veículos de referência (marcas, modelos, motorizações).
begin;
${body}
commit;
`)
console.log(`${makes.length} makes, ${models.length} models, ${variants.length} engine versions → ${migration}`)
