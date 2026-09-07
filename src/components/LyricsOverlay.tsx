import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CurrentTrack } from "../lib/spotifyApi";
import { LyricLine, findActiveLineIndex } from "../lib/lyricsApi";
import { usePositionStore, useSettingsStore } from "../lib/store";

interface Props {
  track: CurrentTrack | null;
  liveProgressMs: number;
  lines: LyricLine[] | null;
  plain: string | null;
  loading: boolean;
  notFound: boolean;
}

const MIN_DYNAMIC_WIDTH = 280;
const MAX_DYNAMIC_WIDTH = 1200;
const MIN_DYNAMIC_HEIGHT = 45;
const MAX_DYNAMIC_HEIGHT = 600;
const HORIZONTAL_PADDING = 40;

function rgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const value = parseInt(clean, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function LyricsOverlay({ track, liveProgressMs, lines, plain, loading, notFound }: Props) {
  const settings = useSettingsStore();
  const measureRef = useRef<HTMLDivElement>(null);
  const layoutMeasureRef = useRef<HTMLDivElement>(null);
  const lastAppliedSizeRef = useRef({ width: 0, height: 0 });
  const [autoWidth, setAutoWidth] = useState(680);
  const activeIndex = track && lines?.length ? Math.max(0, findActiveLineIndex(lines, liveProgressMs)) : -1;

  // Determine the width from the longest lyric line at the current font size.
  // The width is capped so an unusually long lyric does not create an
  // enormous overlay; such lines will wrap inside that maximum width.
  useEffect(() => {
    if (!lines?.length || !measureRef.current) return;

    const nodes = Array.from(measureRef.current.querySelectorAll<HTMLElement>("[data-measure-line]"));
    if (!nodes.length) return;

    let maxWidth = 0;
    for (const node of nodes) {
      maxWidth = Math.max(maxWidth, Math.ceil(node.getBoundingClientRect().width));
    }

    const targetWidth = clamp(maxWidth + HORIZONTAL_PADDING, MIN_DYNAMIC_WIDTH, MAX_DYNAMIC_WIDTH);
    setAutoWidth((current) => current === targetWidth ? current : targetWidth);
  }, [lines, settings.fontSize]);

  // Measure the actual three-line layout at the calculated width. This makes
  // the native window tall enough for large fonts and wrapped lyric lines.
  useEffect(() => {
    if (!lines?.length || !layoutMeasureRef.current) return;

    const host = layoutMeasureRef.current;
    const targetHeight = clamp(Math.ceil(host.scrollHeight), MIN_DYNAMIC_HEIGHT, MAX_DYNAMIC_HEIGHT);
    const targetWidth = autoWidth;

    if (lastAppliedSizeRef.current.width === targetWidth && lastAppliedSizeRef.current.height === targetHeight) return;
    lastAppliedSizeRef.current = { width: targetWidth, height: targetHeight };

    const resize = async () => {
      try {
        // A single atomic native call — see resize_and_reposition's doc
        // comment in main.rs for why this replaced two separate calls
        // (setSize, then set_overlay_position) that could race.
        const position = usePositionStore.getState();
        await invoke("resize_and_reposition", {
          width: targetWidth,
          height: targetHeight,
          x: position.x,
          y: position.y,
        });
      } catch {
        // Ignore transient native-window resize errors.
      }
    };

    void resize();
  }, [lines, activeIndex, autoWidth, settings.fontSize, settings.lineSpacing, settings.showPrevious, settings.showNext]);

  if (!track) return <CenteredMessage text="Play something on Spotify to see lyrics here." />;
  if (loading) return <CenteredMessage text="Loading lyrics…" />;
  if (notFound || (!lines && !plain)) return <CenteredMessage text={`No lyrics found for "${track.name}".`} subtext={track.artists.join(", ")} />;

  if (!lines) {
    return <div className="plain-lyrics" style={{ color: settings.textColor, fontSize: settings.fontSize, textAlign: settings.textAlign }}>{plain}</div>;
  }

  const visibleOffsets = [-1, 0, 1].filter(
    (offset) => offset === 0 || (offset === -1 ? settings.showPrevious : settings.showNext)
  );

  return (
    <>
      <div ref={measureRef} aria-hidden="true" className="lyric-measure" style={{ fontSize: settings.fontSize }}>
        {lines.map((line, index) => (
          <span key={index} data-measure-line="true">{line.text || "♪"}</span>
        ))}
      </div>

      <div
        ref={layoutMeasureRef}
        aria-hidden="true"
        className="lyric-layout-measure"
        style={{
          width: `${autoWidth}px`,
          padding: `${Math.max(6, Math.round(settings.fontSize * 0.45))}px 20px`,
          textAlign: settings.textAlign,
        }}
      >
        {visibleOffsets.map((offset) => {
          const idx = activeIndex + offset;
          const line = lines[idx];
          const active = offset === 0;
          if (!line) {
            return <div key={offset} style={{ height: settings.fontSize * 1.5 }} />;
          }
          return (
            <div
              key={idx}
              className="lyric-line"
              style={{
                fontSize: active ? settings.fontSize : Math.max(10, Math.round(settings.fontSize * 0.63)),
                lineHeight: 1.5,
                margin: `${settings.lineSpacing}px 0`,
              }}
            >
              {line.text || "♪"}
            </div>
          );
        })}
      </div>

      <div className="lyrics-stage" style={{ textAlign: settings.textAlign, padding: `${Math.max(6, Math.round(settings.fontSize * 0.45))}px 20px` }}>
        {visibleOffsets.map((offset) => {
          const idx = activeIndex + offset;
          const line = lines[idx];
          if (!line) return <div key={offset} className="lyric-line lyric-line--placeholder" style={{ height: settings.fontSize * 1.5 }} />;
          const active = offset === 0;
          return (
            <div
              key={idx}
              className={active ? "lyric-line lyric-line--active" : "lyric-line lyric-line--secondary"}
              style={{
                color: rgba(settings.textColor, active ? settings.textOpacity : settings.secondaryOpacity),
                fontSize: active ? settings.fontSize : Math.max(10, Math.round(settings.fontSize * 0.63)),
                lineHeight: 1.5,
                margin: `${settings.lineSpacing}px 0`,
                textShadow: active && settings.glow > 0 ? `0 0 ${Math.round(settings.glow * 0.45)}px ${rgba(settings.textColor, 0.55)}, 0 0 ${settings.glow}px ${rgba(settings.textColor, 0.22)}` : "none",
              }}
            >
              {line.text || "♪"}
            </div>
          );
        })}
      </div>
    </>
  );
}

function CenteredMessage({ text, subtext }: { text: string; subtext?: string }) {
  const { textColor, textOpacity } = useSettingsStore();
  return <div className="centered-message" style={{ color: rgba(textColor, textOpacity) }}><div>{text}</div>{subtext && <small>{subtext}</small>}</div>;
}
