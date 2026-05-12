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
// We implement it manually via REST so behavior doesn't depend on which SDK
// version is shipped.
const PKCE_STORAGE_KEY = "insforge_pkce_verifier";
const PKCE_REDIRECT_KEY = "insforge_pkce_redirect_to";

function _base64UrlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function _generatePkceVerifier() {
  const buf = new Uint8Array(64);
  crypto.getRandomValues(buf);
  return _base64UrlEncode(buf);
}

async function _pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return _base64UrlEncode(new Uint8Array(hashBuf));
}

export async function signInWithGoogle({ redirectTo } = {}) {
  const target =
    redirectTo ||
    (typeof window !== "undefined" ? `${window.location.origin}/` : undefined);
  if (!target) {
    return { ok: false, error: { message: "Cannot start OAuth outside the browser." } };
  }

  // 1. Generate the PKCE pair.
  let verifier, challenge;
  try {
    verifier = _generatePkceVerifier();
    challenge = await _pkceChallenge(verifier);
  } catch (e) {
    return { ok: false, error: { message: "Could not generate PKCE: " + (e?.message || e) } };
  }

  // 2. Stash the verifier + the final landing route so the callback handler
  //    can finish the exchange and route the user where they want to go.
  try {
    localStorage.setItem(PKCE_STORAGE_KEY, verifier);
    localStorage.setItem(PKCE_REDIRECT_KEY, target);
  } catch {
    /* ignore — exchange may still work if verifier survives sessionStorage */
  }

  // 3. Ask InsForge for the Google authorization URL.
  const startUrl =
    `${baseUrl}/api/auth/oauth/google?` +
    new URLSearchParams({ redirect_uri: target, code_challenge: challenge }).toString();
  try {
    const resp = await fetch(startUrl, {
      method: "GET",
      headers: { "x-api-key": anonKey, Accept: "application/json" },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => null);
      return {
        ok: false,
        error: err?.error || { message: `OAuth start failed (${resp.status})` },
      };
    }
    const data = await resp.json().catch(() => null);
    const authUrl = data?.authUrl || data?.url;
    if (!authUrl) {
      return { ok: false, error: { message: "OAuth start: no authUrl in response" } };
    }
    window.location.href = authUrl;
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

// Pull OAuth tokens / codes out of the URL the browser landed on after the
// OAuth provider redirect, hand them to the SDK (or exchange via REST), store
// the resulting access token, and clean the URL so a refresh doesn't re-trigger.
// Safe to call unconditionally on mount — returns null if there's nothing to do.
export async function consumeOAuthRedirect() {
  if (typeof window === "undefined") return null;
  const href = window.location.href;
  try { console.debug("[auth] consumeOAuthRedirect href=", href); } catch {}
  if (!/[?&#](insforge_code|code|access_token|refresh_token|provider_token)=/.test(href)) {
    try { console.debug("[auth] consumeOAuthRedirect: no OAuth params in URL"); } catch {}
    return null;
  }

  const url = new URL(href);
  const search = url.searchParams;
  // The hash may be `#dashboard?...` (route + params) or just `?...`. Split it.
  const rawHash = url.hash.replace(/^#/, "");
  let routeHash = rawHash;
  let hashParamsStr = "";
  const split = rawHash.search(/[?&]/);
  if (split !== -1) {
    routeHash = rawHash.slice(0, split);
    hashParamsStr = rawHash.slice(split + 1);
  } else if (/^(access_token|refresh_token|provider_token|insforge_code|code)=/.test(rawHash)) {
    routeHash = "";
    hashParamsStr = rawHash;
  }
  const hash = new URLSearchParams(hashParamsStr);

  // InsForge canonical name is `insforge_code`. Fall back to `code` for tolerance.
  const code =
    search.get("insforge_code") || hash.get("insforge_code") ||
    search.get("code") || hash.get("code");
  const accessToken =
    search.get("access_token") || hash.get("access_token");
  const refreshToken =
    search.get("refresh_token") || hash.get("refresh_token");

  let token = accessToken || null;
  let exchangedUser = null;

  // Direct-token flow (rare with InsForge but supported).
  if (token) {
    try {
      const client = getInsforgeClient();
      const r =
        client.auth.setSession?.({ access_token: token, refresh_token: refreshToken || "" }) ||
        client.auth.setSession?.({ accessToken: token, refreshToken: refreshToken || "" });
      if (r) await r;
    } catch { /* ignore */ }
  }

  // PKCE flow: exchange the code with the stored verifier.
  if (!token && code) {
    let verifier = null;
    try { verifier = localStorage.getItem(PKCE_STORAGE_KEY); } catch { /* ignore */ }
    if (!verifier) {
      try { console.debug("[auth] missing PKCE verifier — cannot exchange code"); } catch {}
    } else {
      try {
        const resp = await fetch(`${baseUrl}/api/auth/oauth/exchange?client_type=web`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anonKey,
            Accept: "application/json",
          },
          credentials: "include", // accept the httpOnly refresh cookie even though we don't read it
          body: JSON.stringify({ code, code_verifier: verifier }),
        });
        const body = await resp.json().catch(() => null);
        try {
          console.debug("[auth] exchange status=", resp.status, "body=", body);
        } catch {}
        if (resp.ok) {
          token = body?.accessToken || body?.access_token || null;
          exchangedUser = body?.user || null;
          // Verifier is single-use.
          try { localStorage.removeItem(PKCE_STORAGE_KEY); } catch {}
        }
      } catch (e) {
        try { console.warn("[auth] exchange threw", e); } catch {}
      }
    }
  }

  if (token) {
    writeStoredToken(token);
    resetClient();
  }

  // Strip OAuth params + restore the saved post-login route fragment.
  ["insforge_code", "code", "state", "access_token", "refresh_token", "provider_token", "token_type", "expires_in", "expires_at"]
    .forEach((k) => search.delete(k));
  // Honor where the user originally wanted to land.
  let postLoginRoute = null;
  try { postLoginRoute = localStorage.getItem(PKCE_REDIRECT_KEY); } catch {}
  try { localStorage.removeItem(PKCE_REDIRECT_KEY); } catch {}
  let finalHash = routeHash ? "#" + routeHash : "";
  if (token && postLoginRoute) {
    try {
      const r = new URL(postLoginRoute);
      finalHash = r.hash || "#dashboard";
    } catch {
      finalHash = "#dashboard";
    }
  }
  const cleanedSearch = search.toString() ? "?" + search.toString() : "";
  const newUrl = url.origin + url.pathname + cleanedSearch + finalHash;
  try { window.history.replaceState({}, "", newUrl); } catch {}

  return token ? { token, user: exchangedUser } : null;
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
      writeStoredToken(null);
      resetClient();
      return null;
    }
    return data.user;
  } catch {
    writeStoredToken(null);
    resetClient();
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
