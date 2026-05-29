"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AssetHeader } from "@/components/asset-header";
import { DeferredAssetPriceChart } from "@/components/asset-deferred-widgets";
import { AssetDrComparisonCard } from "@/components/asset-detail/dr-comparison-card";
import { AssetDetailSidebar } from "@/components/asset-detail/sidebar";
import { AssetPerformanceMetrics } from "@/components/asset-detail/performance-metrics";
import { AssetTransactionHistory } from "@/components/asset-detail/transaction-history";
import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { AssetDetail } from "@/server/assets";

type HoldingDetailDialogProps = {
  symbol: string;
  language: UiLanguage;
  onClose: () => void;
};

type AssetDetailResponse = {
  asset?: AssetDetail;
  error?: {
    message?: string;
  };
};

export function HoldingDetailDialog({ symbol, language, onClose }: HoldingDetailDialogProps) {
  const copy = getUiCopy(language);
  const closeCopy = copy.transactions.form.close;
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialog();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAsset() {
      try {
        const response = await fetch(`/api/assets/${encodeURIComponent(symbol)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as AssetDetailResponse;

        if (isCancelled) {
          return;
        }

        if (!response.ok || payload.asset == null) {
          throw new Error(payload.error?.message ?? copy.holdings.table.detail.error);
        }

        setAsset(payload.asset);
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : copy.holdings.table.detail.error,
          );
        }
      }
    }

    void loadAsset();

    return () => {
      isCancelled = true;
    };
  }, [copy.holdings.table.detail.error, symbol]);

  const isLoading = asset == null && errorMessage == null;

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="transaction-edit-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
    >
      <button
        type="button"
        className="transaction-edit-backdrop"
        aria-label={closeCopy}
        onClick={closeDialog}
      />
      <div
        className="holding-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.holdings.table.detail.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="transaction-edit-close"
          aria-label={closeCopy}
          title={closeCopy}
          onClick={closeDialog}
        >
          <span aria-hidden="true">x</span>
        </button>

        {isLoading ? (
          <div className="holding-detail-loading">
            <div className="loading-skeleton-panel" style={{ minHeight: 320 }} aria-hidden="true" />
            <p className="table-status">{copy.holdings.table.detail.loading}</p>
          </div>
        ) : errorMessage != null ? (
          <p className="form-banner form-banner-error">{errorMessage}</p>
        ) : asset != null ? (
          <div className="holding-detail-content">
            <AssetHeader asset={asset} />
            <AssetPerformanceMetrics asset={asset} />
            <AssetDrComparisonCard asset={asset} />
            <div className="asset-layout">
              <DeferredAssetPriceChart asset={asset} />
              <AssetDetailSidebar asset={asset} />
            </div>
            <AssetTransactionHistory asset={asset} />
            <div className="holding-detail-footer">
              <Link
                href={`/assets/${encodeURIComponent(symbol)}`}
                className="route-link"
                onClick={closeDialog}
              >
                {copy.holdings.table.detail.viewFullPage}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
