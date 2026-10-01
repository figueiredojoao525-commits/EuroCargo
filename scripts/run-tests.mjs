// Unit tests: bundles every src/**/*.test.ts with rolldown (already a Vite dependency)
// and runs them with Node's built-in test runner. No extra packages.
//   npm test
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { build } from 'rolldown'

const root = process.cwd()
const outDir = join(root, 'node_modules', '.tmp', 'tests')

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return findTests(path)
    return entry.name.endsWith('.test.ts') ? [path] : []
  })
}

const tests = findTests(join(root, 'src'))
if (tests.length === 0) {
  console.log('No tests found.')
  process.exit(0)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const outputs = []
for (const file of tests) {
  const out = join(outDir, relative(join(root, 'src'), file).replace(/[\\/]/g, '__').replace(/\.ts$/, '.mjs'))
  await build({
    input: file,
    platform: 'node',
    external: [/^node:/],
    logLevel: 'warn',
    output: { file: out, format: 'esm' },
  })
  outputs.push(out)
}

const result = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' })
process.exit(result.status ?? 1)
