import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, subtitle, aside, compact }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`ocean-page-header ${compact ? "is-compact" : ""}`}>
      <div className="ocean-page-heading">
        {eyebrow && <p className="ocean-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="ocean-page-subtitle">{subtitle}</p>}
      </div>
      {aside && <div className="ocean-header-actions">{aside}</div>}
    </header>
  );
}
