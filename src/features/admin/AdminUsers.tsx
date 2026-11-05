import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../../components/ui'
import { ACCESS_LABEL, PAGE_SIZE, fmtAgo, fmtDate, useUsers, type AccessState } from './AdminApi'
import { Empty, LoadError, Loading } from './AdminCharts'

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block min-h-11 rounded-field border-2 border-line bg-transparent px-3 text-base text-ink"
      >
        {children}
      </select>
    </label>
  )
}

export default function AdminUsers() {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => params.get(key) ?? ''
  const set = (changes: Record<string, string>) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(changes)) {
        if (v) p.set(k, v)
        else p.delete(k)
      }
      if (!('pagina' in changes)) p.delete('pagina')
      return p
    }, { replace: true })

  const page = Math.max(1, Number(get('pagina')) || 1)
  const [typed, setTyped] = useState(get('busca'))
  useEffect(() => {
    if (typed === get('busca')) return
    const t = setTimeout(() => set({ busca: typed }), 300)
    return () => clearTimeout(t)
  })

  const { data, isPending, isError, refetch } = useUsers({
    search: get('busca'),
    access: get('acesso'),
    onboarding: get('onboarding'),
    activity: get('atividade'),
    source: get('origem'),
    sort: get('ordem'),
    page,
  })
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <h1 className="text-xl font-bold">Usuários</h1>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1 text-xs text-muted">
          Buscar por nome ou e-mail
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-field border-2 border-line bg-transparent px-3 text-base text-ink outline-none focus:border-forest"
          />
        </label>
        <Select label="Acesso" value={get('acesso')} onChange={(v) => set({ acesso: v })}>
          <option value="">Todos</option>
          {Object.entries(ACCESS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select label="Onboarding" value={get('onboarding')} onChange={(v) => set({ onboarding: v })}>
          <option value="">Todos</option>
          <option value="concluido">Concluído</option>
          <option value="parado">Parado no meio</option>
        </Select>
        <Select label="Atividade" value={get('atividade')} onChange={(v) => set({ atividade: v })}>
          <option value="">Todas</option>
          <option value="ativo7">Ativas em 7 dias</option>
          <option value="ativo30">Ativas em 30 dias</option>
          <option value="inativo30">Sumiram há 30 dias</option>
        </Select>
        {!!data?.sources.length && (
          <Select label="Origem" value={get('origem')} onChange={(v) => set({ origem: v })}>
            <option value="">Todas</option>
            {data.sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
        <Select label="Ordem" value={get('ordem')} onChange={(v) => set({ ordem: v })}>
          <option value="">Cadastro mais recente</option>
          <option value="ultimo_acesso">Último acesso</option>
        </Select>
      </div>

      {isPending ? <Loading /> : isError ? <LoadError onRetry={() => void refetch()} /> : (
        <>
          <p className="mt-6 text-xs text-muted"><span className="num">{total}</span> {total === 1 ? 'pessoa' : 'pessoas'}</p>
          {data.rows.length === 0 ? (
            <div className="mt-3"><Empty>Ninguém com esses filtros. Tire um filtro ou mude a busca.</Empty></div>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="text-xs text-muted">
                  <tr className="border-b-2 border-ink/70">
                    <th scope="col" className="py-2 pr-4 font-normal">Pessoa</th>
                    <th scope="col" className="py-2 pr-4 font-normal">Acesso</th>
                    <th scope="col" className="hidden py-2 pr-4 font-normal md:table-cell">Onboarding</th>
                    <th scope="col" className="hidden py-2 pr-4 text-right font-normal md:table-cell">Blocos</th>
                    <th scope="col" className="hidden py-2 pr-4 font-normal lg:table-cell">Cadastro</th>
                    <th scope="col" className="py-2 font-normal">Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((u) => (
                    <tr key={u.id} className="border-b border-line">
                      <td className="max-w-[260px] py-2 pr-4">
                        <Link to={`/admin/usuarios/${u.id}`} className="block truncate font-semibold text-forest underline-offset-4 hover:underline">
                          {u.display_name || u.email || 'Sem nome'}
                        </Link>
                        <span className="block truncate text-xs text-muted">{u.email}</span>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <AccessBadge access={u.access} />
                        {u.banned && <span className="block text-xs font-semibold text-danger">Bloqueada</span>}
                      </td>
                      <td className="hidden py-2 pr-4 whitespace-nowrap md:table-cell">
                        {u.onboarding_done ? 'Concluído' : <>Parou no passo <span className="num">{u.onboarding_step}</span></>}
                      </td>
                      <td className="num hidden py-2 pr-4 text-right md:table-cell">{u.blocks_marked}</td>
                      <td className="hidden py-2 pr-4 whitespace-nowrap lg:table-cell">{fmtDate(u.created_at)}</td>
                      <td className="py-2 whitespace-nowrap">{fmtAgo(u.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="mt-4 flex items-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => set({ pagina: String(page - 1) })}>Anterior</Button>
              <span className="text-xs text-muted">Página <span className="num">{page}</span> de <span className="num">{pages}</span></span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => set({ pagina: String(page + 1) })}>Próxima</Button>
            </div>
          )}
        </>
      )}
    </>
  )
}

/** Sempre com texto: a cor só reforça. */
export function AccessBadge({ access }: { access: AccessState }) {
  const ok = access === 'assinante' || access === 'pago' || access === 'cortesia' || access === 'com_acesso' || access === 'teste'
  const bad = access === 'atrasado' || access === 'contestado'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`inline-block size-2.5 rounded-[3px] ${ok ? 'bg-leaf' : bad ? 'bg-danger' : 'bg-line'}`} />
      {ACCESS_LABEL[access]}
    </span>
  )
}
