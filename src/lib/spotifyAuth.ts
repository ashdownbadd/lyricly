import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce";

// ---- Configuration -------------------------------------------------------
// This Client ID is safe to ship publicly: PKCE flows never require a
// client secret. Replace it with your own app's Client ID if you fork this.
export const SPOTIFY_CLIENT_ID = "7073a547b00546f2aa5ce7ea1c5bbb89";

// Must be added *exactly* (including the port) under "Redirect URIs" in
// your Spotify Developer Dashboard app settings.
export const REDIRECT_URI = "http://127.0.0.1:8888/callback";
export const CALLBACK_PORT = 8888;

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";

const STORAGE_KEY = "lyricly.spotify.tokens";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

export function getStoredTokens(): StoredTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function storeTokens(tokens: StoredTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Kicks off the full login flow:
 * 1. Ask Rust to start listening on the loopback callback port.
 * 2. Open the Spotify authorize URL in the user's system browser.
 * 3. Wait for Rust to emit the "oauth-code-received" event once Spotify
 *    redirects back with an authorization code.
 * 4. Exchange the code (+ PKCE verifier) for an access/refresh token pair.
 */
export async function loginWithSpotify(): Promise<StoredTokens> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  // Start the local callback server (implemented in Rust, see oauth_server.rs)
  await invoke("start_oauth_server", { port: CALLBACK_PORT });

  const authUrl = new URL(AUTHORIZE_ENDPOINT);
  authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);

  await invoke("open_url", { url: authUrl.toString() });

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unlisten.then((u) => u());
      reject(new Error("Login timed out waiting for Spotify redirect."));
    }, 120_000);

    const unlisten = listen<string>("oauth-code-received", (event) => {
      clearTimeout(timeout);
      unlisten.then((u) => u());
      resolve(event.payload);
    });
  });

  const tokens = await exchangeCodeForTokens(code, verifier);
  storeTokens(tokens);
  return tokens;
}

async function exchangeCodeForTokens(
  code: string,
  verifier: string
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
}

async function refreshTokens(refresh_token: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const tokens: StoredTokens = {
    access_token: json.access_token,
    // Spotify doesn't always return a new refresh_token; keep the old one.
    refresh_token: json.refresh_token ?? refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  storeTokens(tokens);
  return tokens;
}

/**
 * Returns a valid access token, transparently refreshing it if it's
 * expired (or about to expire). Returns null if the user isn't logged in.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  const isExpiringSoon = Date.now() > tokens.expires_at - 30_000;
  if (!isExpiringSoon) return tokens.access_token;

  try {
    const refreshed = await refreshTokens(tokens.refresh_token);
    return refreshed.access_token;
  } catch {
    clearTokens();
    return null;
  }
}

export function logout() {
  clearTokens();
}
