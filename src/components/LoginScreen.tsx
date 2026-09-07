import { useState } from "react";
import { loginWithSpotify } from "../lib/spotifyAuth";

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      await loginWithSpotify();
      onLoggedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-tauri-drag-region
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "rgba(10,10,14,0.75)",
        borderRadius: 14,
        color: "#fff",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>Lyricly</div>
      <button
        onClick={handleLogin}
        disabled={busy}
        style={{
          background: "#1DB954",
          color: "#04140b",
          fontWeight: 600,
          padding: "8px 18px",
          borderRadius: 999,
          fontSize: 13,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Waiting for Spotify…" : "Connect Spotify"}
      </button>
      {error && (
        <div style={{ fontSize: 11, color: "#ff8080", maxWidth: 260, textAlign: "center" }}>
          {error}
        </div>
      )}
    </div>
  );
}
