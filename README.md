# Tijoblock

PWA de desafio de poupança "bloco a bloco": a pessoa monta um plano para juntar R$ 125.250, marca cada bloco depositado e
acompanha o progresso sozinha ou em grupo.

## Stack

- **Front:** React 19, React Router, TanStack Query (persistido em IndexedDB para uso offline), Tailwind CSS 4, Motion
- **Build:** Vite 8 + `vite-plugin-pwa` (service worker próprio em `src/sw.ts`, com push)
- **Back-end:** Supabase (Postgres + RLS, Auth por e-mail e senha, Realtime, Edge Functions, pg_cron)
- **Pagamento:** assinatura na Stripe, com Checkout e portal do cliente (Edge Functions `create-checkout`, `create-portal` e `stripe-webhook`)
- **Hospedagem:** Vercel (`vercel.json` reescreve tudo para o SPA)

O front usa `@supabase/auth-js`, `@supabase/postgrest-js` e `@supabase/realtime-js` (carregado sob demanda) em vez de
`supabase-js`, para caber no orçamento de bundle.

## Rodando localmente

Requer Node 20.19+ ou 22.12+ (exigência do Vite 8).

```bash
npm install
cp .env.example .env.local   # preencha as variáveis abaixo
npm run dev
```

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publicável (`sb_publishable_...`) |
| `VITE_VAPID_PUBLIC_KEY` | chave pública VAPID para push (`npx web-push generate-vapid-keys`; a privada fica nos secrets do Supabase) |

O Site URL do Supabase Auth aponta para `http://localhost:3000`, então para o link mágico voltar ao app rode na porta 3000:

```bash
npm run dev -- --port 3000
```

### Erro 431 (Request Header Fields Too Large)

Cookies não são separados por porta: tudo o que outros projetos gravaram em `localhost` é enviado ao Vite. O script `dev`
já sobe o limite de cabeçalhos do Node para 128 KB (`--max-http-header-size`). Se ainda assim aparecer o 431, apague os
cookies de `localhost` no navegador (DevTools → Application → Cookies) ou acesse por `http://127.0.0.1:<porta>`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck, build, pré-renderização de `/entrar`, `/termos` e `/privacidade` e checagem de orçamento de bundle |
| `npm run preview` | serve o `dist/` |
| `npm test` | testes unitários (Vitest) |
| `npm run typecheck` | só o `tsc -b` |

`scripts/check-budgets.mjs` faz o build falhar se a landing ou o app passarem do orçamento de JS definido no script.

## Estrutura

```
src/
  app/          rotas, layout e home do app
  landing/      landing page pública
  features/     auth, onboarding, plan, challenges, movements, checkout, settings, legal
  components/   componentes compartilhados (blocos, sheet, toast…)
  lib/          cliente Supabase, cálculo do plano e dos blocos, offline, push, analytics
  sw.ts         service worker (precache + push)
supabase/
  migrations/   schema, funções, políticas RLS, notificações
  functions/    create-checkout, create-portal, stripe-webhook, send-notifications, delete-account
  tests/        testes de RLS em SQL
docs/design.md  direção visual (cores, tipografia, layout)
scripts/        pré-renderização, orçamento de bundle, preload de rotas
```

## Deploy

Ordem: Supabase → chaves VAPID → Stripe → Edge Functions → hospedagem → CI. Nos comandos, troque `<ref>` pelo
*project ref* do Supabase e `<dominio>` pelo endereço final do site (ex.: `https://cincohundred.app`).

### 1. Supabase

1. Crie o projeto em [supabase.com](https://supabase.com) e instale a CLI (`npm i -g supabase` ou `npx supabase`).
2. Ligue o repositório ao projeto e aplique as migrations (schema, RLS, funções, seed, notificações e cron):

   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase db push
   ```

3. Guarde a URL do projeto no Vault. O cron das notificações lê esse valor para chamar a Edge Function (o segredo do
   cron, `cron_secret`, já é gerado pela migration e nunca sai do banco). No SQL Editor:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   ```

4. Em **Authentication → URL Configuration**: *Site URL* = `<dominio>`; em *Redirect URLs* adicione `<dominio>/**`
   (e `http://localhost:3000/**` para desenvolvimento).
5. Login com Google (opcional): em **Authentication → Providers → Google**, cole o Client ID e o Secret criados no
   Google Cloud, com `https://<ref>.supabase.co/auth/v1/callback` como URI de redirecionamento autorizado.
6. Confira as políticas com `supabase/tests/rls_test.sql` (rode no SQL Editor; ele desfaz tudo no fim).

7. Painel admin (`/admin`): a migration não cria nenhum admin. Conceda ou revogue no SQL Editor (não há botão no painel,
   de propósito):

   ```sql
   insert into public.admins (user_id, note) select id, 'dono' from auth.users where email = '<email>';
   delete from public.admins where user_id = '<id>';
   ```

   A pessoa cadastra a verificação em duas etapas no primeiro acesso a `/admin`. Sem ela, as funções do painel recusam.

### 2. Chaves VAPID (push)

```bash
npx web-push generate-vapid-keys
```

A chave pública vai para o front (`VITE_VAPID_PUBLIC_KEY`) e para os secrets; a privada só para os secrets (passo 4).

### 3. Stripe

Faça tudo primeiro num **sandbox** próprio (não no test mode compartilhado) e repita no modo live depois do
*go-live checklist*.

1. **Produto e preços:** em *Product catalog*, crie o produto "Tijoblock" com dois preços **recorrentes em BRL**.
   Copie os dois IDs (`price_...`):

   | Preço | Valor | Secret |
   |---|---|---|
   | Mensal | R$ 20,00 por mês | `STRIPE_PRICE_MONTHLY` |
   | Anual | R$ 140,00 por ano | `STRIPE_PRICE_ANNUAL` |

   Não configure teste grátis no preço: os 3 dias do mensal são definidos pelo `create-checkout`, só na primeira
   assinatura da conta. Mudou um valor? Atualize também `src/lib/plans.ts` e os Termos.
2. **Chave restrita** (*Developers → API keys → Create restricted key*), só com:
   - Checkout Sessions: **Write**
   - Customers: **Write**
   - Subscriptions: **Write**
   - Customer portal: **Write**
   - Invoices: **Read**
   - Charges: **Read**
   - Events: **Read**

   Copie a chave (`rk_test_...` / `rk_live_...`).
3. **Webhook** (*Developers → Webhooks → Add endpoint*):
   - URL: `https://<ref>.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`,
     `charge.dispute.created`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `checkout.session.expired` (os três últimos só atendem compras únicas antigas)

   Copie o *signing secret* (`whsec_...`).
4. **Portal do cliente** (*Settings → Billing → Customer portal*): ative cancelar assinatura (no fim do período),
   trocar de plano (com os dois preços), atualizar forma de pagamento e histórico de faturas.
5. **Cobrança** (*Settings → Billing → Subscriptions and emails*): ative os e-mails de fim de teste e de renovação, as
   novas tentativas de cobrança e, quando elas acabarem, escolha **cancelar a assinatura**.
6. Para testar o webhook localmente: `stripe listen --forward-to https://<ref>.supabase.co/functions/v1/stripe-webhook`.

### 4. Edge Functions

Secrets (nunca vão para o repositório nem para o front):

```bash
supabase secrets set --project-ref <ref> \
  APP_URL=<dominio> \
  STRIPE_PRICE_MONTHLY=price_... \
  STRIPE_PRICE_ANNUAL=price_... \
  STRIPE_SECRET_KEY=rk_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:contato@seudominio.com
```

Publique as cinco funções (`stripe-webhook` roda sem JWT, conforme `supabase/config.toml`; a assinatura da Stripe é
a autenticação):

```bash
for f in create-checkout create-portal stripe-webhook send-notifications delete-account; do
  supabase functions deploy $f --project-ref <ref> --use-api
done
```

| Função | Chamada por | Faz |
|---|---|---|
| `create-checkout` | app (usuário logado) | cria o Customer e a sessão do Checkout do plano escolhido |
| `create-portal` | app (usuário logado) | abre o portal do cliente: cancelar, trocar de plano, mudar o cartão |
| `stripe-webhook` | Stripe | sincroniza a assinatura, trata reembolso e contestação (idempotente por `event.id`) |
| `send-notifications` | pg_cron, a cada minuto | envia a fila de push e, a cada 15 min, os lembretes agendados |
| `delete-account` | app (usuário logado) | passa a posse dos grupos, cancela a assinatura e apaga a conta |

### Como o acesso funciona

`profiles.has_access` só muda pelo trigger `sync_access`: é verdadeiro com uma compra única paga (`purchases`, de quem
comprou antes das assinaturas) ou uma assinatura em `trialing` ou `active` (`subscriptions`). `past_due`, `unpaid`,
`canceled` e `incomplete` não liberam. O cancelamento pelo portal vale no fim do período: o acesso só cai quando a
Stripe encerra a assinatura. Reembolso total ou contestação encerra a assinatura na hora.

Sem acesso, os desafios ficam só para leitura: as políticas de `block_marks` recusam marcar e desmarcar, e
`ChallengePage` esconde essas ações. Os demais participantes de um grupo não são afetados.

### 5. Hospedagem

Qualquer hospedagem estática serve. O build gera `dist/` com o SPA e as páginas `/entrar`, `/termos` e
`/privacidade` pré-renderizadas.

- **Vercel:** importe o repositório (framework Vite, build `npm run build`, saída `dist`). O `vercel.json` já liga
  `cleanUrls` e manda as demais rotas para o `index.html`.
- **Cloudflare Pages / Netlify:** build `npm run build`, saída `dist`; o `public/_redirects` cuida das rotas do SPA.

Variáveis de ambiente do build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`.
Depois do primeiro deploy, confira se `APP_URL` (secrets) e a *Site URL* do Supabase apontam para o domínio final.

### 6. CI (GitHub Actions)

`.github/workflows/ci.yml` roda testes, build (com os orçamentos de JS) e o Lighthouse CI (`lighthouserc.json`:
performance, acessibilidade, boas práticas e SEO ≥ 95, CLS ≤ 0,05). Cadastre as três `VITE_*` em
**Settings → Secrets and variables → Actions → Variables**.

### Checklist depois do deploy

- [ ] Link mágico chega e volta para `<dominio>/entrar`
- [ ] Assinatura com cartão de teste libera o acesso só depois do webhook; o trial vira cobrança (use um test clock);
      cancelar pelo portal revoga no fim do período; reembolso total revoga na hora
- [ ] Push de teste chega no Android (Chrome) e no iPhone com o app adicionado à tela de início
- [ ] O app instala como PWA e abre offline
- [ ] Remover compras e assinaturas de teste antes de ir para o modo live
