# Hidden-key proxy (Cloudflare Worker)

This lets the site use **your** Anthropic key without it ever reaching the
browser or this repository. The key lives as a **server-side secret** in a
Cloudflare Worker, gated behind a **shared access password**.

```
Browser ──(password)──▶  Your Worker  ──(your key, server-side)──▶  Anthropic API
                         secrets: ANTHROPIC_API_KEY, APP_PASSWORD
```

> ⚠️ A public proxy spends **your** Anthropic credit for everyone who has the
> password. Keep the password private, and set a usage/budget cap on your
> Anthropic account.

## Option A — Cloudflare dashboard (no install)

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Create Worker**. Name it `blue-scribes-proxy`, **Deploy**, then **Edit code**.
2. Replace the editor contents with [`blue-scribes-proxy.js`](./blue-scribes-proxy.js)
   and **Deploy**.
3. Worker → **Settings → Variables and Secrets**:
   - Add **secret** `ANTHROPIC_API_KEY` = your `sk-ant-...` key.
   - Add **secret** `APP_PASSWORD` = a password you choose.
   - (Optional) Add **variables** `ALLOWED_ORIGIN` = `https://morgensternprinting.github.io`,
     `MODEL`, `MAX_TOKENS`.
4. Copy the Worker URL (e.g. `https://blue-scribes-proxy.<sub>.workers.dev`).
5. In `index.html`, set `const PROXY_URL = "https://…workers.dev";`, commit & push.
   The app now asks visitors for the **access password** instead of an API key.

## Option B — Wrangler CLI

```sh
npm i -g wrangler
cd worker
wrangler deploy
wrangler secret put ANTHROPIC_API_KEY   # paste your sk-ant-... key
wrangler secret put APP_PASSWORD        # choose a password
```

Edit `wrangler.toml` `[vars]` to set `ALLOWED_ORIGIN` to your site origin. Then
put the deployed URL into `PROXY_URL` in `index.html`.

## Notes

- The key is **never** committed and **never** sent to the browser — only the
  Worker URL (which is not secret) goes in `index.html`.
- The Worker fixes `model`/`max_tokens`/streaming server-side; clients can only
  shape the prompt (system, messages, tools).
- Leaving `PROXY_URL = ""` reverts the app to bring-your-own-key mode.
- Rotate the key (Anthropic console) or change `APP_PASSWORD` anytime — no site
  redeploy needed for secret changes.
