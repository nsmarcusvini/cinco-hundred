-- Funções, triggers, RLS e Realtime.

-- Novas funções não ficam executáveis por anon por padrão.
alter default privileges in schema public revoke execute on functions from public, anon;

------------------------------------------------------------------ helpers

create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenge_members where challenge_id = cid and user_id = auth.uid());
$$;

create function public.can_create_plan() returns boolean
language sql stable security definer set search_path = public as $$
  -- Grátis: refazer o plano 1x a cada 30 dias. Com acesso: quando quiser.
  select coalesce((select has_access from profiles where id = auth.uid()), false)
      or not exists (select 1 from savings_plans
                     where user_id = auth.uid() and created_at > now() - interval '30 days');
$$;

------------------------------------------------------------------ triggers

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email,
          nullif(left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 40), ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- O usuário não altera acesso nem e-mail pelo próprio profile.
create function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.has_access is distinct from old.has_access
    or new.access_granted_at is distinct from old.access_granted_at
    or new.email is distinct from old.email
    or new.created_at is distinct from old.created_at) then
    raise exception 'Campo protegido' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- has_access = existe compra paga. Reembolso ou disputa revoga.
create function public.sync_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paid boolean;
begin
  if new.user_id is null then return null; end if;
  v_paid := exists (select 1 from purchases where user_id = new.user_id and status = 'paid');
  update profiles
     set has_access = v_paid,
         access_granted_at = case when v_paid then coalesce(access_granted_at, now()) end
   where id = new.user_id;
  return null;
end $$;

create trigger purchases_sync_access after insert or update on public.purchases
  for each row execute function public.sync_access();

-- Marca o desafio como concluído no último bloco (e reabre se desmarcar).
create function public.check_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update challenges c set status = 'completed', completed_at = now()
     where c.id = new.challenge_id and c.status = 'active'
       and (select count(*) from block_marks where challenge_id = c.id) = c.blocks;
    return null;
  end if;
  update challenges set status = 'active', completed_at = null
   where id = old.challenge_id and status = 'completed';
  return null;
end $$;

create trigger block_marks_completion after insert or delete on public.block_marks
  for each row execute function public.check_completion();

------------------------------------------------------------------ RPCs

create function public.create_challenge(p_title text, p_blocks int, p_type text, p_name text,
                                        p_movement_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_trial int;
  cid uuid;
begin
  if uid is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;

  if not coalesce((select has_access from profiles where id = uid), false) then
    v_trial := coalesce((select (value)::int from app_settings where key = 'free_trial_blocks'), 0);
    if v_trial = 0 or p_blocks <> v_trial or exists (select 1 from challenges where owner_id = uid) then
      raise exception 'Acesso necessário' using errcode = '42501';
    end if;
  end if;

  if (select count(*) from challenges where owner_id = uid and status <> 'archived') >= 20 then
    raise exception 'Limite de 20 desafios atingido';
  end if;

  if p_movement_id is not null and not exists (select 1 from movements where id = p_movement_id and is_active) then
    raise exception 'Movimento não encontrado';
  end if;

  insert into challenges (owner_id, movement_id, title, blocks, type)
  values (uid, p_movement_id, trim(p_title), p_blocks, p_type)
  returning id into cid;

  insert into challenge_members (challenge_id, user_id, display_name, color, role)
  values (cid, uid, left(trim(p_name), 40), '#12a150', 'owner');

  return cid;
end $$;

create function public.join_challenge(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c challenges%rowtype;
  v_max int;
  v_color text;
begin
  if uid is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;

  if (select count(*) from invite_attempts where user_id = uid and at > now() - interval '1 hour') >= 20 then
    raise exception 'Muitas tentativas. Tente de novo em uma hora';
  end if;
  insert into invite_attempts (user_id) values (uid);

  -- Código inválido retorna null (sem exceção, para a tentativa continuar contando).
  select * into c from challenges where invite_code = upper(trim(p_code)) for update;
  if not found then return null; end if;

  if exists (select 1 from challenge_members where challenge_id = c.id and user_id = uid) then
    return c.id;
  end if;

  if not coalesce((select has_access from profiles where id = uid), false) then
    raise exception 'Acesso necessário' using errcode = '42501';
  end if;
  if c.type = 'solo' then raise exception 'Este desafio é individual'; end if;
  if c.status = 'archived' then raise exception 'Este desafio foi arquivado'; end if;
  v_max := case c.type when 'duo' then 2 else 8 end;
  if (select count(*) from challenge_members where challenge_id = c.id) >= v_max then
    raise exception 'Este desafio já está completo';
  end if;

  select col into v_color
    from unnest(array['#12a150','#2563eb','#db2777','#ea580c','#7c3aed','#0891b2','#ca8a04','#dc2626'])
         with ordinality as p(col, i)
   where col not in (select color from challenge_members where challenge_id = c.id)
   order by i limit 1;

  insert into challenge_members (challenge_id, user_id, display_name, color)
  values (c.id, uid, left(trim(p_name), 40), v_color);

  return c.id;
end $$;

create function public.join_movement(p_slug text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m movements%rowtype;
  cid uuid;
begin
  if uid is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;

  select * into m from movements where slug = p_slug and is_active;
  if not found then raise exception 'Movimento não encontrado'; end if;
  if m.ends_at is not null and m.ends_at < now() then raise exception 'Este movimento já terminou'; end if;

  select c.id into cid
    from challenges c join challenge_members cm on cm.challenge_id = c.id and cm.user_id = uid
   where c.movement_id = m.id
   limit 1;
  if found then return cid; end if;

  -- create_challenge valida o acesso e o limite de desafios.
  return create_challenge(m.title, m.blocks, m.mode, p_name, m.id);
end $$;

create function public.rename_challenge(p_id uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update challenges set title = trim(p_title) where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'Só o dono pode renomear' using errcode = '42501'; end if;
end $$;

-- Troca o plano ativo de forma atômica. Roda com as permissões do usuário (RLS vale).
create function public.save_plan(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare pid uuid;
begin
  update savings_plans set is_active = false where user_id = auth.uid() and is_active;
  insert into savings_plans (user_id, scenario, goal, monthly_amount, start_balance, months_estimated,
                             months_with_yield, yield_rate_monthly, target_date, recommended_blocks,
                             ladder, status, inputs_snapshot)
  select auth.uid(), r.scenario, coalesce(r.goal, 125250), r.monthly_amount, coalesce(r.start_balance, 0),
         r.months_estimated, r.months_with_yield, r.yield_rate_monthly, r.target_date, r.recommended_blocks,
         r.ladder, r.status, r.inputs_snapshot
    from jsonb_populate_record(null::savings_plans, p) r
  returning id into pid;
  return pid;
end $$;

-- Públicas (páginas de convite e movimento abrem sem login). Nunca expõem valores em R$ de terceiros.
create function public.invite_preview(p_code text)
returns table (title text, blocks int, type text, owner_name text, members int)
language sql stable security definer set search_path = public as $$
  select c.title, c.blocks, c.type,
         (select display_name from challenge_members where challenge_id = c.id and role = 'owner'),
         (select count(*)::int from challenge_members where challenge_id = c.id)
    from challenges c
   where c.invite_code = upper(trim(p_code)) and c.status <> 'archived';
$$;

create function public.movement_participants(p_slug text)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct cm.user_id)::int
    from movements m
    join challenges c on c.movement_id = m.id
    join challenge_members cm on cm.challenge_id = c.id
   where m.slug = p_slug;
$$;

create function public.movement_ranking(p_slug text)
returns table (display_name text, pct numeric, "position" int)
language sql stable security definer set search_path = public as $$
  with t as (
    select coalesce(p.display_name, 'Participante') as display_name,
           round(100.0 * coalesce((select sum(b.block) from block_marks b where b.challenge_id = c.id), 0)
                 / (c.blocks * (c.blocks + 1) / 2.0), 1) as pct
      from movements m
      join challenges c on c.movement_id = m.id and c.status <> 'archived'
      join profiles p on p.id = c.owner_id and p.show_in_rankings
     where m.slug = p_slug
  )
  select t.display_name, t.pct, (rank() over (order by t.pct desc))::int
    from t order by 3 limit 20;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.invite_preview(text), public.movement_participants(text),
                          public.movement_ranking(text) to anon;

------------------------------------------------------------------ RLS

create policy "own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Dados financeiros: só o próprio usuário. Nenhuma função de grupo/ranking lê estas tabelas.
create policy "own financial profile" on public.financial_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own expenses" on public.expenses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own plans" on public.savings_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy "create plan" on public.savings_plans for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_create_plan()));
create policy "update own plans" on public.savings_plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own plans" on public.savings_plans for delete to authenticated
  using (user_id = (select auth.uid()));
grant execute on function public.can_create_plan() to authenticated;

create policy "own purchases" on public.purchases for select to authenticated
  using (user_id = (select auth.uid()));

create policy "active movements" on public.movements for select to anon, authenticated
  using (is_active);

create policy "members read challenge" on public.challenges for select to authenticated
  using (public.is_member(id));
create policy "owner deletes challenge" on public.challenges for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "members read members" on public.challenge_members for select to authenticated
  using (public.is_member(challenge_id));
create policy "leave group" on public.challenge_members for delete to authenticated
  using (user_id = (select auth.uid()) and role = 'member');

create policy "members read marks" on public.block_marks for select to authenticated
  using (public.is_member(challenge_id));
create policy "member marks block" on public.block_marks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member(challenge_id)
    and block <= (select c.blocks from public.challenges c where c.id = challenge_id and c.status <> 'archived')
  );
create policy "unmark own block" on public.block_marks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "log events" on public.events for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

create policy "read settings" on public.app_settings for select to anon, authenticated
  using (true);

-- stripe_events, notifications_log, invite_attempts: sem policy, só service role.

------------------------------------------------------------------ Realtime

alter table public.block_marks replica identity full;
alter publication supabase_realtime add table public.block_marks, public.challenge_members, public.profiles;
