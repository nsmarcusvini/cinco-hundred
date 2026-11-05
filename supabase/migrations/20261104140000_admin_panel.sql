-- Painel administrativo e rastreamento de uso.
--
-- Acesso: tabela admins (sem policy) + verificação em duas etapas. Conceder ou revogar é só por SQL, de propósito:
--   insert into public.admins (user_id, note) select id, 'dono' from auth.users where email = '...';
--   delete from public.admins where user_id = '...';
-- A migration não insere ninguém, para nenhum e-mail ir para o repositório.
--
-- Dados financeiros ficam fora de todas as funções daqui: nada lê financial_profiles, expenses ou savings_plans
-- (só "tem plano", sim ou não), e o progresso é contado em blocos. A soma dos blocos dá o valor guardado, e por isso um
-- percentual sobre a soma revelaria o valor: use sempre a contagem. Notas dos blocos também ficam de fora.

------------------------------------------------------------------ tabelas

create table public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);

create table public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid references auth.users on delete set null,
  action text not null,
  target_user_id uuid references auth.users on delete set null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.admin_audit_log (target_user_id, created_at desc);

-- Sem policy e sem grant: só as funções abaixo (e o service role) enxergam estas tabelas.
alter table public.admins enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on table public.admins, public.admin_audit_log from anon, authenticated;
revoke all on sequence public.admin_audit_log_id_seq from anon, authenticated;

create index on public.events (created_at desc);
create index on public.events (name, created_at desc);
create index on public.events (user_id, created_at desc);
drop index if exists public.events_user_id_idx;

------------------------------------------------------------------ eventos: o que o cliente pode gravar

-- Lista fechada de nomes e de chaves, para a regra "sem dados financeiros nos eventos" valer no servidor e não só por
-- convenção no front. Evento novo no front precisa entrar aqui (o que não está na lista é recusado).
-- O service role fica de fora: access_granted e refund só o webhook grava.
create function public.events_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v_allowed constant jsonb := '{
    "web_vital": ["metric", "value", "rating", "route"],
    "page_view": ["route"],
    "signup": ["saving_with"],
    "onboarding_step": ["step"],
    "onboarding_done": [],
    "onboarding_skipped": [],
    "plan_created": ["scenario", "status", "months_bucket"],
    "challenge_created": ["blocks", "type"],
    "challenge_archived": [],
    "block_marked": ["count", "via"],
    "invite_sent": ["type"],
    "invite_accepted": [],
    "share_card": ["via"],
    "movement_joined": ["slug"],
    "access_offer_view": ["from", "plan"],
    "checkout_started": ["from", "plan"],
    "checkout_canceled": ["from", "plan"],
    "push_enabled": [],
    "tour_done": [],
    "app_installed": [],
    "data_exported": []
  }';
  k text;
  v jsonb;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;

  if not (v_allowed ? new.name) then
    raise exception 'Evento não permitido: %', new.name using errcode = '42501';
  end if;
  -- Sem sessão só existem visita, web vital e cadastro (com confirmação de e-mail ainda não há sessão).
  if current_user = 'anon' and new.name not in ('web_vital', 'page_view', 'signup') then
    raise exception 'Evento não permitido sem login: %', new.name using errcode = '42501';
  end if;

  if new.props is null or new.props = 'null'::jsonb then return new; end if;
  if jsonb_typeof(new.props) <> 'object' or pg_column_size(new.props) > 1024 then
    raise exception 'Propriedades inválidas' using errcode = '23514';
  end if;
  for k, v in select * from jsonb_each(new.props) loop
    if not ((v_allowed -> new.name) ? k) then
      raise exception 'Propriedade não permitida: %', k using errcode = '23514';
    end if;
    if jsonb_typeof(v) not in ('string', 'number', 'boolean', 'null') or char_length(v #>> '{}') > 80 then
      raise exception 'Valor inválido em %', k using errcode = '23514';
    end if;
    if k = 'route' and v #>> '{}' !~ '^/[A-Za-z0-9/_:.-]*$' then
      raise exception 'Rota inválida' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

create trigger events_guard before insert on public.events
  for each row execute function public.events_guard();

-- Web vitals servem só para acompanhar a última leva; o resto do histórico fica 12 meses.
create function public.prune_events() returns void
language sql security definer set search_path = public as $$
  delete from events
   where created_at < now() - interval '12 months'
      or (name = 'web_vital' and created_at < now() - interval '90 days');
$$;

select cron.schedule('prune-events', '17 4 * * *', 'select public.prune_events()');

------------------------------------------------------------------ quem é admin

-- 'none': não é admin. 'mfa': é admin, mas esta sessão não passou pela verificação em duas etapas. 'ok': pode entrar.
-- Responde só sobre quem chama. O aal vem do JWT, assinado pelo Auth.
create function public.admin_status() returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from admins where user_id = auth.uid()) then 'none'
    when auth.jwt() ->> 'aal' = 'aal2' then 'ok'
    else 'mfa'
  end;
$$;

create function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.admin_status() <> 'ok' then
    raise exception 'Acesso restrito' using errcode = '42501';
  end if;
end $$;

------------------------------------------------------------------ status de pagamento (único lugar que interpreta)

-- Assinatura mais relevante da pessoa (a que dá acesso, senão a mais recente). SQL dinâmico para funcionar existindo ou
-- não a tabela subscriptions: esta migration não depende da ordem em que a de assinaturas for aplicada.
create function public.admin_subscription(p_user uuid)
returns table (status text, plan text, trial_end timestamptz, current_period_end timestamptz, cancel_at timestamptz,
               stripe_customer_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.subscriptions') is null then return; end if;
  return query execute
    'select s.status, s.plan, s.trial_end, s.current_period_end, s.cancel_at, s.stripe_customer_id
       from public.subscriptions s where s.user_id = $1
      order by s.status in (''trialing'', ''active'') desc, s.created_at desc limit 1'
    using p_user;
end $$;

-- Cortesia é uma compra de R$ 0 com sessão 'admin_grant:...': assim sync_access continua sendo quem decide has_access.
-- has_access verdadeiro sem origem conhecida cai em 'com_acesso', para uma fonte nova de acesso não sumir do painel.
create function public.admin_access_state(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_has_access boolean;
  v_sub text;
  v_last text;
begin
  select has_access into v_has_access from profiles where id = p_user;
  select s.status into v_sub from public.admin_subscription(p_user) s;

  if v_has_access then
    if v_sub = 'trialing' then return 'teste'; end if;
    if v_sub = 'active' then return 'assinante'; end if;
    if exists (select 1 from purchases where user_id = p_user and status = 'paid'
                 and not coalesce(stripe_checkout_session_id like 'admin_grant:%', false)) then return 'pago'; end if;
    if exists (select 1 from purchases where user_id = p_user and status = 'paid'
                 and stripe_checkout_session_id like 'admin_grant:%') then return 'cortesia'; end if;
    return 'com_acesso';
  end if;

  if v_sub in ('past_due', 'unpaid') then return 'atrasado'; end if;
  if v_sub = 'canceled' then return 'cancelado'; end if;
  if v_sub = 'incomplete' then return 'pendente'; end if;

  select status into v_last from purchases
   where user_id = p_user and not coalesce(stripe_checkout_session_id like 'admin_grant:%', false)
   order by created_at desc limit 1;
  return case v_last when 'refunded' then 'reembolsado' when 'disputed' then 'contestado' when 'pending' then 'pendente'
                     else 'sem_acesso' end;
end $$;

-- Pagou de verdade em algum momento, mesmo que depois tenha cancelado ou reembolsado. Cortesia e teste grátis não contam
-- (invoice_paid só é gravado para fatura com valor; a de R$ 0 que abre o teste fica de fora).
create function public.admin_has_paid(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from purchases
       where user_id = p_user and status in ('paid', 'refunded', 'disputed')
         and not coalesce(stripe_checkout_session_id like 'admin_grant:%', false))
    or exists (select 1 from events where user_id = p_user and name = 'invoice_paid')
    or public.admin_access_state(p_user) in ('assinante', 'com_acesso');
$$;

-- Atividade = evento de uso ou bloco marcado. As contas de admin não entram nas métricas.
create function public.admin_activity(p_since timestamptz)
returns table (user_id uuid, seen_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.user_id, e.created_at
    from events e
   where e.created_at >= p_since and e.user_id is not null and e.name <> 'web_vital'
     and not exists (select 1 from admins a where a.user_id = e.user_id)
  union all
  select b.user_id, b.marked_at
    from block_marks b
   where b.marked_at >= p_since
     and not exists (select 1 from admins a where a.user_id = b.user_id);
$$;

------------------------------------------------------------------ usuários

create function public.admin_users(
  p_search text default null,
  p_access text default null,
  p_onboarding text default null,
  p_activity text default null,
  p_source text default null,
  p_sort text default 'recentes',
  p_limit int default 50,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform public.require_admin();
  v_like := '%' || replace(replace(replace(coalesce(v_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return (
    with base as (
      select p.id, p.email, p.display_name, p.created_at, p.onboarding_done, p.onboarding_step, p.utm_source,
             coalesce(u.banned_until > now(), false) as banned,
             public.admin_access_state(p.id) as access,
             greatest(u.last_sign_in_at, ev.last_at, bm.last_at) as last_seen_at,
             ch.n as challenges,
             bm.n as blocks_marked
        from profiles p
        join auth.users u on u.id = p.id
        left join lateral (select max(e.created_at) as last_at from events e
                            where e.user_id = p.id and e.name <> 'web_vital') ev on true
        left join lateral (select max(b.marked_at) as last_at, count(*)::int as n from block_marks b
                            where b.user_id = p.id) bm on true
        left join lateral (select count(*)::int as n from challenge_members cm
                            where cm.user_id = p.id) ch on true
       where v_search is null or p.email ilike v_like or p.display_name ilike v_like
    ), filtered as (
      select * from base
       where (p_access is null or access = p_access)
         and (p_onboarding is null
              or (p_onboarding = 'concluido' and onboarding_done)
              or (p_onboarding = 'parado' and not onboarding_done))
         and (p_activity is null
              or (p_activity = 'ativo7' and last_seen_at >= now() - interval '7 days')
              or (p_activity = 'ativo30' and last_seen_at >= now() - interval '30 days')
              or (p_activity = 'inativo30' and coalesce(last_seen_at, '-infinity') < now() - interval '30 days'))
         and (p_source is null or utm_source = p_source)
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'sources', (select coalesce(jsonb_agg(distinct utm_source), '[]') from profiles where utm_source is not null),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(r))
          from (select * from filtered
                 order by case when p_sort = 'ultimo_acesso' then last_seen_at end desc nulls last, created_at desc
                 limit v_limit offset greatest(coalesce(p_offset, 0), 0)) r), '[]'))
  );
end $$;

-- Abrir o detalhe fica registrado em admin_audit_log.
-- O histórico traz só nome e data: props de plan_created, por exemplo, dizem se o plano está apertado.
create function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
           'id', p.id, 'email', p.email, 'display_name', p.display_name,
           'city', p.city, 'state', p.state,
           'age', extract(year from age(p.birth_date))::int,
           'created_at', p.created_at, 'timezone', p.timezone,
           'email_confirmed', u.email_confirmed_at is not null,
           'last_sign_in_at', u.last_sign_in_at,
           'banned', coalesce(u.banned_until > now(), false),
           'is_admin', exists (select 1 from admins a where a.user_id = p.id),
           'utm_source', p.utm_source, 'utm_campaign', p.utm_campaign,
           'marketing_opt_in', p.marketing_opt_in,
           'show_in_rankings', p.show_in_rankings,
           'show_in_global_ranking', p.show_in_global_ranking,
           'reminder_enabled', p.reminder_enabled,
           'onboarding_done', p.onboarding_done, 'onboarding_step', p.onboarding_step,
           'tour_done', p.tour_done_at is not null,
           'saving_with', p.saving_with, 'savings_goal', p.savings_goal,
           'has_plan', exists (select 1 from savings_plans s where s.user_id = p.id and s.is_active),
           'push_enabled', exists (select 1 from push_subscriptions s where s.user_id = p.id),
           'has_access', p.has_access, 'access_granted_at', p.access_granted_at,
           'access', public.admin_access_state(p.id),
           'last_seen_at', greatest(
             u.last_sign_in_at,
             (select max(e.created_at) from events e where e.user_id = p.id and e.name <> 'web_vital'),
             (select max(b.marked_at) from block_marks b where b.user_id = p.id)),
           'views_30d', (select count(*) from events e where e.user_id = p.id and e.name = 'page_view'
                                                         and e.created_at >= now() - interval '30 days'))
    into v_profile
    from profiles p join auth.users u on u.id = p.id
   where p.id = p_user;

  if v_profile is null then raise exception 'Usuário não encontrado' using errcode = 'P0002'; end if;

  insert into admin_audit_log (admin_id, action, target_user_id) values (auth.uid(), 'view_user', p_user);

  return jsonb_build_object(
    'profile', v_profile,
    'subscription', (select to_jsonb(s) from public.admin_subscription(p_user) s),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object(
               'created_at', x.created_at, 'status', x.status, 'amount', x.amount, 'currency', x.currency,
               'promotion_code', x.promotion_code, 'stripe_customer_id', x.stripe_customer_id,
               'courtesy', coalesce(x.stripe_checkout_session_id like 'admin_grant:%', false))
               order by x.created_at desc)
        from purchases x where x.user_id = p_user), '[]'),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'title', c.title, 'blocks', c.blocks, 'type', c.type, 'status', c.status,
               'role', cm.role, 'created_at', c.created_at, 'completed_at', c.completed_at,
               'members', (select count(*) from challenge_members m where m.challenge_id = c.id),
               'marked_total', (select count(*) from block_marks b where b.challenge_id = c.id),
               'marked_by_user', (select count(*) from block_marks b where b.challenge_id = c.id and b.user_id = p_user),
               'last_mark_at', (select max(b.marked_at) from block_marks b where b.challenge_id = c.id and b.user_id = p_user))
               order by c.created_at desc)
        from challenge_members cm join challenges c on c.id = cm.challenge_id
       where cm.user_id = p_user), '[]'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'created_at', e.created_at) order by e.created_at desc)
        from (select name, created_at from events
               where user_id = p_user and name not in ('page_view', 'web_vital')
               order by created_at desc limit 50) e), '[]'),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'created_at', a.created_at) order by a.created_at desc)
        from (select action, created_at from admin_audit_log
               where target_user_id = p_user and action <> 'view_user'
               order by created_at desc limit 20) a), '[]'));
end $$;

create function public.admin_set_courtesy(p_user uuid, p_on boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_changed int;
begin
  perform public.require_admin();
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;

  if p_on then
    if (select has_access from profiles where id = p_user) then
      raise exception 'Esta conta já tem acesso';
    end if;
    insert into purchases (user_id, stripe_checkout_session_id, amount, status)
    values (p_user, 'admin_grant:' || gen_random_uuid(), 0, 'paid');
  else
    update purchases set status = 'expired', updated_at = now()
     where user_id = p_user and status = 'paid' and stripe_checkout_session_id like 'admin_grant:%';
    get diagnostics v_changed = row_count;
    if v_changed = 0 then raise exception 'Esta conta não tem cortesia'; end if;
  end if;

  insert into admin_audit_log (admin_id, action, target_user_id)
  values (auth.uid(), case when p_on then 'courtesy_on' else 'courtesy_off' end, p_user);
  return public.admin_access_state(p_user);
end $$;

------------------------------------------------------------------ analytics

create function public.admin_overview(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone v_tz)::date;
  v_from date := v_today - (v_days - 1);
  v_since timestamptz := v_from::timestamp at time zone v_tz;
  v_week date := date_trunc('week', v_today)::date - 7 * 11; -- 12 semanas, contando a atual
  v_oldest timestamptz := least(v_since, v_week::timestamp at time zone v_tz, now() - interval '30 days');
begin
  perform public.require_admin();

  return (
    with people as (
      select p.id, p.created_at, public.admin_access_state(p.id) as access
        from profiles p
       where not exists (select 1 from admins a where a.user_id = p.id)
    ), seen as (
      select distinct a.user_id, a.seen_at, (a.seen_at at time zone v_tz)::date as day
        from public.admin_activity(v_oldest) a
    )
    select jsonb_build_object(
      'users', (select count(*) from people),
      'new_users', (select count(*) from people where created_at >= v_since),
      'paying', (select count(*) from people where access in ('pago', 'assinante', 'com_acesso')),
      'trialing', (select count(*) from people where access = 'teste'),
      'courtesy', (select count(*) from people where access = 'cortesia'),
      'blocks_marked', (select count(*) from block_marks b where b.marked_at >= v_since
                         and not exists (select 1 from admins a where a.user_id = b.user_id)),
      'active_today', (select count(distinct user_id) from seen where day = v_today),
      'active_7d', (select count(distinct user_id) from seen where day > v_today - 7),
      'active_30d', (select count(distinct user_id) from seen where day > v_today - 30),
      'daily', (
        select jsonb_agg(jsonb_build_object(
                 'day', d.day,
                 'signups', (select count(*) from people p where (p.created_at at time zone v_tz)::date = d.day),
                 'active', (select count(distinct s.user_id) from seen s where s.day = d.day)) order by d.day)
          from (select generate_series(v_from, v_today, interval '1 day')::date as day) d),
      'weekly', (
        select jsonb_agg(jsonb_build_object(
                 'week', w.week,
                 'active', (select count(distinct s.user_id) from seen s
                             where s.day >= w.week and s.day < w.week + 7)) order by w.week)
          from (select generate_series(v_week, date_trunc('week', v_today)::date, interval '7 days')::date as week) w))
  );
end $$;

create function public.admin_usage(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  perform public.require_admin();

  return (
    with e as (
      select x.name, x.user_id, x.props
        from events x
       where x.created_at >= v_since
         and (x.user_id is null or not exists (select 1 from admins a where a.user_id = x.user_id))
    )
    select jsonb_build_object(
      'pages', coalesce((
        select jsonb_agg(to_jsonb(t))
          from (select props ->> 'route' as route, count(*)::int as views, count(distinct user_id)::int as users,
                       (count(*) filter (where user_id is null))::int as anonymous
                  from e where name = 'page_view' and props ->> 'route' is not null
                 group by 1 order by 2 desc limit 30) t), '[]'),
      'features', coalesce((
        select jsonb_agg(to_jsonb(t))
          from (select name, count(*)::int as times, count(distinct user_id)::int as users
                  from e where name not in ('page_view', 'web_vital', 'onboarding_step')
                 group by 1 order by 2 desc limit 30) t), '[]'),
      'vitals', coalesce((
        select jsonb_agg(to_jsonb(t))
          from (select props ->> 'route' as route, props ->> 'metric' as metric, count(*)::int as samples,
                       round(percentile_cont(0.75) within group (
                         order by case when props ->> 'value' ~ '^[0-9]+([.][0-9]+)?$' then (props ->> 'value')::numeric end)::numeric)::int as p75
                  from e where name = 'web_vital' and props ->> 'route' is not null
                 group by 1, 2 order by 3 desc limit 45) t), '[]'))
  );
end $$;

-- Etapas independentes, cada uma sobre quem se cadastrou no período: o pagamento pode acontecer no meio do onboarding,
-- então exigir a ordem esconderia quem pagou antes de terminar. Vem das tabelas, não dos eventos, e vale para o passado.
create function public.admin_funnel(p_days int default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  perform public.require_admin();

  return (
    with c as (
      select p.id, p.onboarding_done, p.onboarding_step,
             exists (select 1 from events e where e.user_id = p.id and e.name = 'checkout_started') as checkout,
             exists (select 1 from events e where e.user_id = p.id and e.name = 'checkout_canceled') as canceled,
             exists (select 1 from events e where e.user_id = p.id and e.name = 'subscription_trialing')
               or exists (select 1 from public.admin_subscription(p.id) s where s.trial_end is not null) as trial,
             public.admin_has_paid(p.id) as paid,
             exists (select 1 from block_marks b where b.user_id = p.id) as marked
        from profiles p
       where p.created_at >= v_since
         and not exists (select 1 from admins a where a.user_id = p.id)
    )
    select jsonb_build_object(
      'signups', (select count(*) from c),
      'onboarded', (select count(*) from c where onboarding_done),
      'checkout', (select count(*) from c where checkout),
      'trial', (select count(*) from c where trial),
      'paid', (select count(*) from c where paid),
      'first_block', (select count(*) from c where marked),
      'canceled_checkout', (select count(*) from c where canceled and not paid),
      'paid_no_block', (select count(*) from c where paid and not marked),
      'stalled', coalesce((
        select jsonb_agg(to_jsonb(t))
          from (select onboarding_step as step, count(*)::int as users
                  from c where not onboarding_done group by 1 order by 1) t), '[]'))
  );
end $$;

-- Linhas = semana de cadastro; colunas = semanas depois do cadastro (0 é a própria semana).
create function public.admin_retention(p_weeks int default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_weeks int := least(greatest(coalesce(p_weeks, 8), 2), 26);
  v_today date := (now() at time zone v_tz)::date;
  v_start date := date_trunc('week', v_today)::date - 7 * (v_weeks - 1);
begin
  perform public.require_admin();

  return (
    with c as (
      select p.id, date_trunc('week', p.created_at at time zone v_tz)::date as week
        from profiles p
       where p.created_at >= v_start::timestamp at time zone v_tz
         and not exists (select 1 from admins a where a.user_id = p.id)
    ), a as (
      select distinct c.week, c.id, ((s.seen_at at time zone v_tz)::date - c.week) / 7 as k
        from c join public.admin_activity(v_start::timestamp at time zone v_tz) s on s.user_id = c.id
    ), sizes as (
      select week, count(*)::int as size from c group by week
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'week', s.week, 'size', s.size,
             'retained', (select jsonb_agg((select count(*) from a where a.week = s.week and a.k = g.k) order by g.k)
                            from generate_series(0, (v_today - s.week) / 7) g(k))) order by s.week desc), '[]')
      from sizes s
  );
end $$;

------------------------------------------------------------------ permissões

-- Função nova nasce executável por PUBLIC: fecha todas e abre só as chamadas pelo painel, para authenticated.
-- Cada uma confere require_admin; as auxiliares não ficam expostas na API.
revoke execute on function
  public.events_guard(), public.prune_events(), public.admin_status(), public.require_admin(),
  public.admin_subscription(uuid), public.admin_access_state(uuid), public.admin_has_paid(uuid),
  public.admin_activity(timestamptz),
  public.admin_users(text, text, text, text, text, text, int, int), public.admin_user_detail(uuid),
  public.admin_set_courtesy(uuid, boolean), public.admin_overview(int), public.admin_usage(int),
  public.admin_funnel(int), public.admin_retention(int)
from public, anon, authenticated;

grant execute on function
  public.admin_status(),
  public.admin_users(text, text, text, text, text, text, int, int), public.admin_user_detail(uuid),
  public.admin_set_courtesy(uuid, boolean), public.admin_overview(int), public.admin_usage(int),
  public.admin_funnel(int), public.admin_retention(int)
to authenticated;
