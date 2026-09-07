import { useEffect, useRef, useState } from "react";
import { fetchCurrentlyPlaying, CurrentTrack } from "../lib/spotifyApi";

const POLL_INTERVAL_MS = 1000;

/**
 * Polls Spotify for the currently playing track and returns a live,
 * frame-accurate progress value by interpolating between polls
 * (Spotify's API is not sub-second accurate on its own).
 */
export function useCurrentTrack(isAuthenticated: boolean) {
  const [track, setTrack] = useState<CurrentTrack | null>(null);
  const [liveProgressMs, setLiveProgressMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const trackRef = useRef<CurrentTrack | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function poll() {
      try {
        const current = await fetchCurrentlyPlaying();
        if (cancelled) return;
        trackRef.current = current;
        setTrack(current);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Smooth 60fps progress interpolation between polls
  useEffect(() => {
    let raf: number;

    function tick() {
      const t = trackRef.current;
      if (t && t.isPlaying) {
        const elapsed = Date.now() - t.fetchedAt;
        setLiveProgressMs(Math.min(t.progressMs + elapsed, t.durationMs));
      } else if (t) {
        setLiveProgressMs(t.progressMs);
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { track, liveProgressMs, error };
}
