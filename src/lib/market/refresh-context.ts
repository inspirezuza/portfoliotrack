import type { instruments } from "@/lib/db/schema";

export type RefreshTarget = {
  instrument: typeof instruments.$inferSelect;
  historyStartDate: string | null;
};

export type RefreshContext = {
  benchmarkSymbol: string | null;
  marketRefreshMinutes: number;
  targets: RefreshTarget[];
};

function contextCoversTarget(existingTarget: RefreshTarget, requestedTarget: RefreshTarget) {
  if (
    existingTarget.instrument.id !== requestedTarget.instrument.id ||
    existingTarget.instrument.providerSymbol !== requestedTarget.instrument.providerSymbol
  ) {
    return false;
  }

  if (requestedTarget.historyStartDate == null) {
    return true;
  }

  return (
    existingTarget.historyStartDate != null &&
    existingTarget.historyStartDate <= requestedTarget.historyStartDate
  );
}

export function contextCoversRequest(
  existingContext: RefreshContext,
  requestedContext: RefreshContext,
) {
  const existingTargetsByInstrumentId = new Map(
    existingContext.targets.map((target) => [target.instrument.id, target] as const),
  );

  return requestedContext.targets.every((requestedTarget) => {
    const existingTarget = existingTargetsByInstrumentId.get(requestedTarget.instrument.id);

    return existingTarget != null && contextCoversTarget(existingTarget, requestedTarget);
  });
}
