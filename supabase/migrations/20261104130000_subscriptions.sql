-- Assinaturas no lugar do pagamento único. O acesso passa a vir de duas fontes:
-- compra única paga (quem já comprou continua com acesso) ou assinatura em trialing/active.

-- O Customer da Stripe fica no perfil: é ele que liga eventos e portal a uma conta.
-- Nunca buscamos por e-mail, porque o e-mail do cadastro não é confirmado.
alter table public.profiles add column stripe_customer_id text unique;

-- Uma linha por assinatura da Stripe. O stripe-webhook é o único que escreve.
-- Status sem check de propósito: é copiado da Stripe, e valor novo não pode derrubar o webhook.
create table public.subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid references auth.users on delete set null,  -- fica anonimizada ao excluir a conta, como as compras
  stripe_customer_id text not null,
  stripe_price_id text,
  plan text check (plan in ('monthly', 'annual')),
  status text not null,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,      -- já cancelada, com acesso até esta data
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (user_id);
create index on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
create policy "own subscriptions" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- O usuário também não troca o próprio Customer: isso abriria o portal de outra pessoa.
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.has_access is distinct from old.has_access
    or new.access_granted_at is distinct from old.access_granted_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.email is distinct from old.email
    or new.created_at is distinct from old.created_at) then
    raise exception 'Campo protegido' using errcode = '42501';
  end if;
  return new;
end $$;

-- has_access = compra paga ou assinatura em trialing/active. Cancelar, expirar ou reembolsar revoga.
create or replace function public.sync_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_access boolean;
begin
  if new.user_id is null then return null; end if;
  v_access := exists (select 1 from purchases where user_id = new.user_id and status = 'paid')
    or exists (select 1 from subscriptions where user_id = new.user_id and status in ('trialing', 'active'));
  update profiles
     set has_access = v_access,
         access_granted_at = case when v_access then coalesce(access_granted_at, now()) end
   where id = new.user_id;
  return null;
end $$;

create trigger subscriptions_sync_access after insert or update on public.subscriptions
  for each row execute function public.sync_access();

-- Sem acesso, o desafio fica só para leitura: a pessoa vê a grade, mas não marca nem desmarca.
-- Sem isso, bastaria o teste grátis para criar os desafios e seguir usando depois de cancelar.
drop policy "member marks block" on public.block_marks;
create policy "member marks block" on public.block_marks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member(challenge_id)
    and block <= (select c.blocks from public.challenges c where c.id = challenge_id and c.status <> 'archived')
    and coalesce((select p.has_access from public.profiles p where p.id = (select auth.uid())), false)
  );
drop policy "unmark own block" on public.block_marks;
create policy "unmark own block" on public.block_marks for delete to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select p.has_access from public.profiles p where p.id = (select auth.uid())), false)
  );

-- Os preços agora ficam em src/lib/plans.ts, com os Price IDs nos secrets das Edge Functions.
delete from public.app_settings where key = 'price_label';
