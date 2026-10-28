-- Check-in mensal (seção 6.8): mês (AAAA-MM) em que o usuário respondeu pela última vez.
-- Fica no perfil, não no aparelho, para a pergunta aparecer uma vez por mês em qualquer lugar.
alter table public.profiles add column last_checkin_month text
  check (last_checkin_month ~ '^\d{4}-\d{2}$');
