/**
 * The Blue Scribes — Cloudflare Worker proxy.
 *
 * Holds YOUR Anthropic API key server-side (never sent to the browser or stored
 * in the repo) and gates access behind a shared password. The static site posts
 * the chat body here; this Worker adds the key and forwards to the Anthropic
 * Messages API, streaming the response straight back.
 *
 * Required secrets (set with `wrangler secret put ...`, or in the dashboard):
 *   ANTHROPIC_API_KEY   your Anthropic key (sk-ant-...)
 *   APP_PASSWORD        the shared access password visitors must enter
 *
 * Optional vars (wrangler.toml [vars] or dashboard → Settings → Variables):
 *   ALLOWED_ORIGIN      exact site origin allowed to call this, e.g.
 *                       "https://morgensternprinting.github.io"  (default "*")
 *   MODEL               model id (default "claude-opus-4-8")
 *   MAX_TOKENS          per-response cap (default 8192, hard max 16000)
 *   DAILY_LIMIT         questions per IP per UTC day (default 3)
 *
 * Optional binding (dashboard → Settings → Variables → KV Namespace Bindings):
 *   RATE_LIMIT  (KV)    bind a KV namespace here to enable the per-IP daily cap.
 *                       Without it, no limiting is applied.
 */

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: { message: "Method not allowed" } }, 405, cors);
    }

    // 1) Shared-password gate — protects YOUR Anthropic credit.
    const pw = request.headers.get("x-app-password") || "";
    if (!env.APP_PASSWORD || !timingSafeEqual(pw, env.APP_PASSWORD)) {
      return json({ error: { message: "Invalid or missing access password" } }, 401, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: { message: "Server is missing ANTHROPIC_API_KEY" } }, 500, cors);
    }

    // 1b) Per-IP daily limit. Only NEW user questions are counted (the front-end
    //     sends x-new-turn:"1" on the first call of a turn, not on tool-loop
    //     continuations). Requires a KV namespace bound as RATE_LIMIT; if it is
    //     not configured, limiting is silently skipped.
    let rlLimit = null, rlRemaining = null;
    if (env.RATE_LIMIT && request.headers.get("x-new-turn") === "1") {
      const limit = Number(env.DAILY_LIMIT) || 3;
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const day = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd → resets daily
      const key = `rl:${day}:${ip}`;
      const used = Number(await env.RATE_LIMIT.get(key)) || 0;
      if (used >= limit) {
        return json({ error: { message: `Daily question limit reached (${limit}/day).`, code: "rate_limited_daily", limit, remaining: 0 } }, 429, cors);
      }
      // Best-effort increment (KV is eventually consistent — fine for a soft cap).
      await env.RATE_LIMIT.put(key, String(used + 1), { expirationTtl: 172800 });
      rlLimit = limit;
      rlRemaining = Math.max(0, limit - (used + 1));
    }

    // 2) Parse the client body and rebuild the upstream request. Only the
    //    prompt-shaping fields are taken from the client; model / limits /
    //    streaming are fixed server-side so callers can't change them.
    let body;
    try { body = await request.json(); } catch { return json({ error: { message: "Bad JSON" } }, 400, cors); }

    const MAX_TOKENS = Math.min(Number(env.MAX_TOKENS) || 8192, 16000);
    const upstreamBody = {
      model: env.MODEL || "claude-opus-4-8",
      max_tokens: MAX_TOKENS,
      stream: true,
      thinking: (body && typeof body.thinking === "object" && body.thinking) || { type: "adaptive", display: "summarized" },
      system: body && body.system,
      tools: body && Array.isArray(body.tools) ? body.tools : undefined,
      messages: body && Array.isArray(body.messages) ? body.messages : [],
    };

    // 3) Forward to Anthropic with the hidden key and stream the result back.
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(upstreamBody),
    });

    const headers = new Headers(cors);
    headers.set("content-type", upstream.headers.get("content-type") || "text/event-stream; charset=utf-8");
    headers.set("cache-control", "no-store");
    if (rlRemaining !== null) {
      headers.set("x-questions-remaining", String(rlRemaining));
      headers.set("x-questions-limit", String(rlLimit));
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-app-password, x-new-turn",
    "Access-Control-Expose-Headers": "x-questions-remaining, x-questions-limit",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

// Length-independent constant-time-ish comparison to avoid trivial timing leaks.
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}
