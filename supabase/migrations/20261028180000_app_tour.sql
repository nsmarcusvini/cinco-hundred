-- Tutorial do app (destaques na tela): quando a pessoa terminou ou pulou. Nulo = ainda não viu.
-- Fica no perfil para não reaparecer em outro aparelho.
alter table public.profiles add column tour_done_at timestamptz;
