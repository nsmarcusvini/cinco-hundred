-- Notificações: fila de eventos (preenchida por triggers) + cron de 1 minuto que chama a Edge Function
-- send-notifications. Lembretes agendados (salário, diário, sequência...) são calculados na própria função.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.notification_queue (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('friend_marked', 'friend_joined', 'milestone', 'access_granted')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index on public.notification_queue (processed_at) where processed_at is null;
alter table public.notification_queue enable row level security; -- sem policy: só service role

-- Segredo do cron gerado aqui dentro: nunca sai do banco.
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'cron_secret');

create function public.check_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- Marcação: avisa os outros membros e todos quando o grupo cruza 25/50/75/100%.
create function public.enqueue_mark() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  v_total bigint;
  v_goal numeric;
  v_name text;
  v_pct int;
begin
  select * into c from challenges where id = new.challenge_id;
  v_goal := c.blocks * (c.blocks + 1) / 2.0;
  select coalesce(sum(block), 0) into v_total from block_marks where challenge_id = c.id;
  select max(m) into v_pct from unnest(array[25, 50, 75, 100]) m
   where (v_total - new.block) * 100 < m * v_goal and v_total * 100 >= m * v_goal;

  if v_pct is not null then
    insert into notification_queue (user_id, kind, payload)
    select user_id, 'milestone', jsonb_build_object('challenge_id', c.id, 'title', c.title, 'pct', v_pct, 'group', c.type <> 'solo')
      from challenge_members where challenge_id = c.id;
  end if;

  if c.type <> 'solo' then
    select display_name into v_name from challenge_members where challenge_id = c.id and user_id = new.user_id;
    insert into notification_queue (user_id, kind, payload)
    select user_id, 'friend_marked', jsonb_build_object('challenge_id', c.id, 'title', c.title, 'name', v_name, 'amount', new.block)
      from challenge_members where challenge_id = c.id and user_id <> new.user_id;
  end if;
  return null;
end $$;

create trigger block_marks_notify after insert on public.block_marks
  for each row execute function public.enqueue_mark();

create function public.enqueue_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' then
    insert into notification_queue (user_id, kind, payload)
    select owner_id, 'friend_joined', jsonb_build_object('challenge_id', id, 'title', title, 'name', new.display_name)
      from challenges where id = new.challenge_id;
  end if;
  return null;
end $$;

create trigger challenge_members_notify after insert on public.challenge_members
  for each row execute function public.enqueue_member();

create function public.enqueue_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.has_access and not old.has_access then
    insert into notification_queue (user_id, kind) values (new.id, 'access_granted');
  end if;
  return null;
end $$;

create trigger profiles_access_notify after update of has_access on public.profiles
  for each row execute function public.enqueue_access();

revoke execute on function public.enqueue_mark(), public.enqueue_member(), public.enqueue_access()
  from public, anon, authenticated;

-- A cada minuto: processa a fila; a cada 15 min a função também calcula os lembretes agendados.
-- A URL do projeto fica no Vault ('project_url'), criada no setup (ver README).
select cron.schedule('send-notifications', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$$);
