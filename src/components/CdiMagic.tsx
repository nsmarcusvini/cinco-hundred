import { CDI_ANNUAL, CDI_REFERENCE, cdiEarnings, formatCents, formatRate } from '../lib/cdi'
import { formatBRL } from '../lib/format'

const LEVELS = [10_000, 50_000, 100_000, 125_250]
const MAX = cdiEarnings(LEVELS[LEVELS.length - 1]).perDay

/** "A mágica dos R$ 100 mil": quanto o dinheiro guardado rende sozinho por dia a 100% do CDI. */
export function CdiMagic() {
  const hundred = cdiEarnings(100_000)
  return (
    <section aria-labelledby="cdi-magic" className="rounded-field bg-forest p-5 text-cream">
      <h2 id="cdi-magic" className="text-lg font-bold">A mágica dos primeiros <span className="whitespace-nowrap">R$ 100 mil</span></h2>
      <p className="mt-2 text-cream/85">
        Juntar os primeiros R$ 100 mil é a parte mais difícil. Depois deles, o dinheiro passa a trabalhar junto com você.
      </p>
      <p className="mt-4">
        <span className="num block text-4xl font-extrabold text-gold">{formatCents(hundred.perDay)}</span>
        <span className="text-cream/85">
          por dia útil é quanto R$ 100 mil rendem a 100% do CDI. São{' '}
          <strong className="num text-cream">{formatBRL(hundred.perMonth)}</strong> por mês sem você guardar mais nada.
        </span>
      </p>
      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Rendimento por dia útil a 100% do CDI</caption>
        <thead className="sr-only">
          <tr><th scope="col">Guardado</th><th scope="col">Rende por dia útil</th></tr>
        </thead>
        <tbody>
          {LEVELS.map((v) => {
            const day = cdiEarnings(v).perDay
            const key = v === 100_000
            return (
              <tr key={v} className={key ? 'font-bold' : 'text-cream/85'}>
                <th scope="row" className="num w-24 py-1 pr-3 text-left font-[inherit]">{formatBRL(v)}</th>
                <td className="py-1">
                  <span className="flex items-center gap-3">
                    <span className="h-2 flex-1 overflow-hidden rounded-[3px] bg-cream/15">
                      <span className={`block h-full ${key ? 'bg-gold' : 'bg-leaf'}`} style={{ width: `${(day / MAX) * 100}%` }} />
                    </span>
                    <span className="num w-20 text-right">{formatCents(day)}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-cream/70">
        Estimativa bruta (antes do imposto de renda) com o CDI de {formatRate(CDI_ANNUAL)} ao ano, referência de{' '}
        {CDI_REFERENCE}. A taxa muda com o tempo. Não é garantia nem recomendação de investimento.
      </p>
    </section>
  )
}
