"use client";

import { useEffect, useRef, useState } from "react";

export function useChartVisibilityKey() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasBecomeVisibleRef = useRef(false);
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;

    if (container == null) {
      return;
    }

    const observedContainer = container;

    function refreshWhenMeasurable() {
      if (hasBecomeVisibleRef.current) {
        return;
      }

      const rect = observedContainer.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      hasBecomeVisibleRef.current = true;
      setRenderKey((current) => current + 1);
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        refreshWhenMeasurable();
      }
    }, { threshold: 0.01 });

    observer.observe(observedContainer);
    requestAnimationFrame(refreshWhenMeasurable);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { chartContainerRef: containerRef, chartRenderKey: renderKey };
}
