"use client";

import Image from "next/image";
import { useState } from "react";

type InstrumentLogoProps = {
  symbol: string;
  displayName?: string | null;
  instrumentType?: string | null;
  providerSymbol?: string | null;
  underlyingProviderSymbol?: string | null;
  size?: "sm" | "md" | "lg";
};

function normalizeLogoSymbol(symbol: string) {
  return symbol.trim().toUpperCase().split(".")[0];
}

function getLogoLookupSymbol({
  symbol,
  instrumentType,
  providerSymbol,
  underlyingProviderSymbol
}: InstrumentLogoProps) {
  if (instrumentType === "DR" && underlyingProviderSymbol != null) {
    return normalizeLogoSymbol(underlyingProviderSymbol);
  }

  return normalizeLogoSymbol(providerSymbol ?? symbol);
}

function getInitials(symbol: string) {
  return normalizeLogoSymbol(symbol).slice(0, 2);
}

export function InstrumentLogo({
  symbol,
  displayName,
  instrumentType = null,
  providerSymbol = null,
  underlyingProviderSymbol = null,
  size = "md"
}: InstrumentLogoProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const logoSymbol = getLogoLookupSymbol({
    symbol,
    instrumentType,
    providerSymbol,
    underlyingProviderSymbol
  });
  const imageUrl = `https://financialmodelingprep.com/image-stock/${encodeURIComponent(logoSymbol)}.png`;
  const label = displayName == null ? `${symbol} logo` : `${displayName} logo`;

  return (
    <span className={`instrument-logo instrument-logo-${size}`} aria-label={label}>
      {hasImageError ? (
        <span className="instrument-logo-fallback" aria-hidden="true">
          {getInitials(symbol)}
        </span>
      ) : (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={size === "lg" ? "44px" : size === "sm" ? "24px" : "30px"}
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      )}
    </span>
  );
}
