import "server-only";

import { asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { portfolios, type Portfolio } from "@/lib/db/schema";

export type PortfolioListItem = {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export class PortfolioServiceError extends Error {
  readonly code:
    | "VALIDATION_ERROR"
    | "PORTFOLIO_NOT_FOUND"
    | "DUPLICATE_PORTFOLIO"
    | "LAST_PORTFOLIO"
    | "CONFIRMATION_REQUIRED"
    | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: PortfolioServiceError["code"],
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PortfolioServiceError";
    this.code = code;
    this.details = details;
  }
}

function mapPortfolio(portfolio: Portfolio): PortfolioListItem {
  return {
    id: portfolio.id,
    name: portfolio.name,
    isDefault: portfolio.isDefault,
    createdAt: portfolio.createdAt,
    updatedAt: portfolio.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown) {
  if (error instanceof Error && "code" in error && error.code === "23505") {
    return true;
  }

  const cause = error instanceof Error ? error.cause : null;

  return cause instanceof Error && "code" in cause && cause.code === "23505";
}

export function parsePortfolioId(input: unknown) {
  const id = Number(input);

  if (!Number.isInteger(id) || id <= 0) {
    throw new PortfolioServiceError("VALIDATION_ERROR", "Portfolio id must be a positive integer.");
  }

  return id;
}

function parsePortfolioName(input: unknown) {
  const name = typeof input === "string" ? input.trim() : "";

  if (name.length === 0) {
    throw new PortfolioServiceError("VALIDATION_ERROR", "Portfolio name is required.");
  }

  if (name.length > 80) {
    throw new PortfolioServiceError(
      "VALIDATION_ERROR",
      "Portfolio name must be 80 characters or fewer.",
    );
  }

  return name;
}

function parseDeleteConfirmation(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

export async function listPortfolios() {
  const rows = await db.select().from(portfolios).orderBy(asc(portfolios.name), asc(portfolios.id));

  return rows.map(mapPortfolio);
}

export async function ensureDefaultPortfolio(): Promise<PortfolioListItem> {
  const rows = await db.select().from(portfolios).orderBy(asc(portfolios.id));
  const existingDefault = rows.find((portfolio) => portfolio.isDefault) ?? rows[0] ?? null;

  if (existingDefault != null) {
    if (!existingDefault.isDefault) {
      await db
        .update(portfolios)
        .set({ isDefault: true, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(portfolios.id, existingDefault.id));
    }

    return mapPortfolio({ ...existingDefault, isDefault: true });
  }

  try {
    const [createdPortfolio] = await db
      .insert(portfolios)
      .values({
        name: "Main Portfolio",
        isDefault: true,
      })
      .returning();

    return mapPortfolio(createdPortfolio);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const fallbackRows = await db.select().from(portfolios).orderBy(asc(portfolios.id));
  const fallbackPortfolio =
    fallbackRows.find((portfolio) => portfolio.isDefault) ?? fallbackRows[0] ?? null;

  if (fallbackPortfolio == null) {
    throw new PortfolioServiceError("INTERNAL_ERROR", "Default portfolio could not be created.");
  }

  if (!fallbackPortfolio.isDefault) {
    await db
      .update(portfolios)
      .set({ isDefault: true, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(portfolios.id, fallbackPortfolio.id));
  }

  return mapPortfolio({ ...fallbackPortfolio, isDefault: true });
}

export async function getPortfolioById(idInput: unknown) {
  const id = parsePortfolioId(idInput);
  const [portfolio] = await db.select().from(portfolios).where(eq(portfolios.id, id));

  return portfolio == null ? null : mapPortfolio(portfolio);
}

export async function createPortfolio(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new PortfolioServiceError("VALIDATION_ERROR", "Portfolio payload must be an object.");
  }

  const payload = input as Record<string, unknown>;
  const name = parsePortfolioName(payload.name);

  try {
    const [createdPortfolio] = await db
      .insert(portfolios)
      .values({
        name,
        isDefault: false,
      })
      .returning();

    return mapPortfolio(createdPortfolio);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new PortfolioServiceError(
        "DUPLICATE_PORTFOLIO",
        "A portfolio with that name already exists.",
        {
          name,
        },
      );
    }

    throw error;
  }
}

export async function updatePortfolio(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new PortfolioServiceError(
      "VALIDATION_ERROR",
      "Portfolio update payload must be an object.",
    );
  }

  const payload = input as Record<string, unknown>;
  const id = parsePortfolioId(payload.id);
  const nextName = payload.name == null ? null : parsePortfolioName(payload.name);
  const shouldSetDefault = payload.isDefault === true;

  try {
    const updatedPortfolio = await db.transaction(async (tx) => {
      const [existingPortfolio] = await tx.select().from(portfolios).where(eq(portfolios.id, id));

      if (existingPortfolio == null) {
        throw new PortfolioServiceError("PORTFOLIO_NOT_FOUND", `Portfolio ${id} does not exist.`);
      }

      if (shouldSetDefault) {
        await tx.update(portfolios).set({ isDefault: false });
      }

      const [updated] = await tx
        .update(portfolios)
        .set({
          name: nextName ?? existingPortfolio.name,
          isDefault: shouldSetDefault ? true : existingPortfolio.isDefault,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(portfolios.id, id))
        .returning();

      return updated;
    });

    return mapPortfolio(updatedPortfolio);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new PortfolioServiceError(
        "DUPLICATE_PORTFOLIO",
        "A portfolio with that name already exists.",
        {
          name: nextName,
        },
      );
    }

    throw error;
  }
}

export async function deletePortfolio(input: unknown) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new PortfolioServiceError(
      "VALIDATION_ERROR",
      "Portfolio delete payload must be an object.",
    );
  }

  const payload = input as Record<string, unknown>;
  const id = parsePortfolioId(payload.id);
  const confirmationName = parseDeleteConfirmation(payload.confirmationName);

  return db.transaction(async (tx) => {
    const [portfolio] = await tx.select().from(portfolios).where(eq(portfolios.id, id));

    if (portfolio == null) {
      throw new PortfolioServiceError("PORTFOLIO_NOT_FOUND", `Portfolio ${id} does not exist.`);
    }

    if (confirmationName !== portfolio.name) {
      throw new PortfolioServiceError(
        "CONFIRMATION_REQUIRED",
        "Portfolio deletion must be confirmed with the portfolio name.",
        {
          portfolioName: portfolio.name,
        },
      );
    }

    const remainingPortfolios = await tx
      .select()
      .from(portfolios)
      .where(ne(portfolios.id, id))
      .orderBy(asc(portfolios.id));

    if (remainingPortfolios.length === 0) {
      throw new PortfolioServiceError("LAST_PORTFOLIO", "The last portfolio cannot be deleted.");
    }

    await tx.delete(portfolios).where(eq(portfolios.id, id));

    const nextDefault =
      remainingPortfolios.find((remainingPortfolio) => remainingPortfolio.isDefault) ??
      remainingPortfolios[0];

    if (portfolio.isDefault || !nextDefault.isDefault) {
      await tx.update(portfolios).set({ isDefault: false });
      await tx
        .update(portfolios)
        .set({ isDefault: true, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(portfolios.id, nextDefault.id));
    }

    const [selectedPortfolio] = await tx
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, nextDefault.id));

    if (selectedPortfolio == null) {
      throw new PortfolioServiceError(
        "INTERNAL_ERROR",
        "Replacement portfolio could not be loaded.",
      );
    }

    return {
      deletedPortfolio: mapPortfolio(portfolio),
      selectedPortfolio: mapPortfolio({ ...selectedPortfolio, isDefault: true }),
    };
  });
}
