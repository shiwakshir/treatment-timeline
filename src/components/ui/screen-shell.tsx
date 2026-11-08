import React, { type ReactNode } from "react";

export function ScreenTitle({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {eyebrow && (
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
      )}
      <h1 className="text-3xl font-bold leading-snug tracking-tight title-gradient">
        {children}
      </h1>
    </div>
  );
}
