-- join_movement: dois toques rápidos (ou duas abas) não criam dois desafios do mesmo movimento.
-- A trava é por pessoa + movimento e dura só a transação; o resto da regra é a mesma de antes
-- (create_challenge continua validando has_access e o limite de desafios).
create or replace function public.join_movement(p_slug text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m movements%rowtype;
  cid uuid;
begin
  if uid is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;

  select * into m from movements where slug = p_slug and is_active;
  if not found then raise exception 'Movimento não encontrado'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || m.id::text, 0));

  -- Já participa (como dona ou por convite): devolve o mesmo desafio, mesmo depois do fim do movimento.
  select c.id into cid
    from challenges c join challenge_members cm on cm.challenge_id = c.id and cm.user_id = uid
   where c.movement_id = m.id
   order by (c.status = 'archived'), c.created_at
   limit 1;
  if found then return cid; end if;

  if m.ends_at is not null and m.ends_at < now() then raise exception 'Este movimento já terminou'; end if;

  return create_challenge(m.title, m.blocks, m.mode, p_name, m.id);
end $$;
