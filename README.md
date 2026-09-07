# Lyricly 🎵

A lightweight, customizable Spotify overlay that shows real-time synced lyrics
on top of any window — games, browsers, whatever — so you can sing along
without alt-tabbing.

## Why Tauri instead of Electron

For an always-on-top, draggable, click-through overlay, **Tauri** is the
better fit than Electron:

| | Tauri | Electron |
|---|---|---|
| Bundle size | ~3–10 MB | ~80–150 MB |
| Memory (idle overlay) | ~40–80 MB | ~150–300 MB |
| Native window transparency/click-through | Built-in, native | Built-in, native |
| Frontend | Any web framework (we use React) | Any web framework |
| Backend | Rust (small, sandboxed) | Node.js (full runtime) |

Since Lyricly is just a thin overlay that's meant to sit on screen all the
time, Tauri's much smaller footprint and native (not Chromium) webview matter
a lot more here than Electron's slightly more mature overlay APIs.

## Stack

- **Shell / windowing:** Tauri 2 (Rust)
- **UI:** React 18 + TypeScript, Vite
- **State:** Zustand (persisted to disk for settings)
- **Spotify auth:** OAuth 2.0 Authorization Code + PKCE (no client secret needed —
  safe for an open-source app)
- **Now playing:** Spotify Web API (`/me/player/currently-playing`, polled)
- **Lyrics:** [LRCLIB](https://lrclib.net) — free, open, no API key required,
  returns synced `.lrc` lyrics. (Spotify's own Web API does not expose lyrics.)

## Project layout

```
lyricly/
├── src/                        # React frontend
│   ├── components/
│   │   ├── LoginScreen.tsx
│   │   ├── LyricsOverlay.tsx   # animated synced-lyrics display
│   │   └── SettingsPanel.tsx   # size/color/font/click-through controls
│   ├── hooks/
│   │   ├── useCurrentTrack.ts  # polls Spotify, interpolates progress at 60fps
│   │   └── useLyrics.ts        # fetches + caches lyrics per track
│   ├── lib/
│   │   ├── pkce.ts             # PKCE verifier/challenge generation
│   │   ├── spotifyAuth.ts      # login flow, token storage/refresh
│   │   ├── spotifyApi.ts       # currently-playing fetch
│   │   ├── lyricsApi.ts        # LRCLIB fetch + LRC parser
│   │   └── store.ts            # persisted overlay settings (Zustand)
│   └── App.tsx
└── src-tauri/                  # Rust backend
    ├── src/
    │   ├── main.rs             # commands, global shortcut setup
    │   └── oauth_server.rs     # loopback HTTP server for the OAuth redirect
    ├── capabilities/default.json
    └── tauri.conf.json         # transparent, undecorated, always-on-top window
```

## How dragging, transparency, and click-through work

- **Dragging:** the outer `<div data-tauri-drag-region>` in `App.tsx` — Tauri
  turns any element with that attribute into a native drag handle automatically.
  No settings menu needs to be open first.
- **Transparency:** `"transparent": true` + `"decorations": false` in
  `tauri.conf.json`, with a transparent `<body>` in CSS. Only the rounded,
  semi-opaque panel you paint in React is visible.
- **Click-through:** `getCurrentWindow().setIgnoreCursorEvents(true)` (called
  from the settings panel). Because this makes the *whole* window ignore
  clicks — including the settings button — there's also a global OS-level
  shortcut, **Ctrl/Cmd+Shift+L**, registered in `main.rs` via
  `tauri-plugin-global-shortcut`, that toggles it back off from anywhere.

## Setup

### 1. Spotify Developer Dashboard

1. Go to https://developer.spotify.com/dashboard and open (or create) your app.
2. Add this exact Redirect URI: `http://127.0.0.1:8888/callback`
3. Your Client ID is already wired up in `src/lib/spotifyAuth.ts`
   (`7073a547b00546f2aa5ce7ea1c5bbb89`). Swap it for your own if you fork this.

### 2. Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Tauri's platform prerequisites: https://v2.tauri.app/start/prerequisites/
  (on Windows: WebView2 + MSVC build tools; on macOS: Xcode command line tools)

### 3. Install & run

```bash
npm install
npm run tauri dev
```

### 4. Generate real app icons before shipping a build

The `src-tauri/icons/` folder ships with a simple placeholder icon. Replace
`icons/icon.png` with your real 1024×1024 logo and regenerate the full,
correctly-formatted icon set (including macOS `.icns`) with:

```bash
npx tauri icon src-tauri/icons/icon.png
```

### 5. Build installers

```bash
npm run tauri build
```

Produces a `.msi`/`.exe` on Windows and a `.dmg`/`.app` on macOS, in
`src-tauri/target/release/bundle/`.

## Roadmap

- [x] PKCE Spotify login + loopback callback server
- [x] Polling now-playing + 60fps progress interpolation
- [x] Synced lyrics via LRCLIB with animated line transitions
- [x] Draggable, transparent, undecorated overlay window
- [x] Settings panel: size, colors, opacity, font size, alignment
- [x] Click-through mode with global shortcut escape hatch
- [ ] System tray icon with quick toggles (show/hide, click-through)
- [ ] Multiple saved layout presets
- [ ] Lyrics caching to disk (avoid re-fetching on repeat listens)
- [ ] Fallback lyrics source if LRCLIB has no match
- [ ] Auto-updater (`tauri-plugin-updater`)
- [ ] Linux support pass (X11/Wayland click-through has quirks worth testing)

## Notes on the Spotify integration

- Spotify's Web API has no `/lyrics` endpoint, so lyrics come from LRCLIB
  based on track/artist/album metadata. Obscure or regionally-renamed tracks
  may occasionally not match — the overlay shows a "no lyrics found" state
  rather than failing silently.
- Currently-playing is polled once per second (Spotify's rate limits are
  generous for this), then interpolated every frame client-side so the
  highlighted line moves smoothly instead of jumping once a second.
- This app only requests `user-read-currently-playing` and
  `user-read-playback-state` — it can't modify playback, playlists, or
  anything else in your account.

## License

MIT — see [LICENSE](./LICENSE).
