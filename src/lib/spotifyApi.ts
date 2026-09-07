import { getValidAccessToken } from "./spotifyAuth";

export interface CurrentTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  fetchedAt: number;
}

async function spotifyRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Spotify is not connected.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`https://api.spotify.com/v1${path}`, { ...init, headers });
}

export async function fetchCurrentlyPlaying(): Promise<CurrentTrack | null> {
  const res = await spotifyRequest("/me/player/currently-playing");
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);

  const json = await res.json();
  if (!json || !json.item) return null;

  return {
    id: json.item.id,
    name: json.item.name,
    artists: (json.item.artists ?? []).map((a: { name: string }) => a.name),
    album: json.item.album?.name ?? "",
    durationMs: json.item.duration_ms,
    progressMs: json.progress_ms ?? 0,
    isPlaying: json.is_playing,
    fetchedAt: Date.now(),
  };
}

