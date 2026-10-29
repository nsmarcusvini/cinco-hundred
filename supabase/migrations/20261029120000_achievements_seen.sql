-- Conquistas já comemoradas (ids de src/lib/obra.ts). As conquistas são calculadas no app a partir das
-- marcações; aqui fica só o que já ganhou confete, para não repetir em outro aparelho.
-- Nulo = nunca calculado: na primeira vez o app grava o que a pessoa já tem, sem comemorar tudo de uma vez.
alter table public.profiles add column achievements_seen text[];
