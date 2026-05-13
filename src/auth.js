// InsForge auth wiring.
// The web SDK handles refresh-cookie based session restore on its own; we also
// stash the access token in localStorage under `insforge_session` per the
// orchestrator spec so that direct fetches (e.g. to edge functions) can attach
// `Authorization: Bearer <token>` without re-asking the SDK.
import { createClient } from "@insforge/sdk";

const baseUrl =
  import.meta.env.VITE_INSFORGE_URL ||
  "https://g9jy59jq.us-west.insforge.app";

const anonKey =
  import.meta.env.VITE_INSFORGE_ANON_KEY ||
  "ik_5f58db3f16a45a70a0f620d70178b5fe";

export const SESSION_KEY = "insforge_session";

let _client = null;

function readStoredToken() {
  try {
    return window.localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredAccessToken() {
  return readStoredToken();
}

function writeStoredToken(token) {
  try {
    if (token) window.localStorage.setItem(SESSION_KEY, token);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function getInsforgeClient() {
  if (_client) return _client;
  const token = readStoredToken();
  _client = createClient({
    baseUrl,
    anonKey,
    ...(token ? { edgeFunctionToken: token } : {}),
  });
  return _client;
}

// Force the client to be rebuilt on next access (after login/logout).
function resetClient() {
  _client = null;
}

function extractToken(data) {
  if (!data) return null;
  return data.accessToken || data.access_token || data.session?.accessToken || null;
}

export async function signUp({ email, password, name }) {
  const client = getInsforgeClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    ...(name ? { name } : {}),
  });
  if (error) return { ok: false, error };
  const token = extractToken(data);
  if (token) {
    writeStoredToken(token);
    resetClient();
  }
  return {
    ok: true,
    requireEmailVerification: Boolean(data?.requireEmailVerification),
    verifyEmailMethod: data?.verifyEmailMethod || null,
    user: data?.user || null,
    token,
  };
}

// Verify an emailed 6-digit signup code. Returns { ok, user, token } on
// success and { ok:false, error } otherwise. On success the access token is
// persisted exactly as in signIn so the rest of the app can continue.
export async function verifyEmailCode({ email, code }) {
  const client = getInsforgeClient();
  // Probe the SDK shape — the @insforge/sdk version in package.json exposes
  // `verifyEmail({ email, otp })` but we fall back to a few plausible
  // alternates and finally a raw REST POST so we don't break on minor
  // version bumps.
  const candidates = [
    () => client.auth.verifyEmail?.({ email, otp: code }),
    () => client.auth.verifyEmailWithCode?.({ email, code }),
    () => client.auth.verifyOtp?.({ email, token: code, type: "signup" }),
    () => client.auth.verifyCode?.({ email, code }),
  ];
  let lastErr = null;
  for (const call of candidates) {
    try {
      const result = call();
      if (!result) continue;
      const { data, error } = await result;
      if (error) {
        lastErr = error;
        // Likely "wrong code" — bail out without trying other names.
        if (error.code || error.status >= 400) break;
        continue;
      }
      const token = extractToken(data);
      if (token) {
        writeStoredToken(token);
        resetClient();
      }
      return { ok: true, user: data?.user || null, token };
    } catch (e) {
      lastErr = e;
    }
  }
  // Final fallback: hit the documented REST endpoint directly.
  try {
    const response = await fetch(`${baseUrl}/api/auth/email/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anonKey,
      },
      body: JSON.stringify({ email, otp: code }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: payload?.error || { message: payload?.message || "Verification failed." } };
    }
    const token = extractToken(payload);
    if (token) {
      writeStoredToken(token);
      resetClient();
    }
    return { ok: true, user: payload?.user || null, token };
  } catch (e) {
    return { ok: false, error: lastErr || { message: e?.message || "Verification failed." } };
  }
}

// Re-send a verification email/code. Falls back across SDK shapes.
export async function resendVerificationCode({ email }) {
  const client = getInsforgeClient();
  const candidates = [
    () => client.auth.resendVerificationEmail?.({ email }),
    () => client.auth.resendVerificationCode?.({ email }),
    () => client.auth.sendVerificationEmail?.({ email }),
  ];
  for (const call of candidates) {
    try {
      const result = call();
      if (!result) continue;
      const { error } = await result;
      if (error) return { ok: false, error };
      return { ok: true };
    } catch {
      /* try the next candidate */
    }
  }
  // REST fallback
  try {
    const response = await fetch(`${baseUrl}/api/auth/email/send-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anonKey,
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return { ok: false, error: payload?.error || { message: "Could not resend code." } };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: { message: e?.message || "Could not resend code." } };
  }
}

export async function signIn({ email, password }) {
  const client = getInsforgeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { ok: false, error };
  const token = extractToken(data);
  if (token) {
    writeStoredToken(token);
    resetClient();
  }
  return { ok: true, user: data?.user || null, token };
}

// InsForge OAuth uses a PKCE flow with these specific endpoints:
//   GET  /api/auth/oauth/google   (with redirect_uri + code_challenge query)
//   POST /api/auth/oauth/exchange (body: {code, code_verifier})
//
// Earlier revisions implemented this manually with raw fetch + localStorage so
// behavior wouldn't depend on the SDK version. That broke the post-callback
// session: after the manual exchange we wrote the access token to
// localStorage but the SDK's in-memory tokenManager was never told. On the
// freshly-loaded callback page, `auth.getCurrentUser()` saw an empty session,
// fell back to `refreshSession()` over the httpOnly refresh cookie, and that
// cookie didn't survive the cross-site context (g9jy59jq.us-west.insforge.app
// → ants.ceo) — so getCurrentUser returned null, our wrapper wiped the token,
// and the protected-route gate bounced the user back to /#login.
//
// Fix: drive both the start and the callback through the SDK. The SDK's
// `signInWithOAuth` stores the PKCE verifier in sessionStorage and redirects
// to Google for us, and its `detectAuthCallback` (which runs on first
// construction of the Auth module) consumes `?insforge_code=…` automatically,
// posting to /api/auth/oauth/exchange AND populating the tokenManager so
// `getCurrentUser` works on the next call without depending on cross-site
// refresh cookies.
const PKCE_REDIRECT_KEY = "insforge_pkce_redirect_to";

export async function signInWithGoogle({ redirectTo } = {}) {
  const target =
    redirectTo ||
    (typeof window !== "undefined" ? `${window.location.origin}/` : undefined);
  if (!target) {
    return { ok: false, error: { message: "Cannot start OAuth outside the browser." } };
  }
  // Remember where the user wanted to land after sign-in. The SDK's PKCE
  // verifier already rides in sessionStorage; this is just for hash routing.
  try { localStorage.setItem(PKCE_REDIRECT_KEY, target); } catch { /* ignore */ }

  const client = getInsforgeClient();
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      redirectTo: target,
    });
    if (error) {
      return { ok: false, error };
    }
    // On success the SDK has redirected us to Google.
    return { ok: true, redirected: true };
  } catch (e) {
    return { ok: false, error: { message: e?.message || "OAuth start request failed" } };
  }
}

// Detect whether the current URL still carries OAuth callback markers (so the
// caller can hold the UI in a "loading" state until consumeOAuthRedirect()
// resolves). Cheap, no side effects.
export function hasOAuthCallbackInUrl() {
  if (typeof window === "undefined") return false;
  // InsForge uses `insforge_code` as the canonical PKCE callback param.
  return /[?&#](insforge_code|code|access_token|refresh_token|provider_token)=/.test(window.location.href);
}

// Drain any OAuth callback params from the URL into the SDK session, mirror
// the resulting access token into our localStorage shim (so direct edge
// function fetches can attach `Authorization: Bearer …`), and clean up the
// URL so a refresh doesn't re-trigger the exchange.
//
// The actual PKCE exchange is performed by the SDK's `detectAuthCallback`
// (kicked off in the Auth constructor) — we just await it, then snapshot the
// session token.
//
// Safe to call unconditionally on mount.
export async function consumeOAuthRedirect() {
  if (typeof window === "undefined") return null;
  const href = window.location.href;
  if (!/[?&#](insforge_code|code|access_token|refresh_token|provider_token)=/.test(href)) {
    return null;
  }

  // Force the SDK to instantiate so its constructor-time `detectAuthCallback`
  // runs (it reads `insforge_code` from the URL, posts to /api/auth/oauth/
  // exchange with the sessionStorage verifier, saves the session to the
  // in-memory tokenManager, and strips the param via replaceState).
  const client = getInsforgeClient();
  try {
    // The SDK assigns the in-flight callback promise to `authCallbackHandled`
    // — `getCurrentUser` awaits it internally, so calling it here is the
    // simplest way to block until the exchange completes.
    const { data, error } = await client.auth.getCurrentUser();
    let token = null;
    let exchangedUser = data?.user || null;
    if (!error && data?.user) {
      // Pull the access token the SDK now has so direct fetches can use it.
      // The SDK doesn't expose tokenManager publicly, so we go through the
      // HTTP headers. Fall back gracefully if shape changes.
      try {
        const headers = client.auth?.http?.getHeaders?.()
          || client?.http?.getHeaders?.()
          || {};
        const authH = headers.Authorization || headers.authorization;
        if (authH && typeof authH === "string" && authH.startsWith("Bearer ")) {
          token = authH.slice(7);
        }
      } catch { /* fall through */ }
    }
    if (token) {
      writeStoredToken(token);
      // Don't resetClient() — the SDK we just used IS the one carrying the
      // session in-memory. Building a fresh client would drop it.
    }

    // Restore the saved post-login route fragment.
    let postLoginRoute = null;
    try { postLoginRoute = localStorage.getItem(PKCE_REDIRECT_KEY); } catch {}
    try { localStorage.removeItem(PKCE_REDIRECT_KEY); } catch {}
    if (postLoginRoute) {
      try {
        const targetUrl = new URL(postLoginRoute);
        const url = new URL(window.location.href);
        const finalHash = targetUrl.hash || (token ? "#share-info" : "");
        // SDK's cleanUrlParams already stripped insforge_code, but also clear
        // any straggler OAuth-ish params that may have hitched along.
        ["code", "state", "access_token", "refresh_token", "provider_token", "token_type", "expires_in", "expires_at"]
          .forEach((k) => url.searchParams.delete(k));
        const cleanedSearch = url.searchParams.toString() ? "?" + url.searchParams.toString() : "";
        const newUrl = url.origin + url.pathname + cleanedSearch + finalHash;
        window.history.replaceState({}, "", newUrl);
      } catch {
        /* leave URL as the SDK left it */
      }
    }

    return token ? { token, user: exchangedUser } : (exchangedUser ? { token: null, user: exchangedUser } : null);
  } catch (e) {
    try { console.warn("[auth] consumeOAuthRedirect threw", e); } catch {}
    return null;
  }
}

export async function signOut() {
  const client = getInsforgeClient();
  try {
    await client.auth.signOut();
  } catch {
    /* ignore network errors on sign out */
  }
  writeStoredToken(null);
  resetClient();
}

export async function getCurrentUser() {
  const client = getInsforgeClient();
  try {
    const { data, error } = await client.auth.getCurrentUser();
    if (error || !data?.user) {
      // Only wipe the stored token if the server explicitly told us the
      // session is bad (401/403 / invalid token). Transient network errors
      // (5xx, fetch aborts) shouldn't sign the user out — that's what was
      // causing the OAuth bounce when refresh-cookie retrieval failed
      // intermittently or when called before the SDK's in-memory session
      // had finished hydrating.
      const code = error?.statusCode ?? error?.status;
      if (code === 401 || code === 403) {
        writeStoredToken(null);
        resetClient();
      }
      return null;
    }
    return data.user;
  } catch (e) {
    // Same here: don't wipe on a network/throw — let the next call retry.
    const code = e?.statusCode ?? e?.status;
    if (code === 401 || code === 403) {
      writeStoredToken(null);
      resetClient();
    }
    return null;
  }
}

export function hasStoredSession() {
  return Boolean(readStoredToken());
}

export async function getCreatorProfile() {
  const client = getInsforgeClient();
  try {
    const { data, error } = await client.auth.getCurrentUser();
    if (error || !data?.user) return { ok: false, error: error || { message: "Not signed in." } };
    return { ok: true, profile: data.user.profile || {}, user: data.user };
  } catch (e) {
    return { ok: false, error: { message: e?.message || "Could not load profile." } };
  }
}

const ANALYSIS_FUNCTION_URL =
  import.meta.env.VITE_INSFORGE_ANALYSIS_FUNCTION_URL ||
  "https://g9jy59jq.functions.insforge.app/viewlytics-analysis";

export async function scrapeSocialProfile({ platform, handle }) {
  try {
    const response = await fetch(`${ANALYSIS_FUNCTION_URL.replace(/\/$/, "")}/profile-scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, handle }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || { code: "PLATFORM_ERROR", message: `Scrape failed (${response.status})` } };
    }
    return { ok: true, profile: payload.profile, cached: Boolean(payload.cached) };
  } catch (e) {
    return { ok: false, error: { code: "PLATFORM_ERROR", message: e?.message || "Network error" } };
  }
}

export async function listAnalysisHistory() {
  const token = readStoredToken();
  if (!token) return { ok: false, error: { message: "Sign in to view your history." } };
  try {
    const response = await fetch(`${ANALYSIS_FUNCTION_URL.replace(/\/$/, "")}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || { message: `History fetch failed (${response.status})` } };
    }
    return { ok: true, runs: payload.runs || [] };
  } catch (e) {
    return { ok: false, error: { message: e?.message || "Network error" } };
  }
}

export async function loadAnalysisRun(runId) {
  const token = readStoredToken();
  if (!token) return { ok: false, error: { message: "Sign in to load past runs." } };
  try {
    const response = await fetch(`${ANALYSIS_FUNCTION_URL.replace(/\/$/, "")}/run/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || { message: `Run fetch failed (${response.status})` } };
    }
    return { ok: true, run: payload.run };
  } catch (e) {
    return { ok: false, error: { message: e?.message || "Network error" } };
  }
}

export async function saveCreatorProfile(profile) {
  const client = getInsforgeClient();
  const payload = {
    tiktok_url: String(profile?.tiktok_url || "").trim(),
    instagram_url: String(profile?.instagram_url || "").trim(),
    company_site_url: String(profile?.company_site_url || "").trim(),
    creator_info_confirmed_at: profile?.creator_info_confirmed_at || new Date().toISOString(),
  };
  try {
    const { data, error } = await client.auth.setProfile(payload);
    if (error) return { ok: false, error };
    return { ok: true, profile: data || payload };
  } catch (e) {
    return { ok: false, error: { message: e?.message || "Could not save creator info." } };
  }
}
