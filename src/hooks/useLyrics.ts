import { useEffect, useState } from "react";
import { CurrentTrack } from "../lib/spotifyApi";
import { fetchLyrics, LyricLine } from "../lib/lyricsApi";

export function useLyrics(track: CurrentTrack | null) {
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!track) {
      setLines(null);
      setPlain(null);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    fetchLyrics({
      trackName: track.name,
      artistName: track.artists[0] ?? "",
      albumName: track.album,
      durationSec: Math.round(track.durationMs / 1000),
    })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setLines(null);
          setPlain(null);
          setNotFound(true);
        } else {
          setLines(result.synced);
          setPlain(result.plain);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch only when the track identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  return { lines, plain, loading, notFound };
}
