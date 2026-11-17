-- Rankings passam a contar o saldo inicial do "Já comecei": quem já começou entra com o que já tinha.
-- Conta só a parte que virou blocos (centavos para baixo); o valor exato declarado continua visível só para o dono.
-- Sequência, conquistas e lembretes de hábito continuam lendo só block_marks.

-- Ranking dos movimentos: % do desafio = marcações + blocos do saldo inicial. Resto igual a 20261028200000.
create or replace function public.movement_ranking(p_slug text)
returns table (display_name text, pct numeric, "position" int)
language sql stable security definer set search_path = public as $$
  with t as (
    select (select array_agg(case
                               when cm.role = 'owner' or n.name !~ '\s' then n.name
                               else substring(n.name from '^\S+') || ' ' || upper(left(substring(n.name from '\S+$'), 1)) || '.'
                             end order by cm.joined_at)
              from challenge_members cm
              join profiles p on p.id = cm.user_id and p.show_in_rankings
             cross join lateral (select coalesce(nullif(trim(cm.display_name), ''), 'Participante') as name) n
             where cm.challenge_id = c.id) as names,
           round(100.0 * (coalesce((select sum(b.block) from block_marks b where b.challenge_id = c.id), 0)
                          + coalesce((select sum(x) from challenge_initial_balances i, unnest(i.blocks) x
                                       where i.challenge_id = c.id), 0))
                 / (c.blocks * (c.blocks + 1) / 2.0), 1) as pct
      from movements m
      join challenges c on c.movement_id = m.id and c.status <> 'archived'
     where m.slug = p_slug
  )
  select case cardinality(t.names)
           when 1 then t.names[1]
           else array_to_string(t.names[1:cardinality(t.names) - 1], ', ') || ' e ' || t.names[cardinality(t.names)]
         end,
         t.pct, (rank() over (order by t.pct desc))::int
    from t
   where cardinality(t.names) > 0
   order by 3 limit 20;
$$;

-- Ranking geral: blocos marcados pela pessoa + blocos do saldo inicial dela. Quem só informou saldo também entra.
create or replace function public.global_ranking()
returns table (display_name text, saved bigint, "position" int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select b.user_id, b.block::bigint as amount from block_marks b
    union all
    select i.user_id, x::bigint
      from challenge_initial_balances i
     cross join unnest(i.blocks) x -- como as marcações: desafio arquivado continua contando
  ), t as (
    select p.id, coalesce(nullif(trim(p.display_name), ''), 'Participante') as display_name,
           sum(s.amount)::bigint as saved
      from profiles p
      join s on s.user_id = p.id
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
