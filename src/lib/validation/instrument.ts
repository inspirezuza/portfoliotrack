import { z } from "zod";

const providerSymbolPattern = /^[A-Z0-9._=^:-]+$/i;
const displaySymbolPattern = /^[A-Z0-9._-]+$/i;

function normalizeOptionalProviderSymbol(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDefaultProviderSymbol(symbol: string, market: string) {
  if (market === "TH" && !symbol.endsWith(".BK")) {
    return `${symbol}.BK`;
  }

  return symbol;
}

export const instrumentInputSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(1, "Symbol is required.")
      .max(24, "Symbol must be 24 characters or fewer.")
      .regex(
        displaySymbolPattern,
        "Symbol may only contain letters, numbers, dots, underscores, and hyphens.",
      )
      .transform((value) => value.toUpperCase()),
    displayName: z
      .string()
      .trim()
      .min(1, "Display name is required.")
      .max(120, "Display name must be 120 characters or fewer."),
    market: z
      .string()
      .trim()
      .min(1, "Market is required.")
      .max(16, "Market must be 16 characters or fewer.")
      .transform((value) => value.toUpperCase()),
    instrumentType: z
      .string()
      .trim()
      .min(1, "Instrument type is required.")
      .max(24, "Instrument type must be 24 characters or fewer.")
      .transform((value) => value.toUpperCase()),
    currency: z
      .string()
      .trim()
      .length(3, "Currency must be a three-letter code.")
      .transform((value) => value.toUpperCase()),
    providerSymbol: z.preprocess(normalizeOptionalProviderSymbol, z.string()),
  })
  .transform((value) => {
    const providerSymbol =
      value.providerSymbol.length > 0
        ? value.providerSymbol.toUpperCase()
        : getDefaultProviderSymbol(value.symbol, value.market);

    return {
      ...value,
      providerSymbol,
    };
  })
  .refine((value) => providerSymbolPattern.test(value.providerSymbol), {
    message:
      "Provider symbol may only contain letters, numbers, dots, underscores, hyphens, equals signs, colons, and carets.",
    path: ["providerSymbol"],
  });

export type InstrumentInput = z.infer<typeof instrumentInputSchema>;
