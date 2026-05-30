import { RouteLoadingSkeleton } from "@/components/loading-indicator";

// Without a segment-level loading boundary, a soft navigation into the dashboard
// keeps the previous page (e.g. transactions) on screen until the server render
// finishes. On a cold Neon compute that wait is several seconds, so the click
// feels like it did nothing. This boundary swaps in an instant skeleton instead.
export default function Loading() {
  return <RouteLoadingSkeleton eyebrow="Dashboard" title="Loading dashboard" />;
}
