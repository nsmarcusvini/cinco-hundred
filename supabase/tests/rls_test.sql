-- Testes de RLS e regras de acesso. Rodam numa transação e terminam em ROLLBACK (não deixam dados).
-- Qualquer falha aborta com "FALHOU: ...". Rodar com: psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
-- Usuários: A e B com compra única paga (dupla), C sem acesso, D pago e de fora do desafio.
-- No fim, D fica sem compra e o acesso passa a vir só da assinatura.

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

do $$ begin
  insert into subscriptions (stripe_subscription_id, user_id, stripe_customer_id, status)
  values ('sub_falso', auth.uid(), 'cus_falso', 'active');
  raise exception 'FALHOU: usuário inseriu assinatura ativa';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin  -- trocar o Customer abriria o portal de outra pessoa
  update profiles set stripe_customer_id = 'cus_de_outra_pessoa' where id = auth.uid();
  raise exception 'FALHOU: usuário trocou o próprio stripe_customer_id';
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
  if (select count(*) from movements) <> 4 then  -- 3 do seed + "Já comecei"
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

-- ---------------------------------------------------------------- assinatura libera e revoga (service role)
create function pg_temp.has_access(uid text) returns boolean language sql as
  $$ select has_access from public.profiles where id = uid::uuid $$;
create function pg_temp.set_status(sub text, new_status text) returns void language sql as
  $$ update public.subscriptions set status = new_status where stripe_subscription_id = sub $$;

insert into subscriptions (stripe_subscription_id, user_id, stripe_customer_id, plan, status) values
  ('sub_test_d', '00000000-0000-0000-0000-00000000000d', 'cus_test_d', 'monthly', 'incomplete'),
  ('sub_test_a', '00000000-0000-0000-0000-00000000000a', 'cus_test_a', 'annual', 'active');

do $$
declare d text := '00000000-0000-0000-0000-00000000000d';
begin
  if pg_temp.has_access(d) then raise exception 'FALHOU: incomplete não pode liberar'; end if;
  perform pg_temp.set_status('sub_test_d', 'trialing');
  if not pg_temp.has_access(d) then raise exception 'FALHOU: trialing tem de liberar'; end if;
  perform pg_temp.set_status('sub_test_d', 'active');
  if not pg_temp.has_access(d) then raise exception 'FALHOU: active tem de liberar'; end if;
  perform pg_temp.set_status('sub_test_d', 'past_due');
  if pg_temp.has_access(d) then raise exception 'FALHOU: past_due não pode liberar'; end if;
  perform pg_temp.set_status('sub_test_d', 'active');
  perform pg_temp.set_status('sub_test_d', 'unpaid');
  if pg_temp.has_access(d) then raise exception 'FALHOU: unpaid não pode liberar'; end if;
  perform pg_temp.set_status('sub_test_d', 'active');
  perform pg_temp.set_status('sub_test_d', 'canceled');
  if pg_temp.has_access(d) then raise exception 'FALHOU: cancelada não revogou o acesso'; end if;
  perform pg_temp.set_status('sub_test_d', 'trialing');  -- volta a ter acesso para os testes abaixo

  -- A tem compra única: perder a assinatura não tira o acesso.
  perform pg_temp.set_status('sub_test_a', 'canceled');
  if not pg_temp.has_access('00000000-0000-0000-0000-00000000000a') then
    raise exception 'FALHOU: compra única perdeu o acesso junto com a assinatura';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from subscriptions) <> 1 then
    raise exception 'FALHOU: usuário deveria ver só a própria assinatura';
  end if;
  update subscriptions set status = 'active';
  if found then raise exception 'FALHOU: usuário alterou a própria assinatura'; end if;
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------- sem acesso: desafio só para leitura
reset role;
select pg_temp.set_status('sub_test_d', 'canceled');
set local role authenticated;
do $$
declare cid uuid := (select id from challenges where title = 'Mini');
begin
  if cid is null then raise exception 'FALHOU: sem acesso deixou de ler o próprio desafio'; end if;
  if not exists (select 1 from block_marks where challenge_id = cid and block = 1) then
    raise exception 'FALHOU: sem acesso deixou de ler as marcações';
  end if;
  begin
    insert into block_marks (challenge_id, block, user_id) values (cid, 10, auth.uid());
    raise exception 'FALHOU: sem acesso marcou bloco';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  delete from block_marks where challenge_id = cid and block = 1;
  if not exists (select 1 from block_marks where challenge_id = cid and block = 1) then
    raise exception 'FALHOU: sem acesso desmarcou bloco';
  end if;
end $$;

reset role;
select pg_temp.set_status('sub_test_d', 'active');  -- assinou de novo: volta a marcar
set local role authenticated;
do $$
declare cid uuid := (select id from challenges where title = 'Mini');
begin
  insert into block_marks (challenge_id, block, user_id) values (cid, 10, auth.uid());
  delete from block_marks where challenge_id = cid and block = 10;
  if exists (select 1 from block_marks where challenge_id = cid and block = 10) then
    raise exception 'FALHOU: com acesso não desmarcou';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);  -- como a seção anon deixou

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

-- ---------------------------------------------------------------- painel admin: quem não é admin não vê nada
reset role;
select set_config('request.jwt.claims', '', true);
insert into admins (user_id) values ('00000000-0000-0000-0000-00000000000a');
select pg_temp.set_status('sub_test_d', 'trialing');  -- o detalhe abaixo confere o status em teste
update block_marks set note = 'NOTA-PRIVADA' where challenge_id = current_setting('test.cid')::uuid;

do $$  -- nenhuma função nova fica aberta para public ou anon; auxiliares nem para authenticated
declare
  f record;
  aux constant text[] := array['require_admin', 'events_guard', 'prune_events', 'admin_subscription',
                               'admin_access_state', 'admin_has_paid', 'admin_activity'];
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname = any (aux)) loop
    if has_function_privilege('anon', f.oid, 'execute') then
      raise exception 'FALHOU: anon pode executar %', f.proname;
    end if;
    if f.proname = any (aux) and has_function_privilege('authenticated', f.oid, 'execute') then
      raise exception 'FALHOU: authenticated pode executar a auxiliar %', f.proname;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.admins', 'select') or has_table_privilege('authenticated', 'public.admins', 'select')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'select')
     or has_table_privilege('authenticated', 'public.admins', 'insert') then
    raise exception 'FALHOU: tabelas de admin com permissão para o cliente';
  end if;
end $$;

-- anon: sem permissão em nada
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare q text;
begin
  foreach q in array array[
    'select admin_status()',
    'select admin_users()',
    'select admin_user_detail(''00000000-0000-0000-0000-00000000000a'')',
    'select admin_set_courtesy(''00000000-0000-0000-0000-00000000000c'', true)',
    'select admin_overview()', 'select admin_usage()', 'select admin_funnel()', 'select admin_retention()',
    'select * from admins', 'select * from admin_audit_log'
  ] loop
    begin
      execute q;
      raise exception 'FALHOU: anon executou %', q;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- usuário comum: admin_status responde 'none' e todo o resto recusa, mesmo com a verificação em duas etapas
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}', true);
do $$
declare q text;
begin
  if admin_status() <> 'none' then raise exception 'FALHOU: usuário comum deveria ter status none'; end if;
  foreach q in array array[
    'select admin_users()',
    'select admin_user_detail(''00000000-0000-0000-0000-00000000000a'')',
    'select admin_set_courtesy(''00000000-0000-0000-0000-00000000000c'', true)',
    'select admin_overview()', 'select admin_usage()', 'select admin_funnel()', 'select admin_retention()',
    'select * from admins', 'select * from admin_audit_log',
    'insert into admins (user_id) values (''00000000-0000-0000-0000-00000000000c'')'
  ] loop
    begin
      execute q;
      raise exception 'FALHOU: usuário comum executou %', q;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- admin sem a verificação em duas etapas: também recusa
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
do $$ begin
  if admin_status() <> 'mfa' then raise exception 'FALHOU: admin em aal1 deveria ter status mfa'; end if;
  perform admin_users();
  raise exception 'FALHOU: admin em aal1 listou usuários';
exception when insufficient_privilege then null;
end $$;

-- admin com a verificação: enxerga, sem dados financeiros
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
do $$
declare
  d jsonb;
begin
  if admin_status() <> 'ok' then raise exception 'FALHOU: admin em aal2 deveria ter status ok'; end if;
  if (admin_users(p_search => 'b@teste') ->> 'total')::int <> 1 then raise exception 'FALHOU: busca por e-mail'; end if;
  if (admin_users(p_search => '%') ->> 'total')::int <> 0 then raise exception 'FALHOU: curinga na busca deveria ser literal'; end if;
  if (admin_users(p_search => 'c@teste', p_access => 'sem_acesso') ->> 'total')::int <> 1 then raise exception 'FALHOU: filtro de acesso'; end if;

  d := admin_user_detail('00000000-0000-0000-0000-00000000000a');
  if jsonb_array_length(d -> 'challenges') = 0 then raise exception 'FALHOU: detalhe sem desafios'; end if;
  if ((d -> 'challenges' -> 0) ->> 'marked_total')::int < 1 then raise exception 'FALHOU: detalhe sem contagem de blocos'; end if;
  if d::text ~* '(5000|income|expenses|moradia|monthly_amount|inputs_snapshot|ladder|NOTA-PRIVADA|invite_code)' then
    raise exception 'FALHOU: detalhe expôs dado financeiro ou nota: %', d;
  end if;

  if admin_user_detail('00000000-0000-0000-0000-00000000000d') #>> '{profile,access}' <> 'teste' then
    raise exception 'FALHOU: assinatura em teste deveria aparecer como teste';
  end if;

  perform admin_overview(30);
  perform admin_usage(30);
  perform admin_funnel(90);
  perform admin_retention(8);

  -- cortesia libera e revoga pelo mesmo caminho das compras
  if admin_set_courtesy('00000000-0000-0000-0000-00000000000c', true) <> 'cortesia' then raise exception 'FALHOU: cortesia não liberou'; end if;
  if admin_set_courtesy('00000000-0000-0000-0000-00000000000c', false) <> 'sem_acesso' then raise exception 'FALHOU: cortesia não revogou'; end if;
end $$;

reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'view_user' and target_user_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FALHOU: abrir o detalhe não ficou registrado';
  end if;
  if (select count(*) from admin_audit_log where action like 'courtesy%') <> 2 then
    raise exception 'FALHOU: cortesia não ficou registrada';
  end if;
  if (select has_access from profiles where id = '00000000-0000-0000-0000-00000000000c') then
    raise exception 'FALHOU: has_access ficou ligado depois de revogar a cortesia';
  end if;
end $$;

-- ---------------------------------------------------------------- eventos: só o que está na lista
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare q text;
begin
  insert into events (name, props) values ('page_view', '{"route":"/entrar"}');
  insert into events (name, props) values ('signup', '{"saving_with":"junto"}');
  foreach q in array array[
    'insert into events (name) values (''qualquer_coisa'')',
    'insert into events (name) values (''block_marked'')',
    'insert into events (name) values (''access_granted'')',
    'insert into events (name, props) values (''page_view'', ''{"amount":5000}'')',
    'insert into events (name, props) values (''page_view'', ''{"route":"/app?renda=5000"}'')',
    'insert into events (name, props) values (''page_view'', ''{"route":{"a":1}}'')',
    'insert into events (name, user_id) values (''page_view'', ''00000000-0000-0000-0000-00000000000a'')'
  ] loop
    begin
      execute q;
      raise exception 'FALHOU: evento aceito: %', q;
    exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
    end;
  end loop;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare q text;
begin
  insert into events (name, user_id, props) values ('block_marked', auth.uid(), '{"count":1,"via":"grid"}');
  foreach q in array array[
    'insert into events (name, user_id) values (''access_granted'', auth.uid())',
    'insert into events (name, user_id) values (''refund'', auth.uid())',
    'insert into events (name, user_id) values (''invoice_paid'', auth.uid())',
    'insert into events (name, user_id, props) values (''plan_created'', auth.uid(), ''{"monthly_income":5000}'')'
  ] loop
    begin
      execute q;
      raise exception 'FALHOU: evento aceito: %', q;
    exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
    end;
  end loop;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
insert into events (name, props) values ('access_granted', '{"promotion_code":null}');  -- o webhook continua gravando

-- ---------------------------------------------------------------- saldo inicial ("Já comecei")
-- E (paga) entra com R$ 1.000,50: viram os blocos 500, 499 e 1; os 50 centavos ficam de fora.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'e@teste.dev');
insert into purchases (user_id, stripe_checkout_session_id, amount, status)
values ('00000000-0000-0000-0000-00000000000e', 'cs_test_e', 1000, 'paid');
update profiles set show_in_rankings = true, show_in_global_ranking = true where id = '00000000-0000-0000-0000-00000000000e';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
do $$
declare cid uuid;
begin
  cid := start_movement_with_balance('ja-comecei-125-mil', 'Eva', 100050);
  perform set_config('test.ecid', cid::text, true);
  if (select blocks from challenge_initial_balances where challenge_id = cid) <> array[500, 499, 1]
     or (select amount_cents from challenge_initial_balances where challenge_id = cid) <> 100050 then
    raise exception 'FALHOU: saldo inicial virou os blocos errados';
  end if;
  if start_movement_with_balance('ja-comecei-125-mil', 'Eva', 5000000) <> cid
     or (select amount_cents from challenge_initial_balances where challenge_id = cid) <> 100050 then
    raise exception 'FALHOU: segunda chamada mudou o saldo declarado';
  end if;
  insert into block_marks (challenge_id, block, user_id) values (cid, 2, auth.uid());
  if (select count(*) from block_marks where challenge_id = cid) <> 1 then
    raise exception 'FALHOU: saldo inicial apareceu em block_marks';
  end if;
  if (select pct from movement_ranking('ja-comecei-125-mil') where display_name = 'Eva') is distinct from 0.8 then  -- (1000 + 2) / 125250
    raise exception 'FALHOU: ranking do movimento deveria contar o saldo inicial';
  end if;
  if (select saved from global_ranking() where is_me) is distinct from 1002::bigint then  -- saldo em blocos + bloco 2
    raise exception 'FALHOU: ranking global deveria contar o saldo inicial';
  end if;
end $$;

do $$ begin  -- bloco do saldo inicial não pode ser marcado de novo
  insert into block_marks (challenge_id, block, user_id) values (current_setting('test.ecid')::uuid, 500, auth.uid());
  raise exception 'FALHOU: marcou de novo um bloco do saldo inicial';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin  -- fora do limite
  perform start_movement_with_balance('ja-comecei-125-mil', 'Eva', 12525001);
  raise exception 'FALHOU: aceitou saldo acima de R$ 125.250';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

do $$ begin  -- movimento sem saldo inicial
  perform start_movement_with_balance('desafio-500', 'Eva', 100);
  raise exception 'FALHOU: aceitou saldo inicial no Desafio 500';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

-- B não vê o saldo de E; C (sem acesso) não entra com saldo.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from challenge_initial_balances) then raise exception 'FALHOU: B leu o saldo inicial de outra pessoa'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$ begin
  perform start_movement_with_balance('ja-comecei-125-mil', 'Caio', 100);
  raise exception 'FALHOU: sem acesso entrou com saldo inicial';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

-- Anônimo não chama a RPC nem lê a tabela.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform start_movement_with_balance('ja-comecei-125-mil', 'X', 0);
  raise exception 'FALHOU: anônimo chamou start_movement_with_balance';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;
do $$ begin
  if exists (select 1 from challenge_initial_balances) then raise exception 'FALHOU: anônimo leu challenge_initial_balances'; end if;
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select 'RLS: todos os testes passaram' as resultado;
rollback;
