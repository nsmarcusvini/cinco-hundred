-- Resposta do onboarding "Você já tem uma caixinha?" (o passo novo entrou como 2; os seguintes andaram uma casa).
alter table public.profiles
  add column bank_box text check (bank_box in ('sim', 'nao', 'nao_sei'));

-- Quem está no meio do onboarding continua no mesmo passo depois da renumeração.
update public.profiles set onboarding_step = onboarding_step + 1
  where not onboarding_done and onboarding_step >= 2;
