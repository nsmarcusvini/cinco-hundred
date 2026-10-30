-- Aviso "Já instalou o app?" na Início: mês (AAAA-MM) em que a pessoa respondeu "Já fiz isso" (ou instalou pelo botão).
-- Fica no perfil, como o check-in mensal: o aviso volta só no mês seguinte, em qualquer aparelho.
alter table public.profiles add column install_prompt_month text
  check (install_prompt_month ~ '^\d{4}-\d{2}$');
