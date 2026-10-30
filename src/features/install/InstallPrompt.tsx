import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { toast } from '../../components/Toast'
import { canPromptInstall, isStandalone, onInstallChange, promptInstall, wasInstalled } from '../../lib/install'
import { monthKey } from '../../lib/plan'
import type { Profile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

type Platform = 'android' | 'ios' | 'desktop'

const platform = (): Platform => {
  const ua = navigator.userAgent
  // iPad recente se apresenta como Mac: o toque denuncia.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return /android/i.test(ua) ? 'android' : 'desktop'
}

const STEPS: { id: Platform; title: string; steps: string[] }[] = [
  {
    id: 'android', title: 'Android (Chrome)',
    steps: ['Toque no menu ⋮, no canto de cima.', 'Escolha Instalar app ou Adicionar à tela inicial.', 'Abra o Tijoblock pelo ícone novo.'],
  },
  {
    id: 'ios', title: 'iPhone (Safari)',
    steps: ['Toque em Compartilhar, na barra do Safari.', 'Escolha Adicionar à Tela de Início.', 'Abra o Tijoblock pelo ícone novo.'],
  },
  {
    id: 'desktop', title: 'Computador (Chrome ou Edge)',
    steps: ['Clique no ícone de instalar, no fim da barra de endereço.', 'Ou abra o menu ⋮ e escolha Instalar Tijoblock.', 'O app ganha um atalho na área de trabalho e no menu Iniciar.'],
  },
]

/**
 * Aviso "Já instalou o app?" na Início: explica como criar o atalho e, onde dá, instala direto.
 * "Já fiz isso" esconde o aviso até o mês seguinte. Rodando instalado, não aparece.
 */
export function InstallPrompt({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const month = monthKey(new Date())
  const answered = profile.install_prompt_month === month

  useEffect(() => onInstallChange(() => {
    setCanPrompt(canPromptInstall())
    if (wasInstalled()) void answer()
  }), [answered])

  if (answered || isStandalone()) return null
  const mine = platform()

  async function answer() {
    if (answered) return
    const key = ['profile', profile.id]
    qc.setQueryData<Profile>(key, (p) => p && { ...p, install_prompt_month: month })
    const { error } = await supabase.from('profiles').update({ install_prompt_month: month }).eq('id', profile.id)
    if (error) {
      qc.setQueryData<Profile>(key, (p) => p && { ...p, install_prompt_month: profile.install_prompt_month })
      toast('Não foi possível salvar. Tente de novo.', 'error')
    }
  }

  async function install() {
    if (await promptInstall()) await answer()
  }

  return (
    <section aria-labelledby="install" className="rounded-field border-2 border-forest p-5">
      <h2 id="install" className="text-lg font-bold">Já instalou o Tijoblock?</h2>
      <p className="mt-2">Com o atalho na tela de início, o app abre direto, em tela cheia, e você recebe os lembretes.</p>
      <div className="mt-3 space-y-2">
        {STEPS.map((s) => (
          <details key={s.id} open={s.id === mine} className="rounded-field border-2 border-line px-4 py-2">
            <summary className="min-h-8 cursor-pointer font-semibold">{s.title}</summary>
            <ol className="mt-1 mb-1 list-decimal space-y-1 pl-5">
              {s.steps.map((t) => <li key={t}>{t}</li>)}
            </ol>
          </details>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canPrompt && <Button onClick={install}>Instalar agora</Button>}
        <Button variant="secondary" onClick={answer}>Já fiz isso</Button>
      </div>
    </section>
  )
}
