-- Saldo inicial em desafios e movimentos de DUPLA ou GRUPO: cada participante declara quanto já tem guardado
-- para o objetivo e o grupo começa com a soma. Reaproveita challenge_initial_balances (20261117130000):
-- o saldo vira blocos fechados, separados das marcações, então sequência, conquistas e lembretes de hábito
-- continuam lendo só block_marks. Rankings seguem a regra de 20261117140000 (contam só a parte em blocos,
-- a mesma para todos): nada muda neles, pois já somam todas as linhas do desafio e, no geral, as de cada pessoa.
-- O Tijoloblock não guarda nem movimenta dinheiro: o valor é declarado e não é verificado.

-- Uma linha por pessoa em cada desafio (antes: uma por desafio, o "Já comecei" é individual).
alter table public.challenge_initial_balances drop constraint challenge_initial_balances_pkey;
alter table public.challenge_initial_balances add primary key (challenge_id, user_id);

-- No compartilhado, os membros veem o saldo de cada um (o app avisa antes de confirmar).
-- No individual continua só o dono (é o único membro, mas a regra fica explícita).
drop policy "own initial balance" on public.challenge_initial_balances;
create policy "read initial balances" on public.challenge_initial_balances for select to authenticated
  using (
    user_id = (select auth.uid())
    or (public.is_member(challenge_id)
        and exists (select 1 from public.challenges c where c.id = challenge_id and c.type <> 'solo'))
  );

-- Agora pode haver várias linhas por desafio: soma todas.
create or replace function public.filled_blocks(p_challenge uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from block_marks where challenge_id = p_challenge)::int
       + coalesce((select sum(cardinality(blocks)) from challenge_initial_balances where challenge_id = p_challenge), 0)::int;
$$;

-- Marcar e declarar saldo disputam os mesmos blocos. A trava (FOR KEY SHARE) espera um set_initial_balance
-- em andamento (que segura FOR UPDATE no desafio) e só então confere: nenhum bloco conta duas vezes.
create or replace function public.block_marks_not_initial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from challenges where id = new.challenge_id for key share;
  if exists (select 1 from challenge_initial_balances i
              where i.challenge_id = new.challenge_id and new.block = any(i.blocks)) then
    raise exception 'Este bloco já faz parte do saldo inicial' using errcode = '23505';
  end if;
  return new;
end $$;

-- Declara ou corrige o próprio saldo inicial num desafio compartilhado (upsert: uma linha por pessoa).
-- R$ 0 apaga a linha ("vou começar do zero"). Os blocos saem dos que estão abertos (sem marcação e fora do
-- saldo dos outros), do maior para o menor, centavos para baixo: a mesma regra de sharedInitialBlocks no app.
-- O limite é o valor desses blocos, então o total do grupo nunca passa da meta.
create function public.set_initial_balance(p_challenge uuid, p_amount_cents bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c challenges%rowtype;
  v_available bigint;
  v_rest bigint;
  v_free int[];
  v_blocks int[] := '{}';
  b int;
begin
  if uid is null then raise exception 'Faça login para continuar' using errcode = '28000'; end if;

  select * into c from challenges where id = p_challenge for update;
  if not found or not exists (select 1 from challenge_members where challenge_id = p_challenge and user_id = uid) then
    raise exception 'Desafio não encontrado' using errcode = '42501';
  end if;
  if c.type = 'solo' then raise exception 'Saldo inicial por pessoa é só para desafios em dupla ou grupo'; end if;
  if c.status = 'archived' then raise exception 'Este desafio está arquivado'; end if;
  if not coalesce((select has_access from profiles where id = uid), false) then
    raise exception 'Acesso necessário' using errcode = '42501';
  end if;

  -- Blocos abertos para esta pessoa, do maior para o menor: os seus atuais voltam para a conta
  -- (é uma correção, não uma soma).
  select coalesce(array_agg(g order by g desc), '{}') into v_free
    from generate_series(1, c.blocks) g
   where not exists (select 1 from block_marks m where m.challenge_id = c.id and m.block = g)
     and not exists (select 1 from challenge_initial_balances i
                      where i.challenge_id = c.id and i.user_id <> uid and g = any(i.blocks));
  select coalesce(sum(x), 0) into v_available from unnest(v_free) x;

  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > v_available * 100 then
    raise exception 'Informe um valor entre R$ 0 e R$ %, o que ainda falta para a meta',
      replace(to_char(v_available, 'FM999,999,999'), ',', '.') using errcode = '22023';
  end if;

  if p_amount_cents = 0 then
    delete from challenge_initial_balances where challenge_id = c.id and user_id = uid;
  else
    v_rest := p_amount_cents / 100; -- divisão inteira: centavos para baixo
    foreach b in array v_free loop
      exit when v_rest = 0;
      if b <= v_rest then
        v_blocks := v_blocks || b;
        v_rest := v_rest - b;
      end if;
    end loop;

    insert into challenge_initial_balances (challenge_id, user_id, amount_cents, blocks)
    values (c.id, uid, p_amount_cents, v_blocks)
    on conflict (challenge_id, user_id) do update
      set amount_cents = excluded.amount_cents, blocks = excluded.blocks, declared_at = now();
  end if;

  -- O saldo pode fechar a grade ou, numa correção para menos, reabrir.
  update challenges
     set status = case when public.filled_blocks(id) = blocks then 'completed' else 'active' end,
         completed_at = case when public.filled_blocks(id) = blocks then coalesce(completed_at, now()) end
   where id = c.id and status <> 'archived';
end $$;

revoke execute on function public.set_initial_balance(uuid, bigint) from public, anon;
grant execute on function public.set_initial_balance(uuid, bigint) to authenticated;

-- Quem sai do grupo leva o saldo que declarou: o progresso coletivo deixa de contar esse dinheiro.
create function public.drop_initial_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from challenge_initial_balances where challenge_id = old.challenge_id and user_id = old.user_id;
  if found then
    update challenges set status = 'active', completed_at = null
     where id = old.challenge_id and status = 'completed' and public.filled_blocks(id) < blocks;
  end if;
  return null;
end $$;

create trigger challenge_members_drop_initial after delete on public.challenge_members
  for each row execute function public.drop_initial_on_leave();

revoke execute on function public.drop_initial_on_leave() from public, anon, authenticated;

-- Correções de saldo aparecem na hora para o grupo (a RLS acima vale também no Realtime).
alter publication supabase_realtime add table public.challenge_initial_balances;

notify pgrst, 'reload schema';
