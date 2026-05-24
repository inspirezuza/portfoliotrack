"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type DailyMarketRefreshResponse = {
  status?: "started" | "skipped" | "success" | "failed";
  refreshDate?: string;
  reason?: string;
};

const REFRESHABLE_PATHS = new Set(["/", "/transactions"]);

function getBangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric"
  }).formatToParts(now);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}`;
}

function shouldRefreshForPath(pathname: string) {
  return REFRESHABLE_PATHS.has(pathname);
}

export function DailyMarketRefresh({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!shouldRefreshForPath(pathname)) {
      return;
    }

    const refreshDate = getBangkokDate();
    const sessionKey = `portfoliotrack.dailyMarketRefresh.${selectedPortfolioId}.${refreshDate}`;

    try {
      if (sessionStorage.getItem(sessionKey) != null) {
        return;
      }

      sessionStorage.setItem(sessionKey, "pending");
    } catch {
      // Session storage is only a browser-side courtesy; the server is the real guard.
    }

    let isCancelled = false;

    async function refreshDailyMarketData() {
      try {
        const response = await fetch("/api/market-data/refresh", {
          body: JSON.stringify({ mode: "daily-auto" }),
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        });
        const payload = (await response.json()) as DailyMarketRefreshResponse;

        try {
          sessionStorage.setItem(sessionKey, payload.status ?? "done");
        } catch {
          // Ignore unavailable storage; the server-side guard still protects refreshes.
        }

        if (!isCancelled && payload.status === "success") {
          router.refresh();
        }
      } catch {
        try {
          sessionStorage.setItem(sessionKey, "failed");
        } catch {
          // Ignore unavailable storage; a failed background refresh should stay silent.
        }
      }
    }

    void refreshDailyMarketData();

    return () => {
      isCancelled = true;
    };
  }, [pathname, router, selectedPortfolioId]);

  return null;
}
