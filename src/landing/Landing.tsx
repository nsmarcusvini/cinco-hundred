import { StrictMode, useEffect, useRef, useState } from 'react'
import './landing.css'

// Landing standalone: sem router, sem supabase-js (orçamento de 90 KB). Links são <a> normais para o app.

const N = 500
const GOAL = 125250
const brl = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')

/** Ordem em que os blocos se marcam ao rolar: embaralhada e fixa (seed), como alguém marcando na vida real. */
const ORDER = (() => {
  let s = 500
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const xs = Array.from({ length: N }, (_, i) => i + 1)
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
})()
const PREFIX = ORDER.reduce<number[]>((acc, b) => (acc.push((acc.at(-1) ?? 0) + b), acc), [])

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

interface Movement {
  slug: string
  title: string
  starts_at: string | null
  participants: number
}

export default function Landing() {
  return (
    <StrictMode>
      <div className="landing min-h-dvh">
        <div className="landing-shell">
          <Placar />
          <main>
            <Hero />
            <HowItWorks />
            <Duo />
            <Movements />
            <Price />
            <Faq />
            <Final />
            <Footer />
          </main>
        </div>
      </div>
    </StrictMode>
  )
}

/** O placar: marca blocos conforme a rolagem e soma exatamente os marcados. */
function Placar() {
  const grid = useRef<HTMLDivElement>(null)
  const counter = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const cells = Array.from(grid.current!.children) as HTMLElement[]
    let shown = 0
    let frame = 0
    const render = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - innerHeight
      const p = max > 0 ? Math.min(1, scrollY / max) : 1
      const n = Math.round(p * N)
      if (n === shown) return
      // Atualiza só os blocos que mudaram.
      for (let i = Math.min(n, shown); i < Math.max(n, shown); i++) cells[ORDER[i] - 1].classList.toggle('on', i < n)
      cells[ORDER[N - 1] - 1].classList.toggle('last', n === N)
      shown = n
      counter.current!.textContent = brl(n ? PREFIX[n - 1] : 0)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }
    render()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <aside className="placar px-4 lg:px-10" aria-label="Placar: quanto você juntaria marcando os blocos">
      <div className="flex items-baseline justify-between gap-4 pt-3 lg:block lg:pt-0">
        <a href="/" className="display text-lg lg:text-xl" aria-label="Cinco Hundred, início">Cinco Hundred</a>
        <p className="text-right lg:mt-10 lg:text-left">
          <span ref={counter} className="num display block text-2xl lg:text-6xl" aria-live="off">R$ 0</span>
          <span className="block text-xs text-muted lg:mt-2 lg:text-sm">de {brl(GOAL)}</span>
        </p>
      </div>
      <div ref={grid} className="placar-grid mt-2 lg:mt-8" aria-hidden>
        {Array.from({ length: N }, (_, i) => <span key={i} />)}
      </div>
      <p className="mt-6 hidden text-sm text-muted lg:block">Role a página: cada trecho marca blocos.</p>
    </aside>
  )
}

function Cta({ className = '' }: { className?: string }) {
  return (
    <a href="/entrar" className={`cta inline-flex min-h-14 items-center rounded-field bg-forest px-7 text-lg font-semibold text-cream ${className}`}>
      Começar meu plano
    </a>
  )
}

function Hero() {
  return (
    <section className="px-4 pt-12 pb-20 sm:px-8 lg:px-16 lg:pt-28 lg:pb-32">
      <h1 className="display text-[clamp(3.25rem,13vw,8.5rem)]">
        Junte <span className="whitespace-nowrap">R$ 125.250</span>
        <br />
        bloco a bloco
      </h1>
      <p className="mt-8 max-w-[34rem] text-lg leading-relaxed sm:text-xl">
        Um painel com 500 blocos numerados. Guardou R$ 37? Marque o bloco 37. Quando a grade fechar, você juntou
        R$ 125.250.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Cta />
        <span className="text-muted">R$ 10 vitalício, sem mensalidade</span>
      </div>
      <p className="mt-10 max-w-[34rem] border-l-2 border-gold pl-4 text-sm text-muted">
        O app não movimenta dinheiro: ele acompanha o que você guarda na sua conta ou no seu investimento.
      </p>
    </section>
  )
}

const STEPS = [
  { title: 'Monte seu plano', body: 'Conte sua renda e seus gastos. Em 2 minutos o app mostra quanto você consegue guardar por mês e quando chega lá.' },
  { title: 'Guarde do seu jeito', body: 'O dinheiro fica na sua conta ou no seu investimento. O app não encosta nele.' },
  { title: 'Marque o bloco', body: 'Guardou R$ 300? O app sugere quais blocos somam esse valor. Um toque e está marcado.' },
]

function HowItWorks() {
  return (
    <section className="px-4 py-20 sm:px-8 lg:px-16 lg:py-32">
      <h2 className="display text-[clamp(2.25rem,7vw,4.25rem)]">Como funciona</h2>
      <ol className="mt-12 space-y-14">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[auto_1fr] items-start gap-x-6 sm:gap-x-10">
            <span className="step-n num" aria-hidden>{i + 1}</span>
            <div className="pt-1">
              <h3 className="text-2xl font-bold">{s.title}</h3>
              <p className="mt-2 max-w-[30rem] text-lg leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Duo() {
  // Mini grade com as duas cores, como aparece no app.
  const cells = Array.from({ length: 60 }, (_, i) => (i * 37) % 60)
  return (
    <section className="bg-forest px-4 py-20 text-cream sm:px-8 lg:px-16 lg:py-32">
      <h2 className="display text-[clamp(2.25rem,7vw,4.25rem)]">Junte com alguém</h2>
      <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-cream/85">
        Chame quem divide a vida com você. Cada um guarda na própria conta, a grade é uma só e cada pessoa marca
        com a sua cor. Com duas pessoas guardando o mesmo valor, o prazo cai pela metade.
      </p>
      <div className="mt-10 grid max-w-md grid-cols-12 gap-1.5" aria-hidden>
        {cells.map((v, i) => (
          <span key={i} className="aspect-square rounded-[3px]"
            style={{ background: v < 22 ? '#12a150' : v < 38 ? '#2563eb' : 'rgb(244 241 232 / 0.14)' }} />
        ))}
      </div>
      <p className="mt-4 flex gap-5 text-sm text-cream/80">
        <span className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-leaf" />Você</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-[#2563eb]" />Quem você chamou</span>
      </p>
    </section>
  )
}

function Movements() {
  const [list, setList] = useState<Movement[] | null>(null)

  useEffect(() => {
    const headers = { apikey: KEY, 'Content-Type': 'application/json' }
    void (async () => {
      try {
        const movements: Omit<Movement, 'participants'>[] = await fetch(
          `${SUPABASE_URL}/rest/v1/movements?select=slug,title,starts_at&order=starts_at`, { headers },
        ).then((r) => r.json())
        const counts = await Promise.all(movements.map((m) =>
          fetch(`${SUPABASE_URL}/rest/v1/rpc/movement_participants`, { method: 'POST', headers, body: JSON.stringify({ p_slug: m.slug }) })
            .then((r) => r.json() as Promise<number>)))
        setList(movements.map((m, i) => ({ ...m, participants: counts[i] })))
      } catch {
        setList([])
      }
    })()
  }, [])

  if (list?.length === 0) return null
  return (
    <section className="px-4 py-20 sm:px-8 lg:px-16 lg:py-32">
      <h2 className="display text-[clamp(2.25rem,7vw,4.25rem)]">Movimentos</h2>
      <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-muted">
        Desafios com data para começar, todo mundo junto. O ranking é por porcentagem, nunca por valor.
      </p>
      <ul className="mt-10 divide-y divide-[var(--hair)] border-y border-[var(--hair)]">
        {(list ?? Array.from({ length: 3 }, () => null)).map((m, i) => (
          <li key={m?.slug ?? i}>
            {m ? (
              <a href={`/m/${m.slug}`} className="group flex min-h-20 items-center gap-4 py-4">
                <span className="flex-1">
                  <span className="block text-xl font-bold group-hover:underline">{m.title}</span>
                  <span className="text-muted">
                    <span className="num">{m.participants.toLocaleString('pt-BR')}</span>{' '}
                    {m.participants === 1 ? 'pessoa participando' : 'pessoas participando'}
                    {m.starts_at && new Date(m.starts_at) > new Date() &&
                      `, começa ${new Date(m.starts_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`}
                  </span>
                </span>
                <span aria-hidden className="text-2xl text-forest transition-transform duration-200 group-hover:translate-x-1">›</span>
              </a>
            ) : (
              <div className="min-h-20 py-4" aria-hidden><div className="h-6 w-2/3 rounded-block bg-line/60" /></div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const INCLUDED = [
  'Até 20 desafios, de 10 a 1000 blocos',
  'Desafios em dupla ou grupo, com até 8 pessoas',
  'Movimentos com ranking',
  'Lembretes no dia do salário',
  'Card de progresso para os stories',
]

function Price() {
  return (
    <section className="px-4 py-20 sm:px-8 lg:px-16 lg:py-32">
      <p className="display text-[clamp(5rem,22vw,11rem)] text-forest">
        R$ <span className="relative">10<span className="absolute -right-5 top-[0.12em] size-4 rounded-[3px] bg-gold sm:-right-7 sm:size-5" aria-hidden /></span>
      </p>
      <p className="mt-4 text-2xl font-bold">R$ 10 vitalício, sem mensalidade</p>
      <p className="mt-3 max-w-[32rem] text-lg leading-relaxed text-muted">
        Cadastro e plano personalizado são grátis. Você só paga uma vez para começar os desafios.
      </p>
      <ul className="mt-8 space-y-3">
        {INCLUDED.map((t) => (
          <li key={t} className="flex gap-3 text-lg"><span className="mt-2 size-3 shrink-0 rounded-[3px] bg-leaf" aria-hidden />{t}</li>
        ))}
      </ul>
      <Cta className="mt-10" />
    </section>
  )
}

const FAQ = [
  { q: 'O app guarda meu dinheiro?', a: 'Não. Ele é só o painel: o dinheiro fica na sua conta ou no seu investimento, com você.' },
  { q: 'Por que R$ 125.250?', a: 'É a soma de 1 a 500. Cada bloco vale o seu número em reais, então a grade completa dá R$ 125.250.' },
  { q: 'E se eu não conseguir guardar tanto?', a: 'O plano calcula um valor que cabe na sua renda e sugere começar pelo desafio de 100 ou de 250 blocos.' },
  { q: 'Alguém vê minha renda e meus gastos?', a: 'Não. Só você vê seus dados financeiros, e pode apagar quando quiser. Nem quem participa do seu grupo vê.' },
  { q: 'Posso pedir reembolso?', a: 'Pode. Você tem 7 dias depois da compra para desistir e receber o valor de volta.' },
  { q: 'Funciona no iPhone?', a: 'Funciona. É um app web: no iPhone, adicione à tela de início para receber os lembretes.' },
]

function Faq() {
  return (
    <section className="px-4 py-20 sm:px-8 lg:px-16 lg:py-32">
      <h2 className="display text-[clamp(2.25rem,7vw,4.25rem)]">Perguntas</h2>
      <div className="mt-10 border-t border-[var(--hair)]">
        {FAQ.map((f) => (
          <details key={f.q} className="border-b border-[var(--hair)]">
            <summary className="flex min-h-16 items-center gap-4 py-4 text-xl font-bold">
              <span className="flex-1">{f.q}</span>
              <span className="plus text-2xl text-forest" aria-hidden>+</span>
            </summary>
            <p className="max-w-[34rem] pb-6 text-lg leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function Final() {
  return (
    <section className="px-4 py-24 sm:px-8 lg:px-16 lg:py-40">
      <p className="display text-[clamp(3rem,12vw,7.5rem)]">R$ 125.250.</p>
      <p className="mt-6 max-w-[32rem] text-xl leading-relaxed">
        Aqui foi só rolar a página. Na vida real leva mais tempo, e o app te acompanha bloco a bloco.
      </p>
      <Cta className="mt-10" />
    </section>
  )
}

function Footer() {
  return (
    <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--hair)] px-4 py-8 text-sm text-muted sm:px-8 lg:px-16">
      <span>© Cinco Hundred. Não somos instituição financeira.</span>
      <a href="/termos" className="underline">Termos</a>
      <a href="/privacidade" className="underline">Privacidade</a>
    </footer>
  )
}
