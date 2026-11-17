-- Movimento "Já comecei: rumo aos R$ 125 mil": a grade do Desafio 500 para quem já tem dinheiro guardado.
-- Ao entrar, a pessoa declara o saldo (R$ 0 a R$ 125.250, com centavos) e ele vira blocos fechados.
--
-- O saldo fica numa tabela própria, fora de block_marks, de propósito: sequência, conquistas, notificações
-- de hábito, ranking global e ranking dos movimentos leem só block_marks, então o saldo declarado nunca
-- conta como hábito e nunca aparece para outras pessoas. Só a própria pessoa lê a linha (RLS).
-- O Tijoblock não guarda nem movimenta dinheiro: isto é só o registro do que a pessoa disse que já tem.

alter table public.movements add column accepts_initial_balance boolean not null default false;

create table public.challenge_initial_balances (
  challenge_id uuid primary key references public.challenges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  blocks int[] not null default '{}',
  declared_at timestamptz not null default now()
);
create index on public.challenge_initial_balances (user_id);

alter table public.challenge_initial_balances enable row level security;

-- Valor declarado é dado financeiro individual: só o dono lê. Escrita só pela RPC abaixo.
create policy "own initial balance" on public.challenge_initial_balances for select to authenticated
  using (user_id = (select auth.uid()));

-- Um bloco do saldo inicial já está fechado: marcá-lo de novo contaria o mesmo dinheiro duas vezes.
-- Mesmo código da PK de block_marks (23505), que o app já trata como "bloco já marcado".
create function public.block_marks_not_initial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from challenge_initial_balances i
              where i.challenge_id = new.challenge_id and new.block = any(i.blocks)) then
    raise exception 'Este bloco já faz parte do saldo inicial' using errcode = '23505';
  end if;
  return new;
end $$;

create trigger block_marks_not_initial before insert on public.block_marks
  for each row execute function public.block_marks_not_initial();

-- Blocos fechados do desafio: marcações mais os do saldo inicial (0 nos desafios sem saldo).
create function public.filled_blocks(p_challenge uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from block_marks where challenge_id = p_challenge)::int
       + coalesce((select cardinality(blocks) from challenge_initial_balances where challenge_id = p_challenge), 0);
$$;

-- Conclusão passa a contar os blocos do saldo inicial. Nos outros desafios o resultado é o mesmo de antes.
create or replace function public.check_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update challenges c set status = 'completed', completed_at = now()
     where c.id = new.challenge_id and c.status = 'active'
       and public.filled_blocks(c.id) = c.blocks;
    return null;
  end if;
  update challenges set status = 'active', completed_at = null
   where id = old.challenge_id and status = 'completed';
  return null;
end $$;

create or replace function public.archive_challenge(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update challenges
     set status = case
           when p_archived then 'archived'
           when public.filled_blocks(p_id) = blocks then 'completed'
           else 'active' end
   where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'Só o dono pode arquivar' using errcode = '42501'; end if;
end $$;

-- Aviso de 25/50/75/100% (só para os membros do desafio): o percentual inclui o saldo inicial,
-- senão o aviso chegaria na hora errada. O saldo em si nunca dispara aviso: ele não passa por block_marks.
create or replace function public.enqueue_mark() returns trigger
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
  v_total := v_total + coalesce((select sum(b) from challenge_initial_balances i, unnest(i.blocks) b
                                  where i.challenge_id = c.id), 0);
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

-- Entra no movimento e registra o saldo inicial numa transação só.
-- O acesso (has_access) e o limite de desafios continuam sendo validados por join_movement/create_challenge.
-- Os blocos saem da mesma regra de src/lib/initialBalance.ts: do maior para o menor, centavos arredondados
-- para baixo, então os blocos nunca somam mais do que o valor declarado.
create function public.start_movement_with_balance(p_slug text, p_name text, p_amount_cents bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m movements%rowtype;
  c challenges%rowtype;
  cid uuid;
  v_rest bigint;
  v_blocks int[] := '{}';
begin
  if uid is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;

  select * into m from movements where slug = p_slug and is_active;
  if not found then raise exception 'Movimento não encontrado'; end if;
  if not m.accepts_initial_balance then raise exception 'Este movimento não aceita saldo inicial'; end if;
  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > m.blocks::bigint * (m.blocks + 1) / 2 * 100 then
    raise exception 'Informe um valor entre R$ 0 e %', to_char(m.blocks * (m.blocks + 1) / 2, 'FM999G999G999');
  end if;

  cid := join_movement(p_slug, p_name);
  select * into c from challenges where id = cid for update;

  -- Já informou (toque duplo, outra aba): devolve o desafio sem mexer no que foi declarado.
  if exists (select 1 from challenge_initial_balances where challenge_id = cid) then return cid; end if;

  if c.owner_id <> uid then raise exception 'Só quem criou o desafio informa o saldo inicial' using errcode = '42501'; end if;
  if not coalesce((select has_access from profiles where id = uid), false) then
    raise exception 'Acesso necessário' using errcode = '42501';
  end if;
  if exists (select 1 from block_marks where challenge_id = cid) then
    raise exception 'O saldo inicial só pode ser informado antes da primeira marcação';
  end if;

  v_rest := p_amount_cents / 100; -- divisão inteira: centavos para baixo
  for b in reverse c.blocks..1 loop
    exit when v_rest = 0;
    if b <= v_rest then
      v_blocks := v_blocks || b;
      v_rest := v_rest - b;
    end if;
  end loop;

  insert into challenge_initial_balances (challenge_id, user_id, amount_cents, blocks)
  values (cid, uid, p_amount_cents, v_blocks);

  if cardinality(v_blocks) = c.blocks then
    update challenges set status = 'completed', completed_at = now() where id = cid and status = 'active';
  end if;

  return cid;
end $$;

revoke execute on function public.start_movement_with_balance(text, text, bigint) from public, anon;
grant execute on function public.start_movement_with_balance(text, text, bigint) to authenticated;
-- Uso interno (triggers e RPCs): ninguém chama direto.
revoke execute on function public.filled_blocks(uuid), public.block_marks_not_initial() from public, anon, authenticated;

insert into public.movements (slug, title, description, blocks, mode, starts_at, accepts_initial_balance) values
  ('ja-comecei-125-mil', 'Já comecei: rumo aos R$ 125 mil',
   'Já tem dinheiro guardado? Informe quanto ao entrar e comece com a grade do Desafio 500 em parte preenchida. Depois é marcar os blocos que faltam até os R$ 125.250.',
   500, 'solo', '2026-11-17 00:00-03', true)
on conflict (slug) do nothing;
