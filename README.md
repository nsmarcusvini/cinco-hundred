# Cinco Hundred

PWA de desafio de poupança "bloco a bloco": a pessoa monta um plano para juntar R$ 125.250, marca cada bloco depositado e
acompanha o progresso sozinha ou em grupo.

## Stack

- **Front:** React 19, React Router, TanStack Query (persistido em IndexedDB para uso offline), Tailwind CSS 4, Motion
- **Build:** Vite 8 + `vite-plugin-pwa` (service worker próprio em `src/sw.ts`, com push)
- **Back-end:** Supabase (Postgres + RLS, Auth por link mágico, Realtime, Edge Functions, pg_cron)
- **Pagamento:** Stripe Checkout (Edge Functions `create-checkout` e `stripe-webhook`)
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
  functions/    create-checkout, stripe-webhook, send-notifications, delete-account
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

### 2. Chaves VAPID (push)

```bash
npx web-push generate-vapid-keys
```

A chave pública vai para o front (`VITE_VAPID_PUBLIC_KEY`) e para os secrets; a privada só para os secrets (passo 4).

### 3. Stripe

Faça tudo primeiro num **sandbox** próprio (não no test mode compartilhado) e repita no modo live depois do
*go-live checklist*.

1. **Produto e preço:** em *Product catalog*, crie o produto "Cinco Hundred — acesso vitalício" com um preço
   **único** de **R$ 10,00 em BRL**. Copie o ID do preço (`price_...`).
2. **Chave restrita** (*Developers → API keys → Create restricted key*), só com:
   - Checkout Sessions: **Write**
   - Customers: **Write**
   - Charges: **Read**
   - Events: **Read**

   Copie a chave (`rk_test_...` / `rk_live_...`).
3. **Webhook** (*Developers → Webhooks → Add endpoint*):
   - URL: `https://<ref>.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`

   Copie o *signing secret* (`whsec_...`).
4. Para testar o webhook localmente: `stripe listen --forward-to https://<ref>.supabase.co/functions/v1/stripe-webhook`.

### 4. Edge Functions

Secrets (nunca vão para o repositório nem para o front):

```bash
supabase secrets set --project-ref <ref> \
  APP_URL=<dominio> \
  STRIPE_PRICE_ID=price_... \
  STRIPE_SECRET_KEY=rk_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:contato@seudominio.com
```

Publique as quatro funções (`stripe-webhook` roda sem JWT, conforme `supabase/config.toml`; a assinatura da Stripe é
a autenticação):

```bash
for f in create-checkout stripe-webhook send-notifications delete-account; do
  supabase functions deploy $f --project-ref <ref> --use-api
done
```

| Função | Chamada por | Faz |
|---|---|---|
| `create-checkout` | app (usuário logado) | cria a sessão do Checkout e a compra pendente |
| `stripe-webhook` | Stripe | confirma, recusa, reembolsa ou contesta a compra (idempotente por `event.id`) |
| `send-notifications` | pg_cron, a cada minuto | envia a fila de push e, a cada 15 min, os lembretes agendados |
| `delete-account` | app (usuário logado) | passa a posse dos grupos e apaga a conta |

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
- [ ] Compra com cartão de teste libera o acesso só depois do webhook; reembolso revoga
- [ ] Push de teste chega no Android (Chrome) e no iPhone com o app adicionado à tela de início
- [ ] O app instala como PWA e abre offline
- [ ] Remover compras de teste antes de ir para o modo live
