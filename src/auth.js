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
