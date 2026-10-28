-- create_challenge passa a aceitar o prazo opcional; arquivar/desarquivar pelo dono.

drop function public.create_challenge(text, int, text, text, uuid);

create function public.create_challenge(p_title text, p_blocks int, p_type text, p_name text,
                                        p_movement_id uuid default null, p_target_date date default null)
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

  if p_target_date is not null and p_target_date <= current_date then
    raise exception 'O prazo precisa ser uma data futura';
  end if;

  insert into challenges (owner_id, movement_id, title, blocks, type, target_date)
  values (uid, p_movement_id, trim(p_title), p_blocks, p_type, p_target_date)
  returning id into cid;

  insert into challenge_members (challenge_id, user_id, display_name, color, role)
  values (cid, uid, left(trim(p_name), 40), '#12a150', 'owner');

  return cid;
end $$;

create function public.archive_challenge(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update challenges
     set status = case
           when p_archived then 'archived'
           when (select count(*) from block_marks where challenge_id = p_id) = blocks then 'completed'
           else 'active' end
   where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'Só o dono pode arquivar' using errcode = '42501'; end if;
end $$;

revoke execute on function public.create_challenge(text, int, text, text, uuid, date),
                           public.archive_challenge(uuid, boolean) from public, anon;
