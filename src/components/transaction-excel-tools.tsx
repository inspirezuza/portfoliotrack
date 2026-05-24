"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ButtonLoadingContent, PendingBanner } from "@/components/loading-indicator";
import { formatQuantity } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionBroker } from "@/lib/validation/transaction";

type TransactionExcelToolsProps = {
  language: UiLanguage;
  onWorkspaceRefresh?: () => Promise<void> | void;
};

type ImportRowStatus = "ready" | "skipped_duplicate" | "error";

type ImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  message: string;
  symbol: string | null;
  tradeDate: string | null;
  side: "BUY" | "SELL" | null;
  broker: TransactionBroker | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  notes: string | null;
};

type ImportPreview = {
  counts: {
    totalRows: number;
    readyRows: number;
    skippedRows: number;
    errorRows: number;
  };
  rows: ImportPreviewRow[];
};

type ImportApiResponse = {
  preview?: ImportPreview;
  error?: {
    code?: string;
    message?: string;
    details?: {
      preview?: ImportPreview;
    } | null;
  };
};

function getErrorMessage(error: ImportApiResponse["error"], fallback: string) {
  return error?.message ?? fallback;
}

function getRowStatusLabel(status: ImportRowStatus, copy: ReturnType<typeof getUiCopy>["transactions"]["excel"]) {
  switch (status) {
    case "ready":
      return copy.ready;
    case "skipped_duplicate":
      return copy.skipped;
    case "error":
      return copy.error;
  }
}

export function TransactionExcelTools({ language, onWorkspaceRefresh }: TransactionExcelToolsProps) {
  const copy = getUiCopy(language).transactions.excel;
  const locale = getUiLocale(language);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [downloadingKind, setDownloadingKind] = useState<"template" | "ledger" | null>(null);
  const nonReadyRows = preview?.rows.filter((row) => row.status !== "ready").slice(0, 8) ?? [];
  const isDownloading = downloadingKind != null;
  const isBusy = isPreviewing || isImporting || isRefreshing || isDownloading;
  const isImportLocked = isPreviewing || isImporting || isRefreshing;
  const canCommit =
    selectedFile != null &&
    preview != null &&
    preview.counts.readyRows > 0 &&
    preview.counts.errorRows === 0 &&
    !isPreviewing &&
    !isImporting &&
    !isRefreshing;

  function showDownloadPending(kind: "template" | "ledger") {
    setDownloadingKind(kind);
    window.setTimeout(() => {
      setDownloadingKind((currentKind) => (currentKind === kind ? null : currentKind));
    }, 1600);
  }

  async function submitImport(mode: "preview" | "commit") {
    if (!selectedFile) {
      setErrorMessage(copy.chooseFileFirst);
      return;
    }

    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("file", selectedFile);

    if (mode === "preview") {
      setIsPreviewing(true);
    } else {
      setIsImporting(true);
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/transactions/import", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as ImportApiResponse;
      const nextPreview = payload.preview ?? payload.error?.details?.preview ?? null;

      if (!response.ok) {
        if (nextPreview) {
          setPreview(nextPreview);
        }

        throw new Error(getErrorMessage(payload.error, copy.importFailed));
      }

      setPreview(nextPreview);

      if (mode === "commit") {
        setSelectedFile(null);
        setSuccessMessage(copy.imported(nextPreview?.counts.readyRows ?? 0));

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        if (onWorkspaceRefresh) {
          await onWorkspaceRefresh();
        } else {
          startTransition(() => {
            router.refresh();
          });
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : copy.importFailed);
    } finally {
      setIsPreviewing(false);
      setIsImporting(false);
    }
  }

  return (
    <article className="surface-card transaction-excel-tools" aria-busy={isBusy}>
      <div className="transaction-panel-header transaction-excel-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 className="section-title">{copy.title}</h2>
        </div>
        <div className="transaction-excel-actions">
          <a
            className="compact-button"
            href="/api/transactions/export?template=true"
            onClick={() => showDownloadPending("template")}
            aria-busy={downloadingKind === "template"}
          >
            {downloadingKind === "template" ? (
              <ButtonLoadingContent label={copy.downloadingTemplate}>
                {copy.downloadTemplate}
              </ButtonLoadingContent>
            ) : (
              copy.downloadTemplate
            )}
          </a>
          <a
            className="compact-button"
            href="/api/transactions/export"
            onClick={() => showDownloadPending("ledger")}
            aria-busy={downloadingKind === "ledger"}
          >
            {downloadingKind === "ledger" ? (
              <ButtonLoadingContent label={copy.exportingLedger}>
                {copy.exportLedger}
              </ButtonLoadingContent>
            ) : (
              copy.exportLedger
            )}
          </a>
        </div>
      </div>

      {isBusy ? (
        <PendingBanner
          label={
            downloadingKind === "template"
              ? copy.downloadingTemplate
              : downloadingKind === "ledger"
                ? copy.exportingLedger
                : isPreviewing
                  ? copy.previewing
                  : copy.importing
          }
        />
      ) : null}

      <div className="transaction-excel-import">
        <label
          className="transaction-file-picker"
          aria-disabled={isImportLocked}
          data-has-file={selectedFile != null}
        >
          <span className="transaction-file-picker-label">{copy.file}</span>
          <span className="transaction-file-picker-control">
            <span className="transaction-file-picker-button">{copy.chooseFile}</span>
            <strong>{selectedFile?.name ?? copy.noFileSelected}</strong>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setSelectedFile(nextFile);
              setPreview(null);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            disabled={isImportLocked}
          />
        </label>

        <div className="transaction-excel-import-actions">
          <button
            type="button"
            className="compact-button"
            onClick={() => void submitImport("preview")}
            disabled={!selectedFile || isImportLocked}
          >
            {isPreviewing ? (
              <ButtonLoadingContent label={copy.previewing}>{copy.preview}</ButtonLoadingContent>
            ) : (
              copy.preview
            )}
          </button>
          <button
            type="button"
            className="primary-button transaction-excel-import-button"
            onClick={() => void submitImport("commit")}
            disabled={!canCommit}
          >
            {isImporting || isRefreshing ? (
              <ButtonLoadingContent label={copy.importing}>{copy.importReady}</ButtonLoadingContent>
            ) : (
              copy.importReady
            )}
          </button>
        </div>
      </div>

      {preview ? (
        <div className="transaction-excel-preview" aria-label={copy.previewSummary}>
          <div>
            <span>{copy.total}</span>
            <strong>{preview.counts.totalRows}</strong>
          </div>
          <div>
            <span>{copy.ready}</span>
            <strong>{preview.counts.readyRows}</strong>
          </div>
          <div>
            <span>{copy.skipped}</span>
            <strong>{preview.counts.skippedRows}</strong>
          </div>
          <div data-has-errors={preview.counts.errorRows > 0}>
            <span>{copy.error}</span>
            <strong>{preview.counts.errorRows}</strong>
          </div>
        </div>
      ) : null}

      {nonReadyRows.length > 0 ? (
        <div className="transaction-excel-row-list">
          {nonReadyRows.map((row) => (
            <div key={`${row.rowNumber}-${row.status}`} className="transaction-excel-row">
              <span className={`transaction-excel-status transaction-excel-status-${row.status}`}>
                {getRowStatusLabel(row.status, copy)}
              </span>
              <strong>{copy.row(row.rowNumber)}</strong>
              <span>
                {[row.symbol, row.tradeDate, row.side, row.broker].filter(Boolean).join(" / ") || "-"}
              </span>
              <span>
                {row.quantity == null
                  ? "-"
                  : formatQuantity(row.quantity, { locale })}
                {row.price == null
                  ? ""
                  : ` @ ${row.price.toLocaleString(locale, { maximumFractionDigits: 4 })}`}
              </span>
              <em>{row.message}</em>
            </div>
          ))}
        </div>
      ) : null}

      {errorMessage ? <p className="form-banner form-banner-error">{errorMessage}</p> : null}
      {successMessage ? <p className="form-banner form-banner-success">{successMessage}</p> : null}
    </article>
  );
}
