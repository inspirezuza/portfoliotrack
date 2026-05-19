import type { ReactNode } from "react";

type LoadingIndicatorProps = {
  className?: string;
  label?: string;
  size?: "sm" | "md";
};

type RouteLoadingSkeletonProps = {
  eyebrow?: string;
  title?: string;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function LoadingIndicator({
  className,
  label = "Loading",
  size = "md"
}: LoadingIndicatorProps) {
  return (
    <span
      className={joinClassNames("loading-indicator", `loading-indicator-${size}`, className)}
      role="status"
      aria-live="polite"
    >
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ButtonLoadingContent({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <span className="button-loading-content">
      <LoadingIndicator label={label} size="sm" />
      <span className="button-loading-idle">{children}</span>
    </span>
  );
}

export function PendingBanner({ label }: { label: string }) {
  return (
    <div className="pending-banner" role="status" aria-live="polite">
      <LoadingIndicator label={label} size="sm" />
    </div>
  );
}

export function RouteLoadingSkeleton({
  eyebrow = "Loading",
  title = "Preparing workspace"
}: RouteLoadingSkeletonProps) {
  return (
    <section className="workstation-page route-loading-shell" aria-busy="true">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <LoadingIndicator label="Loading latest data" />
        </div>
      </div>

      <section className="workstation-metrics" aria-hidden="true">
        <div className="loading-skeleton-card loading-skeleton-card-wide" />
        <div className="loading-skeleton-card" />
        <div className="loading-skeleton-card" />
        <div className="loading-skeleton-card" />
        <div className="loading-skeleton-card" />
      </section>

      <section className="workstation-grid" aria-hidden="true">
        <div className="loading-skeleton-panel loading-skeleton-panel-tall" />
        <div className="loading-skeleton-panel" />
      </section>
    </section>
  );
}
