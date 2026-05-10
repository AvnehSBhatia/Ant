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
    user: data?.user || null,
    token,
  };
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
