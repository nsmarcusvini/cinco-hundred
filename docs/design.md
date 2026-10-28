# Direção visual — Cinco Hundred

## Assunto, público, função
Painel de poupança "bloco a bloco" para brasileiros de 20–40 anos vindos do Instagram. A função de cada tela é tornar visível
o dinheiro já guardado e qual é o próximo passo. O objeto característico desse mundo é **o bloco numerado** (tijolo, cofrinho,
cartela de bingo): é ele que vira a assinatura visual, não um gradiente nem um card genérico.

## Cor (fixada pelo brief, seção 9)
| Token | Hex | Uso |
|---|---|---|
| `cream` | `#f4f1e8` | fundo |
| `forest` | `#0b3d2e` | topo, botões primários, texto sobre dourado |
| `gold` | `#e8b44c` | progresso e destaque — nunca texto sobre creme (contraste) |
| `leaf` | `#12a150` | bloco marcado |
| `ink` | `#13231c` | texto |
| `muted` | `#56635b` | texto secundário (AA sobre creme) |
| `line` | `#dcd7c9` | bordas de campos e blocos vazios |

## Tipografia
Fonte do sistema no app (requisito de performance). A personalidade vem dos **números**: valores em R$ grandes, peso 800,
`tabular-nums`, tracking negativo; texto corrido em 16px/1.5. Escala 1.25: 13 · 16 · 20 · 25 · 31 · 39 · 49 · 61.
Sem caixa-alta em rótulos, sem sobrelinhas ("eyebrows"), sem `→` nos botões.

## Layout
Coluna única alinhada à esquerda, até 760px. Uma pergunta por tela no onboarding, com o valor digitado grande no topo.

```
┌──────────────────────────┐
│ ‹ voltar     ■■■■□□□□□□  │  ← progresso = 10 blocos (um por passo)
│                          │
│ Quanto cai na sua conta  │  ← pergunta, 25px, peso 700
│ por mês?                 │
│                          │
│ R$ 5.000                 │  ← campo/valor, 39px, peso 800
│ ────────────────         │
│                          │
│ [ Continuar            ] │  ← botão fixo no rodapé, alvo ≥ 48px
└──────────────────────────┘
```

## Princípios
1. **O bloco é a assinatura.** Progresso do onboarding, prévia da grade, escada de desafios e marcos usam quadrados com raio
   pequeno (6px), nunca barras arredondadas genéricas.
2. **Números protagonistas.** O valor em R$ é sempre o maior elemento da tela onde aparece; rótulos ficam pequenos e discretos.
3. **Movimento só como resposta.** Troca de passo desliza (200ms), valores "rolam" até o novo total, a revelação do plano é o
   único momento orquestrado. `prefers-reduced-motion` desliga tudo.
4. **Hierarquia de raio.** Blocos 6px, campos e botões 14px, sheets 24px no topo. Sem sombra cinza padrão: profundidade por
   cor de fundo (`forest` sobre `cream`).

## Revisão contra o brief
- O creme + verde do brief lembra o padrão "creme + serifa + terracota". Para não cair nele: nenhuma serifa, nenhum terracota,
  e o dourado só aparece como preenchimento de progresso.
- Primeira ideia de progresso era uma barra fina arredondada (padrão de qualquer stepper). Troquei por 10 blocos, que repetem
  o objeto do produto.
- Cards de cenário (Leve/Recomendado/Acelerado) começaram como três cards iguais com sombra. Troquei por linhas selecionáveis
  com o valor mensal grande à esquerda e o prazo à direita: comparam melhor no celular e fogem do kit de cards.
