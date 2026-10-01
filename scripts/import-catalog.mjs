// Command-line catalogue import (large files). Same parsing, validation, de-duplication and
// database functions as Admin → Catálogo → Importação.
//
//   npm run import:catalog -- <ficheiro> --dry-run [--default-condition new]   (offline: só valida)
//   npm run import:catalog -- <ficheiro> --source ficheiros                     (importa)
//
// Options:
//   --source <key>             catalog source (Admin → Catálogo → Providers); default "ficheiros"
//   --mode <m>                 upsert (default) | insert_only | update_only
//   --no-create                do not create missing brands / categories / vehicles / suppliers
//   --record-tag <tag>         XML element of each product (default: detected)
//   --mapping <file.json>      column overrides: {"Coluna do ficheiro": "campo" | ""}
//   --default-condition <c>    new | used, for --dry-run (on import the source's default is used)
//   --report <file.csv>        write every line with errors/warnings to a CSV
//   --chunk <n>                starting rows per call (default 200; shrinks on timeouts)
//
// Import needs an ADMIN account: ADMIN_EMAIL and ADMIN_PASSWORD in the environment or in
// .env.local (git-ignored). Only the public key is used; the database checks is_admin().
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { build } from 'rolldown'
import { loadEnv } from 'vite'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const VALUE_OPTIONS = ['--source', '--mode', '--record-tag', '--mapping', '--default-condition', '--report', '--chunk']
const file = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.includes(args[i - 1]))
if (!file) {
  console.log('Uso: npm run import:catalog -- <ficheiro.csv|json|xml> [--dry-run] [--source ficheiros] [--mode upsert] [--report erros.csv]')
  process.exit(1)
}
const dryRun = flag('dry-run')
const mode = option('mode', 'upsert')
if (!['upsert', 'insert_only', 'update_only'].includes(mode)) {
  console.log(`Modo inválido: ${mode}`)
  process.exit(1)
}

// The importer's TypeScript core, bundled on the fly (no extra dependencies).
const outDir = join(process.cwd(), 'node_modules', '.tmp')
mkdirSync(outDir, { recursive: true })
const corePath = join(outDir, 'import-core.mjs')
await build({
  input: join(process.cwd(), 'src/services/catalogImport/core.ts'),
  platform: 'node',
  logLevel: 'warn',
  output: { file: corePath, format: 'esm' },
})
const core = await import(pathToFileURL(corePath).href)

// ── Parse, map and validate ──
console.log(`\nFicheiro: ${file}`)
const started = Date.now()
const text = readFileSync(file, 'utf8')
const parsed = core.parseFile(basename(file), text, { recordTag: option('record-tag') })
console.log(`Formato: ${parsed.format.toUpperCase()} · ${parsed.records.length} registos · ${parsed.columns.length} colunas`)

const mapping = core.autoMapping(parsed.columns)
const mappingFile = option('mapping')
if (mappingFile) Object.assign(mapping, JSON.parse(readFileSync(mappingFile, 'utf8')))
for (const [column, field] of Object.entries(mapping)) {
  if (field && !core.IMPORT_FIELDS.includes(field)) {
    console.log(`Campo desconhecido no mapeamento: "${column}" → "${field}"`)
    process.exit(1)
  }
}
console.log('\nCorrespondência de colunas:')
for (const [column, field] of Object.entries(mapping)) console.log(`  ${column.padEnd(32)} → ${field || '(ignorada)'}`)

let supabase
let source
if (!dryRun) {
  const env = { ...loadEnv('development', process.cwd(), ['VITE_', 'ADMIN_']), ...process.env }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!env.VITE_SUPABASE_URL || !key) {
    console.log('\nFalta VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY no .env')
    process.exit(1)
  }
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log('\nPara importar: defina ADMIN_EMAIL e ADMIN_PASSWORD (conta de administrador) no ambiente ou em .env.local.')
    console.log('Para só validar o ficheiro, use --dry-run.')
    process.exit(1)
  }
  supabase = createClient(env.VITE_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: true } })
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })
  if (loginError) {
    console.log(`\nLogin falhou: ${loginError.message}`)
    process.exit(1)
  }
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (isAdmin !== true) {
    console.log('\nA conta não é administradora.')
    process.exit(1)
  }
  const sourceKey = option('source', 'ficheiros')
  const { data, error } = await supabase.from('catalog_sources').select('*').eq('key', sourceKey).maybeSingle()
  if (error) throw error
  if (!data) {
    console.log(`\nFonte "${sourceKey}" não existe (Admin → Catálogo → Providers).`)
    process.exit(1)
  }
  if (!data.enabled || data.mode === 'live') {
    console.log(`\nFonte "${sourceKey}" está inativa ou é só de consulta em tempo real.`)
    process.exit(1)
  }
  source = data
}

const defaultCondition = source?.default_condition ?? option('default-condition') ?? null
const prepared = core.prepareImport(parsed.records, mapping, {
  mode,
  defaultCondition,
  firstLine: parsed.format === 'csv' ? 2 : 1,
})
const withWarnings = prepared.rows.filter((r) => r.warnings.length).length
console.log(`\nValidação:`)
console.log(`  ${prepared.valid.length} produtos prontos`)
console.log(`  ${prepared.invalidCount} linhas com erros (não importadas)`)
console.log(`  ${prepared.mergedCount} linhas agrupadas no mesmo produto (ex.: uma linha por veículo)`)
console.log(`  ${withWarnings} linhas com avisos`)

const summary = new Map()
for (const r of prepared.rows) for (const issue of [...r.errors, ...r.warnings]) {
  const code = issue.split(':')[0]
  summary.set(code, (summary.get(code) ?? 0) + 1)
}
if (summary.size) {
  console.log('\nOcorrências por tipo:')
  for (const [code, n] of [...summary.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(7)}  ${code}`)
}
const firstErrors = prepared.rows.filter((r) => r.errors.length).slice(0, 15)
if (firstErrors.length) {
  console.log('\nPrimeiras linhas com erro:')
  for (const r of firstErrors) console.log(`  linha ${r.line}: ${r.errors.join(' · ')}`)
}

const reportFile = option('report')
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
function writeReport(serverIssues = []) {
  if (!reportFile) return
  const lines = [['linha', 'origem', 'tipo', 'mensagem'].map(csvCell).join(';')]
  for (const r of prepared.rows) {
    for (const e of r.errors) lines.push([r.line, 'validação', 'erro', e].map(csvCell).join(';'))
    for (const w of r.warnings) lines.push([r.line, 'validação', 'aviso', w].map(csvCell).join(';'))
  }
  for (const [kind, row, message] of serverIssues) lines.push([row, 'base de dados', kind, message].map(csvCell).join(';'))
  writeFileSync(reportFile, '﻿' + lines.join('\n'), 'utf8')
  console.log(`\nRelatório: ${reportFile} (${lines.length - 1} ocorrências)`)
}

if (dryRun) {
  writeReport()
  console.log(`\nSimulação (--dry-run): nada foi enviado. ${((Date.now() - started) / 1000).toFixed(1)} s\n`)
  process.exit(0)
}
if (prepared.valid.length === 0) {
  writeReport()
  console.log('\nNada para importar.\n')
  process.exit(1)
}

// ── Import ──
const { data: batchId, error: startError } = await supabase.rpc('admin_catalog_import_start', {
  p_source_id: source.id,
  p_format: parsed.format,
  p_file_name: basename(file).slice(0, 200),
  p_mode: mode,
  p_options: { create_reference_data: !flag('no-create') },
})
if (startError) throw startError

let cancelled = false
process.on('SIGINT', () => {
  if (cancelled) process.exit(130)
  cancelled = true
  console.log('\nA parar depois do bloco atual… (Ctrl+C outra vez para sair já)')
})

console.log(`\nA importar ${prepared.valid.length} produtos para a fonte "${source.key}" (modo ${mode})…`)
let result
try {
  result = await core.sendInChunks(
    prepared.valid,
    async (chunk, offset) => {
      const { data, error, status } = await supabase.rpc('admin_catalog_import_rows', {
        p_batch_id: batchId,
        p_rows: chunk,
        p_row_offset: offset,
      })
      if (error) throw Object.assign(error, { status })
      return data
    },
    {
      initialSize: Number(option('chunk', 200)),
      isCancelled: () => cancelled,
      onProgress: (p) => {
        const pct = ((p.sent / p.total) * 100).toFixed(1)
        const rate = p.sent / Math.max((Date.now() - started) / 1000, 1)
        const eta = Math.round((p.total - p.sent) / Math.max(rate, 0.01))
        process.stdout.write(
          `\r  ${p.sent}/${p.total} (${pct}%) · +${p.inserted} ↻${p.updated} ⤼${p.skipped} ✘${p.failed} · bloco ${p.chunkSize} · ~${eta}s   `,
        )
      },
    },
  )
} catch (error) {
  await supabase.rpc('admin_catalog_import_finish', { p_batch_id: batchId, p_cancelled: true })
  console.log(`\n\nImportação interrompida: ${error.message ?? error}`)
  console.log('As linhas já enviadas ficam importadas; voltar a correr o mesmo ficheiro não cria duplicados.\n')
  process.exit(1)
}
const { data: batch, error: finishError } = await supabase.rpc('admin_catalog_import_finish', {
  p_batch_id: batchId,
  p_cancelled: result.cancelled,
})
if (finishError) throw finishError

const p = result.progress
console.log(`\n\nEstado: ${batch.status}`)
console.log(`  criados ${p.inserted} · atualizados ${p.updated} · ignorados ${p.skipped} · com erro ${p.failed}`)
if (p.errors.length) {
  console.log('\nPrimeiros erros da base de dados:')
  for (const e of p.errors.slice(0, 15)) console.log(`  linha ${e.row}: ${e.error}`)
}
writeReport([
  ...p.errors.map((e) => ['erro', e.row, e.error]),
  ...p.warnings.flatMap((w) => w.warnings.map((x) => ['aviso', w.row, x])),
])
console.log(`\nTempo: ${((Date.now() - started) / 1000).toFixed(0)} s\n`)
await supabase.auth.signOut()
