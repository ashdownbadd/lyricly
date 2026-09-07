import React, { useEffect, useRef } from "react";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getStoredTokens } from "./lib/spotifyAuth";
import { OverlaySettings, usePositionStore, useSettingsStore } from "./lib/store";
import { useCurrentTrack } from "./hooks/useCurrentTrack";
import { useLyrics } from "./hooks/useLyrics";
import { useSelectivePassthrough } from "./hooks/useSelectivePassthrough";
import { MinimizeIcon, SettingsGearIcon } from "./components/icons";
import LoginScreen from "./components/LoginScreen";
import LyricsOverlay from "./components/LyricsOverlay";
import SettingsPanel from "./components/SettingsPanel";

// getCurrentWindow() constructs a new object every time it's called — it is
// NOT a cached singleton. Calling it inside a component body means every
// render produces a referentially-different value. Any effect that lists
// that value in its dependency array (e.g. `[win]`) will therefore re-run on
// every render, not just once — which is exactly what caused "run once at
// startup" position-restoring logic to keep re-firing and fight with manual
// dragging. Creating it once per window/module and reusing that single
// reference everywhere makes it referentially stable across renders.
const win = getCurrentWindow();

function SettingsApp() {
  useEffect(() => {
    let disposeState: (() => void) | undefined;
    let disposePosition: (() => void) | undefined;
    let disposeClose: (() => void) | undefined;

    const setup = async () => {
      // Register listeners before announcing readiness so the initial
      // settings snapshot cannot be lost during window startup.
      disposeState = await win.listen<OverlaySettings>("settings-state", ({ payload }) => {
        useSettingsStore.getState().applySettings(payload);
      });

      disposePosition = await win.listen<{ x: number; y: number }>("position-state", ({ payload }) => {
        usePositionStore.getState().setPosition(payload.x, payload.y);
      });

      disposeClose = await win.onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await invoke("close_settings");
        } catch (error) {
          console.error("Unable to close settings window", error);
        }
      });

      await win.emitTo("main", "settings-ready");
    };

    void setup();
    return () => {
      disposeState?.();
      disposePosition?.();
      disposeClose?.();
    };
  }, []); // `win` is now a stable module-level reference — this genuinely runs once.

  return (
    <div className="settings-window-root">
      <SettingsPanel onClose={() => void invoke("close_settings")} />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function MainApp() {
  const [authed, setAuthed] = React.useState<boolean>(() => !!getStoredTokens());
  const settings = useSettingsStore();
  const { track, liveProgressMs } = useCurrentTrack(authed);
  const { lines, plain, loading, notFound } = useLyrics(track);
  const hasRestoredPosition = useRef(false);

  // Two distinct click-through behaviors:
  // - Not logged in: the login screen needs ordinary full interactivity.
  // - `settings.clickThrough` true: the user's manual "fully invisible"
  //   override — ignores everything, including the drag handle and settings
  //   button, escaped via the global hotkey.
  // Neither of those is decided per-frame, so they're handled here, once per
  // change, as the single source of truth for those two static states.
  // Everything else (the normal, default case) is handled continuously by
  // useSelectivePassthrough below, which is why that hook deliberately does
  // NOT also write to setIgnoreCursorEvents when it's disabled — having two
  // effects both trying to set the "final" state on the same render would race.
  useEffect(() => {
    if (!authed) {
      void win.setIgnoreCursorEvents(false).catch(() => undefined);
      return;
    }
    if (settings.clickThrough) {
      void win.setIgnoreCursorEvents(true).catch(() => undefined);
    }
  }, [authed, settings.clickThrough]);

  // The default, dynamic behavior: continuously poll the real cursor position
  // and only let clicks land on the drag handle / settings button (anything
  // marked data-interactive), passing everything else through to whatever's
  // behind the overlay.
  useSelectivePassthrough(authed && !settings.clickThrough);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen("toggle-click-through", () => {
      const state = useSettingsStore.getState();
      state.setSetting("clickThrough", !state.clickThrough);
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen("open-settings", () => { void openSettings(); }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen<Partial<OverlaySettings>>("settings-changed", async ({ payload }) => {
      const state = useSettingsStore.getState();
      state.applySettings(payload);
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen<{ x: number; y: number }>("position-changed", async ({ payload }) => {
      const x = Math.max(0, Math.min(100, payload.x));
      const y = Math.max(0, Math.min(100, payload.y));
      usePositionStore.getState().setPosition(x, y);
      try {
        await invoke("set_overlay_position", { x, y });
      } catch (error) {
        console.error("Unable to position overlay", error);
      }
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen("settings-ready", async () => {
      const settingsWindow = await WebviewWindow.getByLabel("settings");
      if (settingsWindow) {
        await settingsWindow.emit("settings-state", getSettingsSnapshot());
        await settingsWindow.emit("position-state", getPositionSnapshot());
      }
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    win.onMoved(async ({ payload }) => {
      try {
        const monitor = await win.currentMonitor();
        const size = await win.outerSize();
        if (!monitor) return;
        const x = ((payload.x - monitor.position.x) / Math.max(1, monitor.size.width - size.width)) * 100;
        const y = ((payload.y - monitor.position.y) / Math.max(1, monitor.size.height - size.height)) * 100;
        const next = {
          x: Math.max(0, Math.min(100, Number(x.toFixed(1)))),
          y: Math.max(0, Math.min(100, Number(y.toFixed(1)))),
        };
        const state = usePositionStore.getState();
        if (Math.abs(state.x - next.x) > 0.05 || Math.abs(state.y - next.y) > 0.05) {
          state.setPosition(next.x, next.y);
          const settingsWindow = await WebviewWindow.getByLabel("settings");
          if (settingsWindow) {
            await settingsWindow.emit("position-state", next);
          }
        }
      } catch {
        // Ignore transient native move events.
      }
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, []); // registered once against the stable `win` reference — no more re-subscribing every render.

  // Restore the persisted native position exactly once, at true mount, before
  // any drag can occur. The previous version depended on `[win]`, which was a
  // fresh, referentially-different object every render — since MainApp
  // re-renders every second from now-playing polling (and on every settings
  // change), that made this "run once" effect actually re-run continuously,
  // repeatedly overwriting the live/dragged position with the last persisted
  // value and racing the async onMoved handler above. A ref guard makes the
  // one-time intent explicit and immune to any future effect re-runs
  // (including React StrictMode's dev-mode double-invoke).
  useEffect(() => {
    if (hasRestoredPosition.current) return;
    hasRestoredPosition.current = true;

    const handle = async () => {
      const position = usePositionStore.getState();
      try {
        await invoke("set_overlay_position", { x: position.x, y: position.y });
      } catch {
        // Keep the native startup position if monitor information is unavailable.
      }
    };
    void handle();
  }, []);

  async function openSettings() {
    try {
      // Let the Rust side resolve the configured native window. This avoids
      // relying on the renderer to create/find a hidden secondary window.
      await invoke("open_settings");

      const settingsWindow = await WebviewWindow.getByLabel("settings");
      if (!settingsWindow) {
        console.error("Lyricly: settings window opened natively but could not be resolved from the renderer.");
        return;
      }

      // Position it beside the overlay when possible. The native show/focus
      // above already guarantees that the window is visible even if geometry
      // calculation fails.
      try {
        await settingsWindow.setSize({ type: "Logical", width: 520, height: 760 });
        const monitor = await win.currentMonitor();
        const settingsSize = await settingsWindow.outerSize();

        if (monitor) {
            const margin = 24;
          const x = monitor.position.x + monitor.size.width - settingsSize.width - margin;
          const y = monitor.position.y + Math.max(0, Math.round((monitor.size.height - settingsSize.height) / 2));
          await settingsWindow.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
        }
      } catch (geometryError) {
        console.warn("Lyricly: settings geometry could not be updated", geometryError);
      }

      await settingsWindow.show();
      await settingsWindow.setFocus();
      await settingsWindow.emit("settings-state", getSettingsSnapshot());
    } catch (error) {
      console.error("Unable to open settings window", error);
    }
  }

  async function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || settings.clickThrough) return;
    try {
      await win.startDragging();
    } catch {
      // Native dragging may be unavailable during shutdown.
    }
  }

  return (
    <div
      className="overlay-root"
      style={{
        background: hexToRgba(settings.backgroundColor, settings.backgroundOpacity),
        backdropFilter: `blur(${settings.blur}px)`,
        WebkitBackdropFilter: `blur(${settings.blur}px)`,
      }}
    >
      {!authed ? (
        <LoginScreen onLoggedIn={() => setAuthed(true)} />
      ) : (
        <>
          {!settings.clickThrough && (
            <div
              className="drag-handle"
              data-interactive
              onPointerDown={startDrag}
              title="Drag to move"
            >
              <span className="drag-handle-dots">
                <span /><span /><span />
              </span>
            </div>
          )}

          <LyricsOverlay
            track={track}
            liveProgressMs={liveProgressMs}
            lines={lines}
            plain={plain}
            loading={loading}
            notFound={notFound}
          />
          <button
            className="settings-button"
            data-interactive
            onPointerDown={(e) => e.stopPropagation()}
            onClick={openSettings}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsGearIcon size={15} />
          </button>
          <button
            className="minimize-button"
            data-interactive
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void win.minimize().catch(() => undefined)}
            title="Minimize"
            aria-label="Minimize"
          >
            <MinimizeIcon size={13} />
          </button>
        </>
      )}
    </div>
  );
}

function getSettingsSnapshot(): OverlaySettings {
  const state = useSettingsStore.getState();
  return {
    backgroundColor: state.backgroundColor,
    backgroundOpacity: state.backgroundOpacity,
    textColor: state.textColor,
    textOpacity: state.textOpacity,
    fontSize: state.fontSize,
    textAlign: state.textAlign,
    blur: state.blur,
    glow: state.glow,
    lineSpacing: state.lineSpacing,
    showPrevious: state.showPrevious,
    showNext: state.showNext,
    secondaryOpacity: state.secondaryOpacity,
    clickThrough: state.clickThrough,
  };
}

function getPositionSnapshot() {
  const state = usePositionStore.getState();
  return { x: state.x, y: state.y };
}

export default function App() {
  const isSettingsWindow = win.label === "settings";
  return isSettingsWindow ? <SettingsApp /> : <MainApp />;
}
