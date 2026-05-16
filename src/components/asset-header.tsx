import Link from "next/link";
import type { AssetDetail } from "@/server/assets";
import { InstrumentLogo } from "@/components/instrument-logo";

type AssetHeaderProps = {
  asset: AssetDetail;
};

export function AssetHeader({ asset }: AssetHeaderProps) {
  return (
    <div className="workstation-topbar asset-topbar">
      <div className="asset-title-lockup">
        <InstrumentLogo
          symbol={asset.instrument.symbol}
          displayName={asset.instrument.displayName}
          instrumentType={asset.instrument.instrumentType}
          providerSymbol={asset.instrument.providerSymbol}
          underlyingProviderSymbol={asset.instrument.underlyingProviderSymbol}
          size="lg"
        />
        <div>
          <Link href="/holdings" className="route-link">
            Back to holdings
          </Link>
          <p className="eyebrow">Asset detail</p>
          <h1>
            {asset.instrument.symbol}
            <span className="asset-title-muted"> {asset.instrument.displayName}</span>
          </h1>
        </div>
      </div>
      <a
        href={asset.instrument.providerHistoryUrl}
        target="_blank"
        rel="noreferrer"
        className="state-pill state-pill-muted"
      >
        {asset.instrument.providerSymbol}
      </a>
    </div>
  );
}
