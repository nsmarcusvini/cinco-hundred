-- Resposta do cadastro "Você vai guardar sozinho(a) ou com alguém?". Null = conta anterior à pergunta.
alter table public.profiles
  add column saving_with text check (saving_with in ('sozinho', 'junto'));

-- O cadastro manda a resposta nos metadados (com confirmação de e-mail ainda não há sessão para gravar no profile).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name, saving_with)
  values (new.id, new.email,
          nullif(left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 40), ''),
          case when new.raw_user_meta_data->>'saving_with' in ('sozinho', 'junto')
               then new.raw_user_meta_data->>'saving_with' end);
  return new;
end $$;
