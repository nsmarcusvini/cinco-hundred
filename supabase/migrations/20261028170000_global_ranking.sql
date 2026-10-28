-- Ranking global por valor guardado. Mostra valores (o ranking dos movimentos mostra só %),
-- então tem consentimento próprio, desligado por padrão: só aparece quem escolheu aparecer.
alter table public.profiles add column show_in_global_ranking boolean not null default false;

-- Top 50 de quem aceitou aparecer, mais a linha do próprio usuário se ele estiver fora do top.
-- Expõe só o nome de exibição e a soma dos blocos marcados (nunca renda, gastos ou plano).
create function public.global_ranking()
returns table (display_name text, saved bigint, "position" int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with t as (
    select p.id, coalesce(nullif(trim(p.display_name), ''), 'Participante') as display_name,
           sum(b.block)::bigint as saved
      from profiles p
      join block_marks b on b.user_id = p.id
     where p.show_in_global_ranking
     group by p.id
  ), r as (
    select t.*, (rank() over (order by t.saved desc))::int as pos from t
  )
  select r.display_name, r.saved, r.pos, r.id = (select auth.uid())
    from r
   where r.pos <= 50 or r.id = (select auth.uid())
   order by r.pos, r.display_name;
$$;

revoke execute on function public.global_ranking() from public, anon;
grant execute on function public.global_ranking() to authenticated;
