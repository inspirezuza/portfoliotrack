"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";

export type MarketRefreshStatusRun = {
  id: number;
  status: string;
  targetCount: number;
  processedTargetCount: number;
  currentSymbol: string | null;
  quoteRefreshCount: number;
  historicalBarCount: number;
  intradayBarCount: number;
  issueCount: number;
  latestSuccessfulAsOf: string | null;
  errorMessage: string | null;
};

type MarketRefreshStatusProps = {
  language: UiLanguage;
  onSettled?: (run: MarketRefreshStatusRun) => void;
  runId: number;
};

type StatusResponse = {
  run?: MarketRefreshStatusRun;
  error?: {
    message?: string;
  };
};

const POLL_INTERVAL_MS = 2500;

export function MarketRefreshStatus({
  language,
  onSettled,
  runId
}: MarketRefreshStatusProps) {
  const copy = getUiCopy(language);
  const router = useRouter();
  const [run, setRun] = useState<MarketRefreshStatusRun | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const settledRunIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/market-data/refresh/status?runId=${runId}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as StatusResponse;

        if (!response.ok || payload.run == null) {
          throw new Error(payload.error?.message ?? copy.dashboard.refresh.statusUnavailable);
        }

        if (isCancelled) {
          return;
        }

        setRun(payload.run);
        setErrorMessage(null);

        if (payload.run.status === "running") {
          timeoutId = setTimeout(() => {
            void pollStatus();
          }, POLL_INTERVAL_MS);
          return;
        }

        if (settledRunIdRef.current !== payload.run.id) {
          settledRunIdRef.current = payload.run.id;
          onSettled?.(payload.run);

          if (payload.run.status === "success" && onSettled == null) {
            router.refresh();
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : copy.dashboard.refresh.statusUnavailable);
        }
      }
    }

    void pollStatus();

    return () => {
      isCancelled = true;

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [copy.dashboard.refresh.statusUnavailable, onSettled, router, runId]);

  const progress = useMemo(() => {
    if (run == null || run.targetCount <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((run.processedTargetCount / run.targetCount) * 100));
  }, [run]);

  if (errorMessage != null) {
    return (
      <article className="status-banner status-banner-warning">
        <strong>{copy.dashboard.refresh.errorTitle}</strong>
        <span>{errorMessage}</span>
      </article>
    );
  }

  if (run == null) {
    return (
      <article className="status-banner">
        <strong>{copy.dashboard.refresh.startedTitle}</strong>
        <span>{copy.dashboard.refresh.statusLoading}</span>
      </article>
    );
  }

  const isFailed = run.status === "failed";
  const isSuccess = run.status === "success";
  const toneClass = isFailed
    ? "status-banner-warning"
    : isSuccess
      ? run.issueCount > 0
        ? "status-banner-warning"
        : "status-banner-success"
      : "";
  const title = isFailed
    ? copy.dashboard.refresh.errorTitle
    : isSuccess
      ? run.issueCount > 0
        ? copy.dashboard.refresh.warningTitle
        : copy.dashboard.refresh.successTitle
      : copy.dashboard.refresh.startedTitle;
  const detail = isFailed
    ? run.errorMessage ?? copy.dashboard.refresh.fallbackErrorBody
    : isSuccess
      ? [
          copy.dashboard.refresh.quotesUpdated(String(run.quoteRefreshCount)),
          run.issueCount > 0 ? copy.dashboard.refresh.symbolsNeedReview(String(run.issueCount)) : ""
        ].filter(Boolean).join(" | ")
      : copy.dashboard.refresh.runningProgress(
          run.processedTargetCount,
          run.targetCount,
          run.currentSymbol
        );

  return (
    <article className={`status-banner ${toneClass}`}>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {!isFailed && !isSuccess ? (
        <div
          aria-hidden="true"
          style={{
            alignSelf: "center",
            background: "rgba(8, 116, 93, 0.14)",
            borderRadius: 999,
            height: 8,
            minWidth: 140,
            overflow: "hidden",
            width: "24%"
          }}
        >
          <span
            style={{
              background: "var(--accent)",
              display: "block",
              height: "100%",
              width: `${progress}%`
            }}
          />
        </div>
      ) : null}
    </article>
  );
}
