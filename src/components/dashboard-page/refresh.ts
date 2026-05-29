import type { getUiCopy } from "@/lib/ui/copy";

export type DashboardRefreshParams = {
  refresh?: string;
  eventAt?: string;
  refreshedAt?: string;
  quoteCount?: string;
  issueCount?: string;
  message?: string;
};

type DashboardCopy = ReturnType<typeof getUiCopy>["dashboard"];

const REFRESH_BANNER_MAX_AGE_MINUTES = 5;

export function buildRefreshMessage(
  { refresh, eventAt, refreshedAt, quoteCount, issueCount, message }: DashboardRefreshParams,
  copy: DashboardCopy,
  now = Date.now(),
) {
  const eventAgeMinutes = (() => {
    if (eventAt == null) {
      return null;
    }

    const timestamp = Date.parse(eventAt);

    if (Number.isNaN(timestamp)) {
      return null;
    }

    return Math.max(0, Math.floor((now - timestamp) / 60000));
  })();

  if (
    refresh == null ||
    eventAgeMinutes == null ||
    eventAgeMinutes > REFRESH_BANNER_MAX_AGE_MINUTES
  ) {
    return null;
  }

  if (refresh === "success") {
    const quotesLabel = quoteCount == null ? "" : copy.refresh.quotesUpdated(quoteCount);
    const providerLabel = refreshedAt ? copy.refresh.providerTimestamp(refreshedAt) : "";
    const issuesLabel =
      issueCount == null || issueCount === "0" ? "" : copy.refresh.symbolsNeedReview(issueCount);

    return {
      tone: issueCount != null && issueCount !== "0" ? "warning" : "success",
      title:
        issueCount != null && issueCount !== "0"
          ? copy.refresh.warningTitle
          : copy.refresh.successTitle,
      body: [quotesLabel, providerLabel, issuesLabel].filter(Boolean).join(" | "),
    } as const;
  }

  if (refresh === "started" || refresh === "already-running") {
    return {
      tone: "success",
      title: copy.refresh.startedTitle,
      body: copy.refresh.statusLoading,
    } as const;
  }

  if (refresh === "error") {
    return {
      tone: "warning",
      title: copy.refresh.errorTitle,
      body: message ?? copy.refresh.fallbackErrorBody,
    } as const;
  }

  return null;
}

export function appendSearchParams(path: string, searchParams: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}
