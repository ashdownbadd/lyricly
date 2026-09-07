import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();
const POLL_MS = 40; // ~25Hz — responsive enough to feel instant, cheap enough to leave running

/**
 * Tauri's setIgnoreCursorEvents() is all-or-nothing for the whole native
 * window — there's no per-pixel "this region is click-through, that one
 * isn't" concept at the OS level. To fake it, we continuously poll the
 * *global* OS cursor position (via a Rust command backed by device_query,
 * since a window that's currently ignoring cursor events stops receiving
 * ordinary DOM mouse events entirely and can't track hover on its own),
 * hit-test that position against elements marked `data-interactive` in the
 * DOM, and flip ignoreCursorEvents off only while the cursor is over one of
 * them. Everywhere else, clicks pass straight through to whatever's behind
 * the overlay.
 *
 * Only call this when the window should behave as a "smart" overlay — i.e.
 * NOT while the user has manually forced full click-through mode (that mode
 * intentionally ignores everything, including the drag handle, and relies on
 * the global hotkey to escape it), and not on screens like the login screen
 * that need ordinary full interactivity.
 */
export function useSelectivePassthrough(enabled: boolean) {
  const isIgnoringRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Intentionally no side effect here. Whether the window should be
      // fully interactive (login screen) or fully ignoring (manual
      // click-through mode) while this hook is disabled is decided by the
      // caller, not here — having both this hook's cleanup AND the caller
      // write to setIgnoreCursorEvents on the same render would race,
      // since effect ordering between separate hooks isn't something to
      // rely on for "last write wins" correctness.
      isIgnoringRef.current = null;
      return;
    }

    let cancelled = false;
    let windowPos = { x: 0, y: 0 };
    let scaleFactor = 1;

    async function refreshGeometry() {
      try {
        const pos = await win.outerPosition();
        windowPos = { x: pos.x, y: pos.y };
        scaleFactor = await win.scaleFactor();
      } catch {
        // Window may be mid-teardown; keep the last known geometry.
      }
    }

    async function tick() {
      if (cancelled) return;
      try {
        const [globalX, globalY] = await invoke<[number, number]>("get_cursor_position");
        const localX = (globalX - windowPos.x) / scaleFactor;
        const localY = (globalY - windowPos.y) / scaleFactor;

        let overInteractive = false;
        if (localX >= 0 && localY >= 0 && localX <= window.innerWidth && localY <= window.innerHeight) {
          const el = document.elementFromPoint(localX, localY);
          overInteractive = !!el?.closest("[data-interactive]");
        }

        const shouldIgnore = !overInteractive;
        if (isIgnoringRef.current !== shouldIgnore) {
          isIgnoringRef.current = shouldIgnore;
          await win.setIgnoreCursorEvents(shouldIgnore);
        }
      } catch {
        // Transient IPC hiccup; next tick will retry.
      }
    }

    refreshGeometry();
    const unlistenMoved = win.onMoved(() => void refreshGeometry());
    const unlistenResized = win.onResized(() => void refreshGeometry());
    const interval = setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      unlistenMoved.then((u) => u());
      unlistenResized.then((u) => u());
      isIgnoringRef.current = null;
    };
  }, [enabled]);
}
