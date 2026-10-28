-- Testes de RLS e regras de acesso. Rodam numa transação e terminam em ROLLBACK (não deixam dados).
-- Qualquer falha aborta com "FALHOU: ...". Rodar com: psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
-- Usuários: A e B pagos (dupla), C sem acesso, D pago e de fora do desafio.

begin;

-- ---------------------------------------------------------------- setup (admin)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@teste.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@teste.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'c@teste.dev'),
  ('00000000-0000-0000-0000-00000000000d', 'd@teste.dev');

do $$ begin
  if (select count(*) from profiles where email like '%@teste.dev') <> 4 then
    raise exception 'FALHOU: handle_new_user não criou os profiles';
  end if;
end $$;

insert into purchases (user_id, stripe_checkout_session_id, amount, status) values
  ('00000000-0000-0000-0000-00000000000a', 'cs_test_a', 1000, 'paid'),
  ('00000000-0000-0000-0000-00000000000b', 'cs_test_b', 1000, 'paid'),
  ('00000000-0000-0000-0000-00000000000d', 'cs_test_d', 1000, 'pending');

do $$ begin
  if (select count(*) from profiles where email like '%@teste.dev' and has_access) <> 2 then
    raise exception 'FALHOU: sync_access (pending não pode liberar)';
  end if;
end $$;
update purchases set status = 'paid' where stripe_checkout_session_id = 'cs_test_d';

insert into financial_profiles (user_id, monthly_income, consent_at) values
  ('00000000-0000-0000-0000-00000000000a', 5000, now()),
  ('00000000-0000-0000-0000-00000000000b', 7000, now());
insert into expenses (user_id, kind, category, amount) values
  ('00000000-0000-0000-0000-00000000000a', 'fixed', 'moradia', 1500),
  ('00000000-0000-0000-0000-00000000000b', 'fixed', 'moradia', 2000);

-- ---------------------------------------------------------------- A cria a dupla
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare cid uuid;
begin
  cid := create_challenge('Desafio a Dois', 100, 'duo', 'Ana');
  perform set_config('test.cid', cid::text, true);
  perform set_config('test.code', (select invite_code from challenges where id = cid), true);
  insert into block_marks (challenge_id, block, user_id) values (cid, 10, auth.uid());
end $$;

do $$ begin  -- bloco acima do tamanho do desafio
  insert into block_marks (challenge_id, block, user_id) values (current_setting('test.cid')::uuid, 101, auth.uid());
  raise exception 'FALHOU: marcou bloco 101 num desafio de 100';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin  -- marcar em nome de outra pessoa
  insert into block_marks (challenge_id, block, user_id)
  values (current_setting('test.cid')::uuid, 11, '00000000-0000-0000-0000-00000000000b');
  raise exception 'FALHOU: marcou bloco em nome de outro usuário';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin  -- plano: com acesso pode refazer quando quiser; só 1 ativo
  perform save_plan('{"scenario":"recomendado","monthly_amount":1160,"status":"ok","ladder":[250,500]}');
  perform save_plan('{"scenario":"leve","monthly_amount":720,"status":"ok"}');
  if (select count(*) from savings_plans where is_active) <> 1 or (select count(*) from savings_plans) <> 2 then
    raise exception 'FALHOU: save_plan deveria manter 1 plano ativo e histórico';
  end if;
end $$;

-- ---------------------------------------------------------------- C (sem acesso, de fora)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

do $$ begin
  perform create_challenge('Meu', 100, 'solo', 'Caio');
  raise exception 'FALHOU: sem acesso criou desafio';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin
  perform join_challenge(current_setting('test.code'), 'Caio');
  raise exception 'FALHOU: sem acesso entrou por convite';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin
  perform join_movement('desafio-500', 'Caio');
  raise exception 'FALHOU: sem acesso entrou em movimento';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin
  update profiles set has_access = true where id = auth.uid();
  raise exception 'FALHOU: usuário liberou o próprio acesso';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin
  insert into purchases (user_id, amount, status) values (auth.uid(), 1000, 'paid');
  raise exception 'FALHOU: usuário inseriu compra paga';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin  -- aceite 6: terceiro sem convite não lê nada do desafio
  if exists (select 1 from challenges) or exists (select 1 from challenge_members)
     or exists (select 1 from block_marks) then
    raise exception 'FALHOU: usuário de fora leu dados do desafio';
  end if;
  if exists (select 1 from financial_profiles) or exists (select 1 from expenses) or exists (select 1 from savings_plans) then
    raise exception 'FALHOU: usuário leu dados financeiros de outros';
  end if;
end $$;

do $$ begin  -- grátis: atualizar o profile funciona; refazer plano só 1x a cada 30 dias
  update profiles set display_name = 'Caio' where id = auth.uid();
  perform save_plan('{"scenario":"recomendado","monthly_amount":300,"status":"apertado"}');
  begin
    perform save_plan('{"scenario":"leve","monthly_amount":150,"status":"apertado"}');
    raise exception 'FALHOU: grátis refez o plano 2x no mesmo mês';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------- B entra na dupla
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare cid uuid := current_setting('test.cid')::uuid;
begin
  if join_challenge(lower(current_setting('test.code')), 'Bia') <> cid then
    raise exception 'FALHOU: join_challenge não retornou o desafio';
  end if;
  if join_challenge(current_setting('test.code'), 'Bia') <> cid then
    raise exception 'FALHOU: join_challenge não é idempotente';
  end if;
  if (select color from challenge_members where user_id = auth.uid()) <> '#2563eb' then
    raise exception 'FALHOU: cor do 2º participante';
  end if;
  if join_challenge('ZZZZZZ', 'Bia') is not null then
    raise exception 'FALHOU: código inválido deveria retornar null';
  end if;

  -- vê as marcações da A, mas não os dados financeiros dela (aceite 1.3)
  if not exists (select 1 from block_marks where block = 10) then
    raise exception 'FALHOU: membro não vê marcações do grupo';
  end if;
  if exists (select 1 from financial_profiles where user_id <> auth.uid())
     or exists (select 1 from expenses where user_id <> auth.uid())
     or exists (select 1 from savings_plans where user_id <> auth.uid()) then
    raise exception 'FALHOU: membro do grupo leu dados financeiros de outro membro';
  end if;

  insert into block_marks (challenge_id, block, user_id) values (cid, 20, auth.uid());
  delete from block_marks where challenge_id = cid and block = 10;  -- marcação da A: não pode apagar
  if not exists (select 1 from block_marks where block = 10) then
    raise exception 'FALHOU: membro desmarcou bloco de outra pessoa';
  end if;
end $$;

do $$ begin  -- aceite 5: mesmo bloco não pode ser marcado 2x
  insert into block_marks (challenge_id, block, user_id) values (current_setting('test.cid')::uuid, 10, auth.uid());
  raise exception 'FALHOU: bloco marcado duas vezes';
exception when unique_violation then null;
end $$;

-- ---------------------------------------------------------------- D (pago) tenta entrar na dupla cheia
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);

do $$ begin
  perform join_challenge(current_setting('test.code'), 'Duda');
  raise exception 'FALHOU: entrou numa dupla com 2 pessoas';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$
declare cid uuid; i int;
begin  -- conclusão automática e reabertura
  cid := create_challenge('Mini', 10, 'solo', 'Duda');
  for i in 1..10 loop insert into block_marks (challenge_id, block, user_id) values (cid, i, auth.uid()); end loop;
  if (select status from challenges where id = cid) <> 'completed' then
    raise exception 'FALHOU: check_completion não concluiu';
  end if;
  delete from block_marks where challenge_id = cid and block = 10;
  if (select status from challenges where id = cid) <> 'active' then
    raise exception 'FALHOU: desmarcar não reabriu o desafio';
  end if;

  -- arquivado não aceita marcação; desarquivar volta ao status certo; prazo tem que ser futuro
  perform archive_challenge(cid, true);
  begin
    insert into block_marks (challenge_id, block, user_id) values (cid, 10, auth.uid());
    raise exception 'FALHOU: marcou bloco em desafio arquivado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  perform archive_challenge(cid, false);
  if (select status from challenges where id = cid) <> 'active' then
    raise exception 'FALHOU: desarquivar';
  end if;
  begin
    perform create_challenge('Passado', 10, 'solo', 'Duda', null, current_date);
    raise exception 'FALHOU: aceitou prazo no passado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- movimento: idempotente e aparece no ranking (só %)
  if join_movement('desafio-500', 'Duda') <> join_movement('desafio-500', 'Duda') then
    raise exception 'FALHOU: join_movement não é idempotente';
  end if;
  if movement_participants('desafio-500') <> 1 then
    raise exception 'FALHOU: movement_participants';
  end if;
end $$;

do $$ begin
  update profiles set show_in_rankings = false where id = auth.uid();
  if exists (select 1 from movement_ranking('desafio-500')) then
    raise exception 'FALHOU: ranking mostrou quem saiu do ranking';
  end if;
end $$;

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  if exists (select 1 from challenges) or exists (select 1 from profiles) or exists (select 1 from block_marks) then
    raise exception 'FALHOU: anon leu dados privados';
  end if;
  if (select owner_name from invite_preview(current_setting('test.code'))) <> 'Ana' then
    raise exception 'FALHOU: invite_preview público';
  end if;
  if (select count(*) from movements) <> 3 then
    raise exception 'FALHOU: anon deveria ver os movimentos ativos';
  end if;
end $$;

do $$ begin
  perform create_challenge('X', 100, 'solo', 'X');
  raise exception 'FALHOU: anon executou create_challenge';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------- reembolso revoga (service role)
reset role;
update purchases set status = 'refunded' where stripe_checkout_session_id = 'cs_test_d';
do $$ begin
  if (select has_access from profiles where id = '00000000-0000-0000-0000-00000000000d') then
    raise exception 'FALHOU: reembolso não revogou o acesso';
  end if;
end $$;

-- ---------------------------------------------------------------- ranking do movimento: membro abreviado
update profiles set show_in_rankings = true where id = '00000000-0000-0000-0000-00000000000d';
insert into challenge_members (challenge_id, user_id, display_name, color)
select c.id, '00000000-0000-0000-0000-00000000000b', ' bia  souza lima ', '#2563eb'
  from challenges c join movements m on m.id = c.movement_id
 where m.slug = 'desafio-500' and c.owner_id = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  if (select display_name from movement_ranking('desafio-500')) <> 'Duda e bia L.' then
    raise exception 'FALHOU: ranking deveria mostrar o dono inteiro e o membro abreviado';
  end if;
end $$;

select 'RLS: todos os testes passaram' as resultado;
rollback;
