-- Ranking dos movimentos: desafios em dupla ou grupo mostram o nome de todos os participantes
-- ("Ana e Léo"), não só o de quem criou. Só entra o nome de quem aceita aparecer nos rankings;
-- o desafio sai do ranking quando ninguém dele aceita.
create or replace function public.movement_ranking(p_slug text)
returns table (display_name text, pct numeric, "position" int)
language sql stable security definer set search_path = public as $$
  with t as (
    select (select array_agg(coalesce(nullif(trim(cm.display_name), ''), 'Participante') order by cm.joined_at)
              from challenge_members cm
              join profiles p on p.id = cm.user_id and p.show_in_rankings
             where cm.challenge_id = c.id) as names,
           round(100.0 * coalesce((select sum(b.block) from block_marks b where b.challenge_id = c.id), 0)
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
