import { useRef, type RefObject, type TouchEvent } from "react";
import type { RechartsMouseState } from "@/lib/charts/recharts-state";

type ChartTouchScrubParams<TPoint extends { timestamp?: number }> = {
  chartData: readonly TPoint[];
  xDomain: [number, number] | undefined;
  containerRef: RefObject<HTMLElement | null>;
  onStart: (state: RechartsMouseState) => void;
  onMove: (state: RechartsMouseState) => void;
  onEnd: () => void;
};

/**
 * Bridges touch gestures to the chart's existing recharts mouse handlers so that
 * dragging a finger across a line/area chart scrubs the crosshair + readout
 * (drag-to-compare) on mobile.
 *
 * Rather than relying on recharts' own touch event forwarding (which differs
 * across versions), this resolves the active point ourselves from the touch X
 * coordinate: it maps the finger position across the rendered plot area to the
 * time domain, then picks the nearest datum by timestamp (correct for the
 * time-scaled x-axis, where points are not evenly spaced). The resolved index is
 * handed to the same handlers the mouse uses via a synthesized state object.
 *
 * Pair with `touch-action: pan-y` on the chart container so a horizontal drag
 * scrubs while a vertical drag still scrolls the page. Listeners are passive
 * (React attaches touch handlers passively), so we never call preventDefault.
 */
export function useChartTouchScrub<TPoint extends { timestamp?: number }>({
  chartData,
  xDomain,
  containerRef,
  onStart,
  onMove,
  onEnd,
}: ChartTouchScrubParams<TPoint>) {
  const isScrubbingRef = useRef(false);

  function resolveActiveIndex(clientX: number): number | null {
    const container = containerRef.current;

    if (container == null || xDomain == null || chartData.length === 0) {
      return null;
    }

    // The cartesian grid spans exactly the plot area (axes excluded), so its
    // client rect is the right reference frame for mapping the touch position.
    const plotElement =
      container.querySelector(".recharts-cartesian-grid") ??
      container.querySelector(".recharts-surface");
    const rect = plotElement?.getBoundingClientRect();

    if (rect == null || rect.width === 0) {
      return null;
    }

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetTimestamp = xDomain[0] + ratio * (xDomain[1] - xDomain[0]);

    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < chartData.length; index += 1) {
      const timestamp = chartData[index]?.timestamp;

      if (timestamp == null) {
        continue;
      }

      const distance = Math.abs(timestamp - targetTimestamp);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];

    if (touch == null) {
      return;
    }

    const activeIndex = resolveActiveIndex(touch.clientX);

    if (activeIndex == null) {
      return;
    }

    isScrubbingRef.current = true;
    onStart({ activeIndex });
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isScrubbingRef.current) {
      return;
    }

    const touch = event.touches[0];

    if (touch == null) {
      return;
    }

    const activeIndex = resolveActiveIndex(touch.clientX);

    if (activeIndex == null) {
      return;
    }

    onMove({ activeIndex });
  }

  function handleTouchEnd() {
    if (!isScrubbingRef.current) {
      return;
    }

    isScrubbingRef.current = false;
    onEnd();
  }

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}
