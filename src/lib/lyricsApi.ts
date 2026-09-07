// Spotify's Web API does not provide lyrics. Lyricly uses LRCLIB
// (https://lrclib.net), a free, open, no-auth-required synced lyrics
// database, which is well suited to an open-source project.

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsResult {
  synced: LyricLine[] | null; // null if only plain (unsynced) lyrics exist
  plain: string | null;
}

const LRCLIB_ENDPOINT = "https://lrclib.net/api/get";

export async function fetchLyrics(params: {
  trackName: string;
  artistName: string;
  albumName?: string;
  durationSec?: number;
}): Promise<LyricsResult | null> {
  const url = new URL(LRCLIB_ENDPOINT);
  url.searchParams.set("track_name", params.trackName);
  url.searchParams.set("artist_name", params.artistName);
  if (params.albumName) url.searchParams.set("album_name", params.albumName);
  if (params.durationSec) url.searchParams.set("duration", String(params.durationSec));

  const res = await fetch(url.toString());

  // LRCLIB's exact lookup can miss otherwise valid entries when an album,
  // duration, remix label, or other metadata differs from Spotify's values.
  // Fall back to LRCLIB's search endpoint using only artist + track so those
  // songs still have a chance to resolve.
  if (res.status === 404) {
    return fetchLyricsBySearch(params.trackName, params.artistName);
  }
  if (!res.ok) throw new Error(`LRCLIB error: ${res.status}`);

  const json = await res.json();
  const exact = normalizeLyricsResult(json);
  if (exact.synced || exact.plain) return exact;

  return fetchLyricsBySearch(params.trackName, params.artistName);
}

function normalizeLyricsResult(json: any): LyricsResult {
  return {
    synced: json?.syncedLyrics ? parseLrc(json.syncedLyrics) : null,
    plain: json?.plainLyrics ?? null,
  };
}

async function fetchLyricsBySearch(trackName: string, artistName: string): Promise<LyricsResult | null> {
  const searchUrl = new URL("https://lrclib.net/api/search");
  searchUrl.searchParams.set("q", `${artistName} ${trackName}`.trim());

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    if (searchRes.status === 404) return null;
    throw new Error(`LRCLIB search error: ${searchRes.status}`);
  }

  const results = await searchRes.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const normalizedArtist = artistName.trim().toLowerCase();
  const normalizedTrack = trackName.trim().toLowerCase();

  const ranked = [...results].sort((a: any, b: any) => {
    const score = (item: any) => {
      const title = String(item?.trackName ?? item?.name ?? "").trim().toLowerCase();
      const artist = String(item?.artistName ?? "").trim().toLowerCase();
      let value = 0;
      if (title === normalizedTrack) value += 4;
      else if (title.includes(normalizedTrack) || normalizedTrack.includes(title)) value += 2;
      if (artist === normalizedArtist) value += 4;
      else if (artist.includes(normalizedArtist) || normalizedArtist.includes(artist)) value += 2;
      if (item?.syncedLyrics) value += 3;
      if (item?.plainLyrics) value += 1;
      return value;
    };
    return score(b) - score(a);
  });

  for (const result of ranked) {
    const normalized = normalizeLyricsResult(result);
    if (normalized.synced?.length || normalized.plain) return normalized;
  }

  return null;
}

/** Parses standard LRC timestamp format: [mm:ss.xx]Line text */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timeTag = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const rawLine of lrc.split("\n")) {
    const matches = [...rawLine.matchAll(timeTag)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(timeTag, "").trim();
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const fraction = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
      const timeMs = minutes * 60_000 + seconds * 1000 + fraction;
      lines.push({ timeMs, text });
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Returns the index of the line that should be highlighted for a given progress. */
export function findActiveLineIndex(lines: LyricLine[], progressMs: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= progressMs) active = i;
    else break;
  }
  return active;
}
