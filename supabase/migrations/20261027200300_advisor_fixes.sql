-- Funções de trigger não precisam ser chamáveis pela API.
revoke execute on function public.handle_new_user(), public.sync_access(), public.check_completion()
  from authenticated;

create index on public.events (user_id);
