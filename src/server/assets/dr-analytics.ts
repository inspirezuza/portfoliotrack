import { normalizeMoney } from "@/lib/db/precision";
import type { Instrument } from "@/lib/db/schema";
import type { MarketQuoteSnapshot } from "@/lib/market/types";
import type { AssetDetail } from "@/server/assets";

function hasDrMetadata(instrument: Instrument) {
  return (
    instrument.underlyingSymbol != null ||
    instrument.underlyingDisplayName != null ||
    instrument.underlyingCurrency != null ||
    instrument.underlyingProviderSymbol != null ||
    instrument.drRatio != null ||
    instrument.fxProviderSymbol != null
  );
}

export function shouldExposeDrAnalytics(instrument: Instrument) {
  return instrument.instrumentType === "DR" || hasDrMetadata(instrument);
}

function isPositiveFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function divideIfAvailable(numerator: number | null, denominator: number | null) {
  if (numerator == null || !isPositiveFiniteNumber(denominator)) {
    return null;
  }

  return numerator / denominator;
}

function getQuoteByProviderSymbol(quotes: MarketQuoteSnapshot[], providerSymbol: string) {
  return quotes.find((quote) => quote.providerSymbol === providerSymbol) ?? null;
}

async function getDrProviderQuotes(instrument: Instrument) {
  if (
    instrument.underlyingProviderSymbol == null ||
    instrument.underlyingCurrency == null ||
    instrument.fxProviderSymbol == null
  ) {
    return {
      parentQuote: null,
      fxQuote: null,
      analyticsIssue: "DR metadata is incomplete, so parent and FX analytics are unavailable.",
    };
  }

  try {
    const { getMarketDataProvider } = await import("@/lib/market/provider");
    const provider = getMarketDataProvider();
    const quotes = await provider.getLatestQuotes([
      instrument.underlyingProviderSymbol,
      instrument.fxProviderSymbol,
    ]);
    const parentQuote = getQuoteByProviderSymbol(quotes, instrument.underlyingProviderSymbol);
    const fxQuote = getQuoteByProviderSymbol(quotes, instrument.fxProviderSymbol);

    if (parentQuote == null) {
      return {
        parentQuote: null,
        fxQuote,
        analyticsIssue: `Latest parent quote is unavailable for ${instrument.underlyingProviderSymbol}.`,
      };
    }

    if (parentQuote.currency !== instrument.underlyingCurrency) {
      return {
        parentQuote: null,
        fxQuote,
        analyticsIssue: `Latest parent quote returned ${parentQuote.currency}, but ${instrument.underlyingSymbol ?? instrument.underlyingProviderSymbol} is tracked in ${instrument.underlyingCurrency}.`,
      };
    }

    if (fxQuote == null) {
      return {
        parentQuote,
        fxQuote: null,
        analyticsIssue: `Latest FX quote is unavailable for ${instrument.fxProviderSymbol}.`,
      };
    }

    if (fxQuote.currency !== instrument.currency) {
      return {
        parentQuote,
        fxQuote: null,
        analyticsIssue: `Latest FX quote returned ${fxQuote.currency}, but ${instrument.fxProviderSymbol} is expected in ${instrument.currency}.`,
      };
    }

    return {
      parentQuote,
      fxQuote,
      analyticsIssue: null,
    };
  } catch {
    return {
      parentQuote: null,
      fxQuote: null,
      analyticsIssue: "DR parent and FX quotes are unavailable from the provider right now.",
    };
  }
}

export function buildDrAnalyticsSnapshot({
  instrument,
  drPrice,
  averageDrCost,
  parentQuote,
  fxQuote,
  analyticsIssue,
}: {
  instrument: Instrument;
  drPrice: number | null;
  averageDrCost: number | null;
  parentQuote: MarketQuoteSnapshot | null;
  fxQuote: MarketQuoteSnapshot | null;
  analyticsIssue: string | null;
}): AssetDetail["dr"] {
  if (!shouldExposeDrAnalytics(instrument)) {
    return null;
  }

  const parentMarketPrice = isPositiveFiniteNumber(parentQuote?.price) ? parentQuote.price : null;
  const fxRate = isPositiveFiniteNumber(fxQuote?.price) ? fxQuote.price : null;
  const impliedParentPrice =
    isPositiveFiniteNumber(drPrice) && isPositiveFiniteNumber(instrument.drRatio) && fxRate != null
      ? normalizeMoney((drPrice * instrument.drRatio) / fxRate)
      : null;
  const averageImpliedParentCost =
    isPositiveFiniteNumber(averageDrCost) &&
    isPositiveFiniteNumber(instrument.drRatio) &&
    fxRate != null
      ? normalizeMoney((averageDrCost * instrument.drRatio) / fxRate)
      : null;
  const premiumDiscount = divideIfAvailable(impliedParentPrice, parentMarketPrice);

  return {
    underlyingSymbol: instrument.underlyingSymbol,
    underlyingDisplayName: instrument.underlyingDisplayName,
    underlyingCurrency: instrument.underlyingCurrency,
    underlyingProviderSymbol: instrument.underlyingProviderSymbol,
    drRatio: instrument.drRatio,
    fxProviderSymbol: instrument.fxProviderSymbol,
    parentMarketPrice,
    parentMarketPriceAsOf: parentQuote?.asOf ?? null,
    parentMarketPriceSource: parentQuote?.source ?? null,
    fxRate,
    fxRateAsOf: fxQuote?.asOf ?? null,
    fxRateSource: fxQuote?.source ?? null,
    impliedParentPrice,
    averageImpliedParentCost,
    premiumDiscount: premiumDiscount == null ? null : premiumDiscount - 1,
    analyticsIssue,
  };
}

export async function buildDrAnalytics({
  instrument,
  drPrice,
  averageDrCost,
  allowProviderQuotes,
}: {
  instrument: Instrument;
  drPrice: number | null;
  averageDrCost: number | null;
  allowProviderQuotes: boolean;
}): Promise<AssetDetail["dr"]> {
  if (!shouldExposeDrAnalytics(instrument)) {
    return null;
  }

  const hasCompleteCalculationMetadata =
    allowProviderQuotes &&
    isPositiveFiniteNumber(instrument.drRatio) &&
    instrument.underlyingProviderSymbol != null &&
    instrument.underlyingCurrency != null &&
    instrument.fxProviderSymbol != null;
  const { parentQuote, fxQuote, analyticsIssue } = hasCompleteCalculationMetadata
    ? await getDrProviderQuotes(instrument)
    : {
        parentQuote: null,
        fxQuote: null,
        analyticsIssue: allowProviderQuotes
          ? "DR metadata is incomplete, so parent and FX analytics are unavailable."
          : "Login and refresh market data to calculate live DR parent and FX analytics.",
      };

  return buildDrAnalyticsSnapshot({
    instrument,
    drPrice,
    averageDrCost,
    parentQuote,
    fxQuote,
    analyticsIssue,
  });
}
