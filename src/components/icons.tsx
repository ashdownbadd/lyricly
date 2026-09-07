interface IconProps {
  size?: number;
  className?: string;
}

/** A single arrow glyph, reused at 8 rotations for the position preset grid. */
export function ArrowIcon({ size = 16, rotation = 0, className }: IconProps & { rotation?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ transform: `rotate(${rotation}deg)`, display: "block" }}
    >
      <path
        d="M12 3.5v15M12 3.5l-5 5M12 3.5l5 5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Distinct glyph for the "Center" preset — a dot inside a bracket, rather than a rotated arrow. */
export function CenterIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ display: "block" }}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path
        d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SettingsGearIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ display: "block" }}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7M17.8 17.8l-1.7-1.7M7.9 7.9 6.2 6.2"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MinimizeIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ display: "block" }}>
      <path d="M5 19h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
