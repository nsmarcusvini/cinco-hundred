-- Objetivo de quem guarda (perguntado no passo 2 do onboarding). Não é dado financeiro: fica no profile.
alter table public.profiles
  add column savings_goal text
    check (savings_goal in ('reserva', 'investimento', 'intercambio', 'dinheiro_trabalhando', 'outros')),
  add column savings_goal_other text
    check (savings_goal_other is null or char_length(savings_goal_other) between 1 and 40);
