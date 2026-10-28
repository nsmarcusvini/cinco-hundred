import { supabase } from './supabase'

/** Evento de produto. Nunca enviar valores financeiros: só faixas (ex.: months_bucket). */
export function track(name: string, props?: Record<string, unknown>) {
  void supabase.auth.getSession().then(({ data }) =>
    supabase.from('events').insert({ name, props: props ?? null, user_id: data.session?.user.id ?? null }),
  )
}

/** "5-10" anos, para não mandar o prazo exato. */
export function monthsBucket(months: number | null): string {
  if (months === null) return 'nunca'
  const years = months / 12
  if (years <= 5) return '0-5'
  if (years <= 10) return '5-10'
  if (years <= 15) return '10-15'
  return '15+'
}
