"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { PortfolioListItem } from "@/server/portfolios";

type PortfolioApiResponse = {
  portfolio?: PortfolioListItem;
  deletedPortfolio?: PortfolioListItem;
  selectedPortfolio?: PortfolioListItem;
  error?: {
    message: string;
    details?: Record<string, unknown> | null;
  };
};

function getErrorMessage(payload: PortfolioApiResponse, fallback: string) {
  return payload.error?.message ?? fallback;
}

export function PortfolioManagementPanel({
  initialPortfolios,
  selectedPortfolioId
}: {
  initialPortfolios: PortfolioListItem[];
  selectedPortfolioId: number;
}) {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedPortfolio = useMemo(
    () => portfolios.find((portfolio) => portfolio.id === selectedPortfolioId) ?? portfolios[0] ?? null,
    [portfolios, selectedPortfolioId]
  );

  async function requestPortfolio(
    method: "POST" | "PUT" | "DELETE",
    body: Record<string, unknown>,
    fallbackError: string
  ) {
    const response = await fetch("/api/portfolios", {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as PortfolioApiResponse;

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, fallbackError));
    }

    return payload;
  }

  function handleCreate() {
    startTransition(async () => {
      try {
        setError(null);
        setMessage(null);
        const payload = await requestPortfolio("POST", { name: newName }, "Portfolio could not be created.");

        if (payload.portfolio) {
          setPortfolios((current) => [...current, payload.portfolio!].sort((left, right) => left.name.localeCompare(right.name)));
          setNewName("");
          setMessage(`${payload.portfolio.name} created.`);
        }

        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Portfolio could not be created.");
      }
    });
  }

  function handleRename(portfolio: PortfolioListItem) {
    const nextName = window.prompt("Rename portfolio", portfolio.name);

    if (nextName == null) {
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        setMessage(null);
        const payload = await requestPortfolio(
          "PUT",
          { id: portfolio.id, name: nextName },
          "Portfolio could not be updated."
        );

        if (payload.portfolio) {
          setPortfolios((current) =>
            current
              .map((item) => (item.id === payload.portfolio!.id ? payload.portfolio! : item))
              .sort((left, right) => left.name.localeCompare(right.name))
          );
          setMessage(`${payload.portfolio.name} updated.`);
        }

        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Portfolio could not be updated.");
      }
    });
  }

  function handleSetDefault(portfolio: PortfolioListItem) {
    startTransition(async () => {
      try {
        setError(null);
        setMessage(null);
        const payload = await requestPortfolio(
          "PUT",
          { id: portfolio.id, isDefault: true },
          "Default portfolio could not be updated."
        );

        if (payload.portfolio) {
          setPortfolios((current) =>
            current.map((item) => ({
              ...item,
              isDefault: item.id === payload.portfolio!.id
            }))
          );
          setMessage(`${payload.portfolio.name} is now default.`);
        }

        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Default portfolio could not be updated.");
      }
    });
  }

  function handleDelete(portfolio: PortfolioListItem) {
    const shouldDelete = window.confirm(
      `Delete ${portfolio.name} and all of its transactions permanently?`
    );

    if (!shouldDelete) {
      return;
    }

    const confirmationName = window.prompt(`Type "${portfolio.name}" to confirm deletion.`);

    if (confirmationName == null) {
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        setMessage(null);
        const payload = await requestPortfolio(
          "DELETE",
          { id: portfolio.id, confirmationName },
          "Portfolio could not be deleted."
        );

        if (payload.deletedPortfolio) {
          setPortfolios((current) => current.filter((item) => item.id !== payload.deletedPortfolio!.id));
          setMessage(`${payload.deletedPortfolio.name} deleted.`);
        }

        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Portfolio could not be deleted.");
      }
    });
  }

  return (
    <section className="portfolio-management-panel">
      <article className="surface-card portfolio-create-card">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2 className="section-title">Create portfolio</h2>
          {selectedPortfolio ? <p className="metric-detail">Current: {selectedPortfolio.name}</p> : null}
        </div>

        <div className="portfolio-create-form">
          <label>
            <span className="field-label">Name</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
              placeholder="Long-term, Trading, Retirement"
            />
          </label>
          <button type="button" className="primary-button" onClick={handleCreate} disabled={isPending}>
            Create
          </button>
        </div>

        {message ? <p className="form-success-message">{message}</p> : null}
        {error ? <p className="form-error-message">{error}</p> : null}
      </article>

      <article className="surface-card">
        <div className="transaction-panel-header">
          <div>
            <p className="eyebrow">Portfolios</p>
            <h2 className="section-title">Manage portfolios</h2>
          </div>
        </div>

        <div className="portfolio-list">
          {portfolios.map((portfolio) => (
            <div key={portfolio.id} className="portfolio-row">
              <div>
                <strong>{portfolio.name}</strong>
                <span>{portfolio.isDefault ? "Default" : "Portfolio"}</span>
              </div>

              <div className="portfolio-row-actions">
                <button type="button" className="secondary-button" onClick={() => handleRename(portfolio)} disabled={isPending}>
                  Rename
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleSetDefault(portfolio)}
                  disabled={isPending || portfolio.isDefault}
                >
                  Set default
                </button>
                <button type="button" className="danger-button" onClick={() => handleDelete(portfolio)} disabled={isPending}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
