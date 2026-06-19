# The Blue Scribes — Worker (proxy + accounts + token billing)

This Cloudflare Worker does three jobs:

1. **Hides your Anthropic key** — it lives as a server-side secret; the browser
   never sees it (the site only knows the Worker URL, which is not secret).
2. **Mini accounts + token wallet** — email/password sign-up & login (PBKDF2,
   stored in **D1**), a **welcome token credit** on sign-up, and a per-question
   **debit of real usage** (input + output tokens, rounded up). Cached
   knowledge-base tokens are **not** billed to users.
3. **Stripe top-ups** — Checkout for buying more tokens; a signed webhook credits
   the wallet.

```
Browser ──Bearer session──▶ Worker ──your key (server-side)──▶ Anthropic
                              │  └─ checks balance, debits usage → D1
                              ├─ /auth/* , /account  → D1
                              └─ /billing/checkout → Stripe ; /billing/webhook ◀ Stripe → D1
```

> ⚠️ Set a usage/budget cap on your Anthropic account. The welcome credit is free
> to every sign-up, so keep `WELCOME_TOKENS` modest.

## 1. Deploy the Worker

```sh
npm i -g wrangler
cd worker
wrangler deploy
```

## 2. Create the D1 database and apply the schema

```sh
wrangler d1 create blue-scribes-db          # copy the printed database_id
# paste it into wrangler.toml  → [[d1_databases]] database_id = "..."
wrangler d1 execute blue-scribes-db --remote --file=schema.sql
wrangler deploy                             # redeploy so the DB binding takes effect
```

(Dashboard equivalent: **Workers & Pages → D1 → Create**, then **Worker →
Settings → Bindings → Add → D1** with variable name **`DB`**.)

## 3. Secrets

```sh
wrangler secret put ANTHROPIC_API_KEY        # your sk-ant-... key
wrangler secret put STRIPE_SECRET_KEY        # sk_test_... (use test mode first)
wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_... (from step 4)
```

## 4. Stripe

1. In the Stripe dashboard create **three Products/Prices** (one per token pack:
   small / medium / large) — one-time prices in your currency. Copy each
   **Price ID** (`price_...`) into `wrangler.toml` `[vars]`
   (`STRIPE_PRICE_SMALL/MEDIUM/LARGE`). The token amounts per pack are fixed in
   the Worker (`PACK_TOKENS`: 100k / 500k / 1.2M) — set the prices to match what
   you want to charge.
2. Create a **webhook endpoint** pointing at
   `https://blue-scribes-proxy.<sub>.workers.dev/billing/webhook`, subscribed to
   **`checkout.session.completed`**. Copy its **Signing secret** (`whsec_...`)
   into the `STRIPE_WEBHOOK_SECRET` secret (step 3).
3. `wrangler deploy` again after editing `wrangler.toml`.

## 5. Point the site at the Worker

`index.html` already sets `PROXY_URL` to your Worker and shares it with
`account.js`. Nothing else to do — the site now shows a **💳 Tokens** button:
visitors sign up (get the welcome credit), ask questions (tokens are debited),
and recharge through Stripe.

## How billing works

- The Worker tees the streamed response, reads the final `usage`, and debits
  `ceil((input_tokens + output_tokens) / BILLING_GRANULARITY) * BILLING_GRANULARITY`
  tokens (minimum one granularity step). `input_tokens` from the API already
  **excludes** the cached knowledge base, so a question costs roughly its visible
  input + the answer length.
- The wallet balance in **D1 is the source of truth**. The `x-tokens-remaining`
  response header is an optimistic pre-debit value; the site re-reads `/account`
  after each turn for the accurate balance.
- Purchases are credited **idempotently** (one credit per Stripe session id).

## Notes / tuning

- `WELCOME_TOKENS`, `BILLING_GRANULARITY`, `MODEL`, `MAX_TOKENS`, `ALLOWED_ORIGIN`,
  `SITE_URL` are plain `[vars]` — change without touching code.
- The key is **never** committed and **never** sent to the browser.
- To change pack sizes, edit `PACK_TOKENS` in `blue-scribes-proxy.js` and keep the
  Stripe prices in sync.
- Use Stripe **test mode** keys + a test webhook first; switch to live keys when ready.
