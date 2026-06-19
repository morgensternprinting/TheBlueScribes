/**
 * The Blue Scribes — Cloudflare Worker (proxy + accounts + token billing).
 *
 * Responsibilities
 *   1. Hide YOUR Anthropic API key (server-side secret; never sent to the browser).
 *   2. Mini accounts: email + password sign-up / login (PBKDF2 hashing, opaque
 *      session tokens stored in D1). A welcome token credit is granted on sign-up.
 *   3. Token wallet: every chat call checks the user's balance first, forwards to
 *      Anthropic, then debits the REAL usage (input + output tokens) rounded up to
 *      a billing granularity. Cached-prompt tokens (the ~118K-token knowledge base)
 *      are NOT billed to users — they are infra cost absorbed by the owner.
 *   4. Stripe top-ups: /billing/checkout creates a Checkout Session; the Stripe
 *      webhook credits tokens to the wallet (idempotently).
 *
 * Routes (CORS-enabled for the site origin):
 *   POST /auth/signup     {email,password}              → {token, balance}
 *   POST /auth/login      {email,password}              → {token, balance}
 *   POST /auth/logout     (Bearer)                      → {ok}
 *   GET  /account         (Bearer)                      → {email, balance}
 *   POST /billing/checkout{pack}        (Bearer)        → {url}
 *   POST /billing/webhook (Stripe-Signature, raw body)  → {received:true}
 *   POST /                 (Bearer) the chat            → streamed SSE
 *
 * Bindings / secrets (see wrangler.toml + README):
 *   DB (D1)                       accounts, sessions, transactions
 *   ANTHROPIC_API_KEY   (secret)  your sk-ant-... key
 *   STRIPE_SECRET_KEY   (secret)  sk_live_/sk_test_...
 *   STRIPE_WEBHOOK_SECRET(secret) whsec_...
 *   STRIPE_PRICE_SMALL/MEDIUM/LARGE (vars) Stripe Price IDs for the token packs
 * Optional vars:
 *   ALLOWED_ORIGIN   site origin (default "*")     MODEL (default claude-opus-4-8)
 *   MAX_TOKENS       per-response cap (default 8192, hard max 16000)
 *   WELCOME_TOKENS   credit granted on sign-up (default 10000)
 *   BILLING_GRANULARITY  round debits up to this many tokens (default 1000)
 *   UNLIMITED_EMAILS comma-separated emails that bypass the wallet (owner/staff)
 *   SITE_URL         used to build Stripe success/cancel URLs (default ALLOWED_ORIGIN)
 */

const PACK_TOKENS = { small: 100000, medium: 500000, large: 1200000 };

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      // Stripe webhook is server-to-server (no CORS, raw body, signature-verified).
      if (path === "/billing/webhook" && request.method === "POST") return stripeWebhook(request, env, cors);

      if (path === "/auth/signup" && request.method === "POST") return authSignup(request, env, cors);
      if (path === "/auth/login" && request.method === "POST") return authLogin(request, env, cors);
      if (path === "/auth/logout" && request.method === "POST") return authLogout(request, env, cors);
      if (path === "/account" && request.method === "GET") return accountInfo(request, env, cors);
      if (path === "/billing/checkout" && request.method === "POST") return billingCheckout(request, env, cors);

      if (path === "/" && request.method === "POST") return chat(request, env, ctx, cors);

      return json({ error: { message: "Not found" } }, 404, cors);
    } catch (e) {
      return json({ error: { message: "Server error: " + ((e && e.message) || e) } }, 500, cors);
    }
  },
};

/* ───────────────────────────── chat (token-metered) ───────────────────────── */

async function chat(request, env, ctx, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: { message: "Server is missing ANTHROPIC_API_KEY" } }, 500, cors);
  if (!env.DB) return json({ error: { message: "Server is missing the D1 binding (DB)" } }, 500, cors);

  // 1) Authenticate via session token.
  const user = await requireUser(request, env);
  if (!user) return json({ error: { message: "Sign in to ask the Scribes.", code: "auth_required" } }, 401, cors);

  // 2) Wallet gate — must have tokens left, UNLESS this is an unlimited (owner)
  //    account (email listed in UNLIMITED_EMAILS). We cannot know the exact cost
  //    in advance, so we require a positive balance and debit the real usage after.
  const unlimited = isUnlimited(user.email, env);
  if (!unlimited && user.token_balance <= 0) {
    return json({ error: { message: "Out of tokens. Recharge to keep asking.", code: "no_tokens", balance: 0 } }, 402, cors);
  }

  // 3) Parse the client body; model / limits / streaming are fixed server-side.
  let body;
  try { body = await request.json(); } catch { return json({ error: { message: "Bad JSON" } }, 400, cors); }

  const MAX_TOKENS = Math.min(Number(env.MAX_TOKENS) || 8192, 16000);
  const upstreamBody = {
    model: env.MODEL || "claude-opus-4-8",
    max_tokens: MAX_TOKENS,
    stream: true,
    thinking: (body && typeof body.thinking === "object" && body.thinking) || { type: "adaptive", display: "omitted" },
    system: body && body.system,
    tools: body && Array.isArray(body.tools) ? body.tools : undefined,
    messages: body && Array.isArray(body.messages) ? body.messages : [],
  };

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => upstream.statusText);
    return new Response(detail, { status: upstream.status, headers: { ...cors, "content-type": upstream.headers.get("content-type") || "application/json" } });
  }

  // 4) Forward the stream to the browser. For metered accounts, tee it and debit
  //    the real usage afterwards; unlimited (owner) accounts are never charged.
  let clientBody = upstream.body;
  if (!unlimited) {
    const [toClient, toMeter] = upstream.body.tee();
    clientBody = toClient;
    ctx.waitUntil(meterAndDebit(toMeter, env, user.id));
  }

  const headers = new Headers(cors);
  headers.set("content-type", upstream.headers.get("content-type") || "text/event-stream; charset=utf-8");
  headers.set("cache-control", "no-store");
  // Optimistic (pre-debit) balance; the client refreshes /account after the turn.
  headers.set("x-tokens-remaining", unlimited ? "-1" : String(user.token_balance));
  return new Response(clientBody, { status: 200, headers });
}

// Read the SSE copy, extract usage, debit input+output tokens (rounded up).
async function meterAndDebit(stream, env, userId) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "", inputTok = 0, outputTok = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let j; try { j = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (j.type === "message_start" && j.message && j.message.usage) {
            inputTok = j.message.usage.input_tokens || 0; // excludes cached prompt
          } else if (j.type === "message_delta" && j.usage && j.usage.output_tokens != null) {
            outputTok = j.usage.output_tokens; // cumulative final count
          }
        }
      }
    }
  } catch { /* best-effort metering */ }

  const granularity = Number(env.BILLING_GRANULARITY) || 1000;
  const billable = (inputTok || 0) + (outputTok || 0);
  const cost = Math.max(granularity, Math.ceil(billable / granularity) * granularity);
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET token_balance = MAX(0, token_balance - ?) WHERE id = ?").bind(cost, userId),
      env.DB.prepare("INSERT INTO transactions (user_id, kind, amount, ref, created_at) VALUES (?, 'debit', ?, ?, ?)")
        .bind(userId, cost, `in:${inputTok}/out:${outputTok}`, nowIso()),
    ]);
  } catch { /* if the debit fails we simply don't charge this turn */ }
}

/* ───────────────────────────── auth ───────────────────────────── */

async function authSignup(request, env, cors) {
  if (!env.DB) return json({ error: { message: "Server is missing the D1 binding (DB)" } }, 500, cors);
  const { email, password } = await readJson(request);
  const err = validateCreds(email, password);
  if (err) return json({ error: { message: err } }, 400, cors);

  const lc = email.toLowerCase();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(lc).first();
  if (existing) return json({ error: { message: "An account with this email already exists." } }, 409, cors);

  const { hash, salt } = await hashPassword(password);
  const welcome = Number(env.WELCOME_TOKENS) || 10000;
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, pw_hash, pw_salt, token_balance, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, lc, hash, salt, welcome, nowIso()),
    env.DB.prepare("INSERT INTO transactions (user_id, kind, amount, ref, created_at) VALUES (?, 'welcome', ?, 'signup', ?)")
      .bind(id, welcome, nowIso()),
  ]);
  const token = await newSession(env, id);
  return json({ token, email: lc, balance: welcome, unlimited: isUnlimited(lc, env) }, 200, cors);
}

async function authLogin(request, env, cors) {
  if (!env.DB) return json({ error: { message: "Server is missing the D1 binding (DB)" } }, 500, cors);
  const { email, password } = await readJson(request);
  if (!email || !password) return json({ error: { message: "Email and password required." } }, 400, cors);

  const u = await env.DB.prepare("SELECT id, email, pw_hash, pw_salt, token_balance FROM users WHERE email = ?")
    .bind(String(email).toLowerCase()).first();
  // Always run a verify to reduce account-enumeration timing differences.
  const ok = u ? await verifyPassword(password, u.pw_hash, u.pw_salt) : await verifyPassword(password, "", "AAAAAAAAAAAAAAAAAAAAAA==");
  if (!u || !ok) return json({ error: { message: "Invalid email or password." } }, 401, cors);

  const token = await newSession(env, u.id);
  return json({ token, email: u.email, balance: u.token_balance, unlimited: isUnlimited(u.email, env) }, 200, cors);
}

async function authLogout(request, env, cors) {
  const token = bearer(request);
  if (token && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return json({ ok: true }, 200, cors);
}

async function accountInfo(request, env, cors) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: { message: "Not signed in", code: "auth_required" } }, 401, cors);
  return json({ email: user.email, balance: user.token_balance, unlimited: isUnlimited(user.email, env) }, 200, cors);
}

/* ───────────────────────────── billing (Stripe) ───────────────────────────── */

async function billingCheckout(request, env, cors) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: { message: "Not signed in", code: "auth_required" } }, 401, cors);
  if (!env.STRIPE_SECRET_KEY) return json({ error: { message: "Billing is not configured." } }, 500, cors);

  const { pack } = await readJson(request);
  const priceId = { small: env.STRIPE_PRICE_SMALL, medium: env.STRIPE_PRICE_MEDIUM, large: env.STRIPE_PRICE_LARGE }[pack];
  const tokens = PACK_TOKENS[pack];
  if (!priceId || !tokens) return json({ error: { message: "Unknown token pack." } }, 400, cors);

  const site = env.SITE_URL || env.ALLOWED_ORIGIN || "";
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", user.id);
  form.set("customer_email", user.email);
  form.set("metadata[user_id]", user.id);
  form.set("metadata[tokens]", String(tokens));
  form.set("success_url", `${site}?topup=success`);
  form.set("cancel_url", `${site}?topup=cancel`);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { "authorization": "Bearer " + env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await r.json();
  if (!r.ok) return json({ error: { message: data.error?.message || "Stripe error" } }, 502, cors);
  return json({ url: data.url }, 200, cors);
}

async function stripeWebhook(request, env, cors) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: { message: "Webhook not configured" } }, 500, cors);
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature") || "";
  const valid = await verifyStripeSig(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: { message: "Bad signature" } }, 400, cors);

  let event; try { event = JSON.parse(raw); } catch { return json({ error: { message: "Bad JSON" } }, 400, cors); }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const userId = s.metadata?.user_id;
    const tokens = parseInt(s.metadata?.tokens || "0", 10);
    if (userId && tokens > 0 && env.DB) {
      // Idempotent: only credit once per Stripe session id.
      const seen = await env.DB.prepare("SELECT id FROM transactions WHERE ref = ?").bind(s.id).first();
      if (!seen) {
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET token_balance = token_balance + ? WHERE id = ?").bind(tokens, userId),
          env.DB.prepare("INSERT INTO transactions (user_id, kind, amount, ref, created_at) VALUES (?, 'purchase', ?, ?, ?)")
            .bind(userId, tokens, s.id, nowIso()),
        ]);
      }
    }
  }
  return json({ received: true }, 200, cors);
}

/* ───────────────────────────── helpers ───────────────────────────── */

async function requireUser(request, env) {
  const token = bearer(request);
  if (!token || !env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.token_balance, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`).bind(token).first();
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return row;
}

async function newSession(env, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 30 days
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires).run();
  return token;
}

function bearer(request) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

// Owner / staff accounts that bypass the wallet entirely (no balance check, no
// debit). Set the UNLIMITED_EMAILS var to a comma-separated list of emails.
function isUnlimited(email, env) {
  const list = String(env.UNLIMITED_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return list.includes(String(email || "").toLowerCase());
}

function validateCreds(email, password) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email address.";
  if (!password || String(password).length < 8) return "Password must be at least 8 characters.";
  return null;
}

async function readJson(request) { try { return await request.json(); } catch { return {}; } }

function nowIso() { return new Date().toISOString(); }

// PBKDF2-SHA256 password hashing (no bcrypt on Workers).
async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return { hash: b64(new Uint8Array(bits)), salt: b64(salt) };
}
async function verifyPassword(password, expectedHashB64, saltB64) {
  try {
    const { hash } = await hashPassword(password, saltB64);
    return timingSafeEqualStr(hash, expectedHashB64 || "");
  } catch { return false; }
}

// Stripe signature: header "t=<ts>,v1=<hmac>"; HMAC-SHA256 of `${t}.${rawBody}`.
async function verifyStripeSig(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=").map(s => s.trim())));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (!timingSafeEqualStr(expected, v1)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // reject events older than 5 min
  return true;
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Expose-Headers": "x-tokens-remaining",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });
}

function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64ToBytes(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function b64url(bytes) { return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

function timingSafeEqualStr(a, b) {
  const ab = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0; for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}
