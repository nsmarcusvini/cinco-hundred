// Pré-renderiza as telas públicas e estáticas: o texto aparece com o HTML, antes do JS (LCP).
// Gera dist/<rota>.html (servido em /<rota>; na Vercel via cleanUrls) com o conteúdo da tela dentro do #root; no navegador o React troca
// esse HTML pela mesma tela (src/main.tsx espera a rota carregar para não piscar).
import { readFileSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

const PAGES = {
  '/entrar': '/src/features/auth/Login.tsx',
  '/termos': '/src/features/legal/Terms.tsx',
  '/privacidade': '/src/features/legal/Privacy.tsx',
}

const vite = await createServer({
  configFile: false,
  plugins: [react()],
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
})
try {
  const shell = readFileSync('dist/index.html', 'utf8')
  if (!shell.includes('<div id="root"></div>')) throw new Error('prerender: #root não encontrado em dist/index.html')

  for (const [path, module] of Object.entries(PAGES)) {
    const { default: Page } = await vite.ssrLoadModule(module)
    const body = renderToString(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Page)))
    const html = shell.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`)
    writeFileSync(`dist${path}.html`, html)
    console.log(`prerender ${path}`)
  }
} finally {
  await vite.close()
}
