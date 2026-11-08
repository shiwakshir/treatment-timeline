import React from "react";

export type StatusKind = "loading" | "confirmed" | "saving" | "saved";

export interface StatusOverlayProps {
  kind: StatusKind;
  label: string;
}

/** Full-screen calm status card used between interview steps. */
export function StatusOverlay({ kind, label }: StatusOverlayProps) {
  const done = kind === "confirmed" || kind === "saved";
  return (
    <div role="status" aria-live="polite" className="status-overlay">
      <div className="status-card">
        <div className="status-orb" data-done={done}>
          {done ? (
            <svg viewBox="0 0 52 52" className="status-check" aria-hidden>
              <path d="M14 27 l8 8 l16 -18" />
            </svg>
          ) : (
            <span className="status-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <p className="mt-5 text-lg font-semibold text-foreground">{label}</p>
      </div>
    </div>
  );
}
