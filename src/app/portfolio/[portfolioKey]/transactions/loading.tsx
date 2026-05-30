import { RouteLoadingSkeleton } from "@/components/loading-indicator";

// Mirrors the dashboard boundary one level up: gives the transactions route its
// own instant skeleton on soft navigation instead of freezing on the previous
// page while the server render is in flight.
export default function Loading() {
  return <RouteLoadingSkeleton eyebrow="Ledger" title="Loading transactions" />;
}
