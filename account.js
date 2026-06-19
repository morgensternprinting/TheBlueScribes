/* The Blue Scribes — account & token widget (💳).
 *
 * A self-contained floating panel: sign up / log in (email + password), shows the
 * token balance, and lets the user buy more tokens via Stripe Checkout. Talks to
 * the same Cloudflare Worker that proxies the chat (see worker/).
 *
 * It exposes a tiny API for index.html's chat code:
 *   window.BlueScribesAccount = {
 *     getSessionToken(), getBalance(), isLoggedIn(),
 *     refresh(),               // re-fetch balance from the Worker
 *     open(), openLogin(),     // open the panel
 *     onChange(fn),            // subscribe to {loggedIn, email, balance} changes
 *   }
 * It also listens for window event "bs-refresh-balance" (dispatched by the chat
 * after each turn) and re-fetches the balance.
 *
 * No secrets here — only the Worker URL (not secret) and an opaque session token
 * kept in localStorage. The Anthropic and Stripe keys live in the Worker.
 */
(function () {
  "use strict";

  const PROXY = (window.SCRIBES_PROXY_URL || "https://blue-scribes-proxy.morgensternprinting.workers.dev").replace(/\/+$/, "");
  const LS_SESSION = "bs_session";
  const LS_EMAIL = "bs_email";

  const FR = (document.documentElement.lang || "fr").toLowerCase().startsWith("fr");
  const T = FR ? {
    title: "Mon compte", tokens: "Écus", balance: "Solde",
    login: "Se connecter", signup: "Créer un compte", logout: "Se déconnecter",
    email: "Adresse e-mail", password: "Mot de passe (8+ caractères)",
    recharge: "Recharger des écus", buy: "Acheter",
    needLogin: "Connecte-toi pour interroger les Scribes.",
    toggleToSignup: "Pas de compte ? En créer un", toggleToLogin: "Déjà un compte ? Se connecter",
    small: "Petit", medium: "Moyen", large: "Grand", tokensSuffix: "écus",
    welcome: "Compte créé ! Écus de bienvenue crédités.", loggedIn: "Connecté",
    working: "…", buyHint: "Paiement sécurisé par Stripe. Tu reviens ici après le paiement.",
    topupOk: "Paiement reçu — solde mis à jour dès la confirmation de Stripe.",
    closed: "Fermer",
  } : {
    title: "My account", tokens: "Écus", balance: "Balance",
    login: "Log in", signup: "Create account", logout: "Log out",
    email: "Email address", password: "Password (8+ characters)",
    recharge: "Recharge écus", buy: "Buy",
    needLogin: "Sign in to ask the Scribes.",
    toggleToSignup: "No account? Create one", toggleToLogin: "Have an account? Log in",
    small: "Small", medium: "Medium", large: "Large", tokensSuffix: "écus",
    welcome: "Account created! Welcome écus credited.", loggedIn: "Signed in",
    working: "…", buyHint: "Secure payment by Stripe. You'll return here afterwards.",
    topupOk: "Payment received — balance updates once Stripe confirms.",
    closed: "Close",
  };

  const PACKS = [
    { id: "small", tokens: 100000 },
    { id: "medium", tokens: 500000 },
    { id: "large", tokens: 1200000 },
  ];

  let state = { loggedIn: false, email: localStorage.getItem(LS_EMAIL) || "", balance: null, unlimited: false };
  const listeners = [];
  function emit() { for (const fn of listeners) { try { fn(Object.assign({}, state)); } catch (e) {} } }

  function token() { return localStorage.getItem(LS_SESSION) || ""; }
  function setSession(tok, email) {
    if (tok) localStorage.setItem(LS_SESSION, tok); else localStorage.removeItem(LS_SESSION);
    if (email) localStorage.setItem(LS_EMAIL, email);
    state.loggedIn = !!tok; if (email) state.email = email;
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
    if (token()) headers["authorization"] = "Bearer " + token();
    const resp = await fetch(PROXY + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = null; try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) {
      const err = new Error((data && data.error && data.error.message) || resp.statusText);
      err.status = resp.status; err.code = data && data.error && data.error.code; throw err;
    }
    return data;
  }

  /* ---------- DOM ---------- */
  let root, panel, balanceEls = [], msgEl, formWrap, authBtns, buyWrap, fab;
  let mode = "login"; // or "signup"

  function fmt(n) { return (n == null) ? "—" : Number(n).toLocaleString(FR ? "fr-FR" : "en-US"); }

  function build() {
    const style = document.createElement("style");
    style.textContent = `
      .bs-fab{position:fixed;top:12px;right:12px;z-index:60;display:flex;align-items:center;gap:6px;
        padding:8px 12px;border-radius:999px;border:1px solid var(--line,#3a4a6a);cursor:pointer;
        background:var(--panel,#10182e);color:#e9f0ff;font:600 13px/1 system-ui,sans-serif;
        box-shadow:0 2px 10px rgba(0,0,0,.3)}
      .bs-fab:hover{border-color:var(--accent,#5b8cff)}
      .bs-fab .bs-bal{opacity:.85;font-weight:700}
      .bs-overlay{position:fixed;inset:0;z-index:70;background:rgba(4,8,20,.55);display:none;
        align-items:flex-start;justify-content:center;padding:64px 16px}
      .bs-overlay.show{display:flex}
      .bs-panel{width:min(420px,94vw);background:#0f1830;color:#e9f0ff;
        border:1px solid var(--line,#324063);border-radius:14px;padding:18px;
        box-shadow:0 18px 60px rgba(0,0,0,.5);font:14px/1.5 system-ui,sans-serif}
      .bs-panel h2{margin:0 0 4px;font-size:18px}
      .bs-row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px 0}
      .bs-bigbal{font-size:26px;font-weight:800}
      .bs-fld{width:100%;box-sizing:border-box;margin:6px 0;padding:10px;border-radius:8px;
        border:1px solid var(--line,#324063);background:var(--bg,#0a1226);color:inherit}
      .bs-btn{display:inline-block;padding:9px 14px;border-radius:8px;border:1px solid var(--line,#324063);
        background:var(--accent,#3f63c8);color:#fff;font-weight:700;cursor:pointer}
      .bs-btn.ghost{background:transparent;color:inherit}
      .bs-btn:disabled{opacity:.6;cursor:default}
      .bs-link{background:none;border:none;color:var(--accent,#7aa2ff);cursor:pointer;padding:0;font:inherit;text-decoration:underline}
      .bs-msg{min-height:18px;margin:8px 0;font-size:13px}
      .bs-msg.err{color:var(--danger,#ff6b6b)} .bs-msg.ok{color:#5fd28a}
      .bs-packs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
      .bs-pack{border:1px solid #3a55a0;border-radius:10px;padding:10px;text-align:center;cursor:pointer;background:#16203c}
      .bs-pack:hover{border-color:#e8c878;background:#1c2950}
      .bs-pack b{display:block;font-size:13px;color:#f2e6c4} .bs-pack span{font-size:11px;color:#c3d2f5}
      .bs-close{float:right;background:none;border:none;color:inherit;font-size:18px;cursor:pointer;opacity:.7}
      .bs-hint{font-size:11px;opacity:.7;margin-top:8px}
      @media(max-width:560px){.bs-fab{top:8px;right:8px;padding:6px 10px;font-size:12px}}
    `;
    document.head.appendChild(style);

    fab = document.createElement("button");
    fab.className = "bs-fab"; fab.type = "button";
    fab.innerHTML = `💳 <span>${T.tokens}</span> <span class="bs-bal">—</span>`;
    fab.addEventListener("click", open);
    document.body.appendChild(fab);

    root = document.createElement("div");
    root.className = "bs-overlay";
    root.innerHTML = `
      <div class="bs-panel" role="dialog" aria-modal="true">
        <button class="bs-close" aria-label="${T.closed}">✕</button>
        <h2>💳 ${T.title}</h2>
        <div class="bs-msg" data-msg></div>

        <div data-auth>
          <input class="bs-fld" type="email" autocomplete="email" placeholder="${T.email}" data-email>
          <input class="bs-fld" type="password" autocomplete="current-password" placeholder="${T.password}" data-pw>
          <div class="bs-row">
            <button class="bs-btn" data-primary>${T.login}</button>
            <button class="bs-link" data-toggle>${T.toggleToSignup}</button>
          </div>
        </div>

        <div data-account hidden>
          <div class="bs-row"><span>${T.balance}</span><span class="bs-bigbal" data-bal>—</span></div>
          <div class="bs-row"><span data-email-lbl></span><button class="bs-btn ghost" data-logout>${T.logout}</button></div>
          <h3 style="margin:14px 0 4px;font-size:14px">${T.recharge}</h3>
          <div class="bs-packs" data-packs></div>
          <div class="bs-hint">${T.buyHint}</div>
        </div>
      </div>`;
    document.body.appendChild(root);
    panel = root.querySelector(".bs-panel");
    msgEl = root.querySelector("[data-msg]");
    formWrap = root.querySelector("[data-auth]");
    authBtns = root.querySelector("[data-account]");
    buyWrap = root.querySelector("[data-packs]");
    balanceEls = [fab.querySelector(".bs-bal"), root.querySelector("[data-bal]")];

    root.querySelector(".bs-close").addEventListener("click", close);
    root.addEventListener("click", (e) => { if (e.target === root) close(); });
    root.querySelector("[data-primary]").addEventListener("click", submitAuth);
    root.querySelector("[data-toggle]").addEventListener("click", toggleMode);
    root.querySelector("[data-logout]").addEventListener("click", logout);
    root.querySelector("[data-pw]").addEventListener("keydown", (e) => { if (e.key === "Enter") submitAuth(); });

    for (const p of PACKS) {
      const el = document.createElement("button");
      el.className = "bs-pack"; el.type = "button";
      el.innerHTML = `<b>${T[p.id]}</b><span>${fmt(toEcus(p.tokens))} ${T.tokensSuffix}</span>`;
      el.addEventListener("click", () => buy(p.id));
      buyWrap.appendChild(el);
    }
  }

  function setMsg(text, kind) { msgEl.textContent = text || ""; msgEl.className = "bs-msg" + (kind ? " " + kind : ""); }
  // 1 écu = 1000 tokens. Balance is stored in tokens internally; display in écus.
  function toEcus(tokens) { return tokens == null ? null : Math.round(tokens / 1000); }
  function renderBalance() { for (const el of balanceEls) if (el) el.textContent = state.unlimited ? "∞" : fmt(toEcus(state.balance)); }
  function renderMode() {
    const account = state.loggedIn;
    formWrap.hidden = account; authBtns.hidden = !account;
    if (account) {
      root.querySelector("[data-email-lbl]").textContent = state.email || "";
    } else {
      root.querySelector("[data-primary]").textContent = (mode === "signup") ? T.signup : T.login;
      root.querySelector("[data-toggle]").textContent = (mode === "signup") ? T.toggleToLogin : T.toggleToSignup;
    }
  }

  function open() { root.classList.add("show"); setMsg(""); renderMode(); }
  function openLogin() { mode = "login"; open(); setMsg(T.needLogin); }
  function close() { root.classList.remove("show"); }
  function toggleMode() { mode = (mode === "signup") ? "login" : "signup"; setMsg(""); renderMode(); }

  async function submitAuth() {
    const email = root.querySelector("[data-email]").value.trim();
    const password = root.querySelector("[data-pw]").value;
    const btn = root.querySelector("[data-primary]");
    btn.disabled = true; setMsg(T.working);
    try {
      const data = await api(mode === "signup" ? "/auth/signup" : "/auth/login", { method: "POST", body: { email, password } });
      setSession(data.token, data.email);
      state.balance = data.balance; state.unlimited = !!data.unlimited;
      renderBalance(); renderMode(); emit();
      setMsg(mode === "signup" ? T.welcome : T.loggedIn, "ok");
    } catch (e) {
      setMsg(e.message || "Error", "err");
    } finally { btn.disabled = false; }
  }

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } catch (e) {}
    setSession("", ""); state.balance = null; state.loggedIn = false; state.unlimited = false;
    renderBalance(); renderMode(); emit(); setMsg("");
  }

  async function buy(pack) {
    setMsg(T.working);
    try {
      const data = await api("/billing/checkout", { method: "POST", body: { pack } });
      if (data.url) window.location.href = data.url;
    } catch (e) {
      if (e.code === "auth_required") { openLogin(); return; }
      setMsg(e.message || "Error", "err");
    }
  }

  async function refresh() {
    if (!token()) { state.loggedIn = false; state.balance = null; renderBalance(); renderMode(); emit(); return; }
    try {
      const data = await api("/account");
      state.loggedIn = true; state.email = data.email; state.balance = data.balance; state.unlimited = !!data.unlimited;
      localStorage.setItem(LS_EMAIL, data.email);
    } catch (e) {
      if (e.status === 401) { setSession("", ""); state.loggedIn = false; state.balance = null; state.unlimited = false; }
    }
    renderBalance(); renderMode(); emit();
  }

  /* ---------- public API ---------- */
  window.BlueScribesAccount = {
    getSessionToken: token,
    getBalance: () => state.balance,
    isLoggedIn: () => !!token(),
    refresh, open, openLogin,
    onChange: (fn) => { if (typeof fn === "function") { listeners.push(fn); fn(Object.assign({}, state)); } },
  };

  // The chat dispatches this after each turn so the balance reflects the debit.
  window.addEventListener("bs-refresh-balance", refresh);

  /* ---------- boot ---------- */
  function boot() {
    build();
    state.loggedIn = !!token();
    renderBalance(); renderMode();
    refresh();
    // Returned from Stripe Checkout? Show a note and refresh shortly (webhook lag).
    const params = new URLSearchParams(location.search);
    if (params.get("topup") === "success") {
      open(); setMsg(T.topupOk, "ok");
      setTimeout(refresh, 2500); setTimeout(refresh, 6000);
      history.replaceState({}, "", location.pathname);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
