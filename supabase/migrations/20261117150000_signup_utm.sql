-- Origem (UTM da primeira visita) gravada no perfil já na criação da conta, a partir dos metadados do signUp.
-- Antes ela só era gravada no primeiro login no mesmo navegador da visita: quem confirmava o e-mail em outro
-- navegador (comum vindo do Instagram) ficava como "Direto". Perfis existentes não mudam.
-- Valor limpo: minúsculas, só [a-z0-9_.-], até 60 caracteres; vazio vira null.

create or replace function public.clean_utm(v text) returns text
language sql immutable set search_path = public as $$
  select nullif(left(regexp_replace(lower(trim(coalesce(v, ''))), '[^a-z0-9_.-]', '', 'g'), 60), '');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into profiles (id, email, display_name, saving_with, utm_source, utm_campaign)
  values (new.id, new.email,
          nullif(left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 40), ''),
          case when new.raw_user_meta_data->>'saving_with' in ('sozinho', 'junto')
               then new.raw_user_meta_data->>'saving_with' end,
          public.clean_utm(new.raw_user_meta_data->>'utm_source'),
          case when public.clean_utm(new.raw_user_meta_data->>'utm_source') is not null
               then public.clean_utm(new.raw_user_meta_data->>'utm_campaign') end);
  return new;
end $function$;

revoke all on function public.clean_utm(text) from public, anon, authenticated;
