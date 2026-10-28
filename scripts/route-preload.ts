import type { Plugin, Rollup } from 'vite'

/**
 * Fora da landing, o app só pede App.tsx depois que main.js roda, e a tela da rota só depois disso:
 * três idas à rede antes do primeiro conteúdo. Este plugin escreve no HTML um script que, conforme
 * o caminho aberto, já pede esses arquivos em paralelo (modulepreload). Em "/" não pede nada,
 * para não pesar a landing.
 */
const ROUTES: Record<string, string> = {
  '*': 'src/app/App.tsx',
  '/entrar': 'src/features/auth/Login.tsx',
  '/app': 'src/app/AppLayout.tsx',
  '/app$': 'src/app/Home.tsx',
  '/app/plano': 'src/features/plan/PlanPage.tsx',
  '/app/config': 'src/features/settings/SettingsPage.tsx',
  '/app/d': 'src/features/challenges/ChallengePage.tsx',
  '/convite': 'src/features/challenges/InvitePage.tsx',
  '/m': 'src/features/movements/MovementPage.tsx',
  '/termos': 'src/features/legal/Terms.tsx',
  '/privacidade': 'src/features/legal/Privacy.tsx',
}

export function routePreload(): Plugin {
  return {
    name: 'route-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle as Rollup.OutputBundle
        const chunks = Object.values(bundle).filter((c): c is Rollup.OutputChunk => c.type === 'chunk')
        const entry = chunks.find((c) => c.isEntry)!
        const byModule = new Map(chunks.filter((c) => c.facadeModuleId).map((c) => [c.facadeModuleId!.replace(/\\/g, '/'), c]))
        const files = (mod: string) => {
          const root = [...byModule].find(([id]) => id.endsWith(mod))?.[1]
          if (!root) throw new Error(`route-preload: chunk de ${mod} não encontrado`)
          const out = new Set<string>()
          const walk = (c: Rollup.OutputChunk) => {
            if (c === entry || out.has(c.fileName)) return
            out.add(c.fileName)
            for (const f of c.imports) walk(bundle[f] as Rollup.OutputChunk)
          }
          walk(root)
          return [...out]
        }
        const map = Object.fromEntries(Object.entries(ROUTES).map(([path, mod]) => [path, files(mod)]))
        const script = `<script>(function(){var p=location.pathname.replace(/\\/$/,'')||'/';if(p==='/')return;var m=${JSON.stringify(map)},s={};for(var k in m){var e=k.slice(-1)==='$',b=e?k.slice(0,-1):k;if(k==='*'||p===b||(!e&&p.indexOf(b+'/')===0))m[k].forEach(function(f){if(s[f])return;s[f]=1;var l=document.createElement('link');l.rel='modulepreload';l.href='/'+f;document.head.appendChild(l)})}})()</script>`
        return html.replace('</head>', () => `    ${script}\n  </head>`) // função: o script tem "$'"
      },
    },
  }
}
