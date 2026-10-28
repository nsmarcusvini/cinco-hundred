insert into public.app_settings (key, value) values
  ('price_label', '"R$ 10"'),
  ('free_trial_blocks', '0'),
  ('plan_yield_rate_monthly', '0.008'),   -- taxa líquida de referência, exibida só como estimativa
  ('plan_variable_estimate_pct', '0.15'),
  ('plan_safety_factor', '0.8'),
  ('plan_emergency_months', '6')
on conflict (key) do nothing;

insert into public.movements (slug, title, description, blocks, mode, starts_at) values
  ('desafio-500', 'Desafio 500 — R$ 125 mil',
   'O desafio clássico: 500 blocos, de R$ 1 a R$ 500. Marque cada bloco quando guardar o valor.',
   500, 'solo', '2026-10-27 00:00-03'),
  ('100-mil-com-um-amigo', 'Junte 100 mil com um amigo',
   'Chame uma pessoa e completem juntos 447 blocos: R$ 100.128 no fim.',
   447, 'duo', '2026-10-27 00:00-03'),
  ('100-dias', 'Desafio 100 dias — R$ 5.050',
   'Cem blocos para criar o hábito. Ótimo primeiro degrau.',
   100, 'solo', '2026-11-03 00:00-03')
on conflict (slug) do nothing;
