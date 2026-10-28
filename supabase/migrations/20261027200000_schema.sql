-- Cinco Hundred: tabelas e índices. RLS fica ativo em todas (políticas no arquivo seguinte).

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  avatar_color text not null default '#12a150',
  birth_date date,
  city text check (city is null or char_length(city) <= 80),
  state text check (state is null or char_length(state) = 2),
  has_access boolean not null default false,     -- acesso vitalício pago (só o webhook altera)
  access_granted_at timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  reminder_enabled boolean not null default true,
  reminder_time time not null default '20:00',
  reminder_days int[] not null default '{1,2,3,4,5,6,0}', -- 0 = domingo
  marketing_opt_in boolean not null default false,
  show_in_rankings boolean not null default true,
  onboarding_done boolean not null default false,
  onboarding_step int not null default 1 check (onboarding_step between 1 and 10),
  utm_source text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create table public.financial_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  monthly_income numeric(12,2) check (monthly_income between 0 and 1000000),
  extra_income numeric(12,2) not null default 0 check (extra_income between 0 and 1000000),
  income_type text check (income_type in ('clt','autonomo','servidor','empresario','outro')),
  paydays int[] not null default '{5}'
    check (cardinality(paydays) between 1 and 2 and 1 <= all(paydays) and 31 >= all(paydays)),
  current_savings numeric(12,2) not null default 0 check (current_savings >= 0),
  has_emergency_fund boolean,
  has_high_interest_debt boolean,
  variable_estimated boolean not null default true,
  consent_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('fixed','variable')),
  category text not null check (category in ('moradia','contas_casa','mercado','transporte','saude','educacao',
    'dividas_parcelas','assinaturas','filhos_pets','lazer','delivery_restaurante','compras','outros')),
  label text check (label is null or char_length(label) <= 60),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index on public.expenses (user_id);

create table public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  is_active boolean not null default true,
  scenario text not null check (scenario in ('leve','recomendado','acelerado','personalizado')),
  goal numeric(12,2) not null default 125250,
  monthly_amount numeric(12,2) not null check (monthly_amount >= 0),
  start_balance numeric(12,2) not null default 0,
  months_estimated int,
  months_with_yield int,
  yield_rate_monthly numeric(6,4),
  target_date date,
  recommended_blocks int check (recommended_blocks between 10 and 1000),
  ladder int[],
  status text not null check (status in ('ok','apertado','resgate')),
  inputs_snapshot jsonb,
  created_at timestamptz not null default now()
);
create unique index savings_plans_one_active on public.savings_plans (user_id) where is_active;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  amount int,                 -- centavos (1000 = R$ 10,00)
  currency text not null default 'brl',
  status text not null default 'pending'
    check (status in ('pending','paid','failed','expired','refunded','disputed')),
  receipt_url text,
  promotion_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.purchases (user_id);
create index on public.purchases (stripe_payment_intent_id);

create table public.stripe_events (
  id text primary key,        -- evt_...
  type text,
  processed_at timestamptz not null default now()
);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  cover_url text,
  blocks int not null check (blocks between 10 and 1000),
  mode text not null check (mode in ('solo','duo','group')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  movement_id uuid references public.movements,
  title text not null check (char_length(title) between 1 and 60),
  blocks int not null check (blocks between 10 and 1000),
  type text not null default 'solo' check (type in ('solo','duo','group')),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  target_date date,
  status text not null default 'active' check (status in ('active','completed','archived')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.challenges (owner_id);
create index on public.challenges (movement_id);

create table public.challenge_members (
  challenge_id uuid references public.challenges on delete cascade,
  user_id uuid references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index on public.challenge_members (user_id);

-- A PK garante que cada bloco só é marcado uma vez por desafio.
create table public.block_marks (
  challenge_id uuid references public.challenges on delete cascade,
  block int check (block > 0),
  user_id uuid not null references auth.users on delete cascade,
  note text check (note is null or char_length(note) <= 140),
  marked_at timestamptz not null default now(),
  primary key (challenge_id, block)
);
create index on public.block_marks (user_id, marked_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

create table public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  kind text not null,
  payload jsonb,
  sent_at timestamptz not null default now()
);
create index on public.notifications_log (user_id, sent_at);

create table public.events (
  id bigserial primary key,
  user_id uuid references auth.users on delete set null,
  name text not null check (char_length(name) <= 60),
  props jsonb,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null
);

-- Rate limit de tentativas de código de convite.
create table public.invite_attempts (
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now()
);
create index on public.invite_attempts (user_id, at);

alter table public.profiles enable row level security;
alter table public.financial_profiles enable row level security;
alter table public.expenses enable row level security;
alter table public.savings_plans enable row level security;
alter table public.purchases enable row level security;
alter table public.stripe_events enable row level security;
alter table public.movements enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.block_marks enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications_log enable row level security;
alter table public.events enable row level security;
alter table public.app_settings enable row level security;
alter table public.invite_attempts enable row level security;
