-- O passo da caixinha deixou o onboarding com 11 passos; o limite antigo (10) recusava a conclusão.
alter table public.profiles drop constraint profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check check (onboarding_step between 1 and 11);
