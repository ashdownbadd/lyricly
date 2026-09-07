import { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULTS, DEFAULT_POSITION, TextAlign, OverlaySettings, usePositionStore, useSettingsStore } from "../lib/store";
import { loginWithSpotify, logout } from "../lib/spotifyAuth";
import { useState } from "react";
import { ArrowIcon, CenterIcon } from "./icons";

interface Props {
  onClose: () => void;
}

const positionPresets = [
  { label: "Top left", x: 8, y: 8, rotation: 315 },
  { label: "Top", x: 50, y: 8, rotation: 0 },
  { label: "Top right", x: 92, y: 8, rotation: 45 },
  { label: "Left", x: 8, y: 50, rotation: 270 },
  { label: "Center", x: 50, y: 50, rotation: null },
  { label: "Right", x: 92, y: 50, rotation: 90 },
  { label: "Bottom left", x: 8, y: 88, rotation: 225 },
  { label: "Bottom", x: 50, y: 88, rotation: 180 },
  { label: "Bottom right", x: 92, y: 88, rotation: 135 },
] as const;

export default function SettingsPanel({ onClose }: Props) {
  const s = useSettingsStore();
  const position = usePositionStore();
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState<string | null>(null);

  function update<K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) {
    s.setSetting(key, value);
    // Send only the setting that changed. The settings window has its own
    // persisted Zustand storage, so sending a complete snapshot here could
    // overwrite a position that the user just changed by dragging the main
    // overlay. Position is therefore never implicitly restored by an
    // unrelated setting such as blur, glow, or opacity.
    void getCurrentWindow().emitTo("main", "settings-changed", { [key]: value });
  }

  function updatePosition(x: number, y: number) {
    position.setPosition(x, y);
    void getCurrentWindow().emitTo("main", "position-changed", { x, y });
  }

  function reset() {
    s.resetDefaults();
    position.resetPosition();
    void getCurrentWindow().emitTo("main", "settings-changed", DEFAULTS);
    void getCurrentWindow().emitTo("main", "position-changed", DEFAULT_POSITION);
  }

  function disconnect() {
    logout();
    onClose();
  }

  function closeSettings() {
    void invoke("close_settings").catch((error) => console.error("Unable to close settings window", error));
  }

  return (
    <aside className="settings-panel" data-no-drag aria-label="Overlay customization">
      <Section title="Appearance">
        <Row label="Text color"><input data-no-drag type="color" value={s.textColor} onChange={(e) => update("textColor", e.target.value)} /></Row>
        <Range label="Text opacity" value={s.textOpacity} min={0.2} max={1} step={0.01} display={`${Math.round(s.textOpacity * 100)}%`} onChange={(v) => update("textOpacity", v)} />
        <Range label="Background opacity" value={s.backgroundOpacity} min={0} max={1} step={0.01} display={`${Math.round(s.backgroundOpacity * 100)}%`} onChange={(v) => update("backgroundOpacity", v)} />
        <Range label="Blur" value={s.blur} min={0} max={24} step={1} display={`${s.blur}px`} onChange={(v) => update("blur", v)} />
        <Range label="Glow" value={s.glow} min={0} max={30} step={1} display={`${s.glow}px`} onChange={(v) => update("glow", v)} />
      </Section>

      <Section title="Text">
        <Range label="Text size" value={s.fontSize} min={12} max={48} step={1} display={`${s.fontSize}px`} onChange={(v) => update("fontSize", v)} />
        <Range label="Line spacing" value={s.lineSpacing} min={0} max={12} step={1} display={`${s.lineSpacing}px`} onChange={(v) => update("lineSpacing", v)} />
        <p className="settings-help">Overlay width and height adjust automatically to fit the current lyrics and text size.</p>
      </Section>

      <Section title="Position">
        <div className="position-grid">
          {positionPresets.map(({ label, x, y, rotation }) => (
            <button
              key={label}
              data-no-drag
              className={Math.abs(position.x - x) < 0.1 && Math.abs(position.y - y) < 0.1 ? "settings-option is-active" : "settings-option"}
              onClick={() => updatePosition(x, y)}
              title={label}
              aria-label={label}
            >
              {rotation === null ? <CenterIcon size={16} /> : <ArrowIcon size={16} rotation={rotation} />}
            </button>
          ))}
        </div>
        <Range label="Horizontal" value={position.x} min={0} max={100} step={0.1} display={`${position.x.toFixed(1)}%`} onChange={(v) => updatePosition(v, position.y)} />
        <Range label="Vertical" value={position.y} min={0} max={100} step={0.1} display={`${position.y.toFixed(1)}%`} onChange={(v) => updatePosition(position.x, v)} />
      </Section>

      <Section title="Lyrics">
        <Toggle label="Show previous line" value={s.showPrevious} onChange={(v) => update("showPrevious", v)} />
        <Toggle label="Show next line" value={s.showNext} onChange={(v) => update("showNext", v)} />
        <Range label="Secondary opacity" value={s.secondaryOpacity} min={0} max={1} step={0.01} display={`${Math.round(s.secondaryOpacity * 100)}%`} onChange={(v) => update("secondaryOpacity", v)} />
        <Row label="Text alignment">
          <Segmented value={s.textAlign} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(v) => update("textAlign", v as TextAlign)} />
        </Row>
      </Section>

      <Section title="Spotify">
        <div className="spotify-status">Spotify authentication is stored locally on this device.</div>
        <div className="spotify-actions">
          <button
            className="settings-action primary"
            data-no-drag
            disabled={spotifyBusy}
            onClick={async () => {
              setSpotifyBusy(true);
              setSpotifyMessage(null);
              try {
                await loginWithSpotify();
                setSpotifyMessage("Spotify connected.");
              } catch (error) {
                setSpotifyMessage((error as Error).message);
              } finally {
                setSpotifyBusy(false);
              }
            }}
          >
            {spotifyBusy ? "Waiting for Spotify…" : "Connect / Reconnect Spotify"}
          </button>
          <button className="settings-action danger" data-no-drag onClick={disconnect}>Disconnect Spotify</button>
        </div>
        {spotifyMessage && <div className="settings-help spotify-message">{spotifyMessage}</div>}
      </Section>

      <div className="settings-footer">
        <button className="settings-action" data-no-drag onClick={reset}>Reset defaults</button>
        <button className="settings-action primary" data-no-drag onClick={closeSettings}>Done</button>
      </div>
      <div className="settings-saved">Changes are saved automatically.</div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-section"><h2>{title}</h2>{children}</section>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="settings-row"><span>{label}</span>{children}</div>;
}

function Range({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="settings-row">
      <div className="settings-range-label"><span>{label}</span><strong>{display}</strong></div>
      <input
        data-no-drag
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--sp-green) ${pct}%, var(--sp-charcoal-2) ${pct}%)` }}
      />
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <div className="settings-options">{options.map(([option, label]) => <button key={option} data-no-drag className={value === option ? "settings-option is-active" : "settings-option"} onClick={() => onChange(option)}>{label}</button>)}</div>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className="settings-toggle" data-no-drag onClick={() => onChange(!value)} aria-pressed={value}>
      <span>{label}</span>
      <span className={value ? "toggle-pill is-on" : "toggle-pill"} />
    </button>
  );
}
