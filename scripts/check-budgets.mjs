// Orçamentos de JS da seção 1.2 (gzip). Falha o build se estourar.
// Lê o manifest do Vite para seguir as importações reais de cada porta de entrada.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET = { landing: 90, app: 150, lazy: 60 } // KB
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
const gz = (file) => gzipSync(readFileSync(`dist/${file}`)).length / 1024

/** Arquivos carregados ao abrir `keys` (o chunk + importações estáticas, recursivo). */
function closure(keys, seen = new Set()) {
  for (const key of keys) {
    if (seen.has(key)) continue
    seen.add(key)
    closure(manifest[key].imports ?? [], seen)
  }
  return seen
}
const size = (keys) => [...keys].reduce((t, k) => t + gz(manifest[k].file), 0)

const main = 'index.html'
const landing = closure([main, 'src/landing/Landing.tsx'])
const app = closure([main, 'src/app/App.tsx'])

const rows = [
  ['landing (/)', size(landing), BUDGET.landing],
  ['app (inicial)', size(app), BUDGET.app],
]
// Cada rota lazy do app: só o que ela adiciona além do JS inicial.
for (const [key, chunk] of Object.entries(manifest)) {
  if (!chunk.isDynamicEntry || key === 'src/app/App.tsx' || key === 'src/landing/Landing.tsx') continue
  const extra = [...closure([key])].filter((k) => !app.has(k))
  rows.push([`  lazy ${key.replace('src/', '')}`, size(extra), BUDGET.lazy])
}

let failed = false
for (const [name, kb, limit] of rows) {
  const ok = kb <= limit
  failed ||= !ok
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(48)} ${kb.toFixed(1).padStart(6)} KB / ${limit} KB`)
}
process.exit(failed ? 1 : 0)
