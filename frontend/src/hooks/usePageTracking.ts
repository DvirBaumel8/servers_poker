import { useEffect, useRef } from "react";
import { analytics } from "../utils/analytics";

/**
 * Track page views. Must only be called once per page load.
 * Uses useEffect to avoid calling during render phase.
 */
export function usePageTracking(): void {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current && typeof window !== "undefined") {
      hasTracked.current = true;
      analytics.trackPageView();
    }
  }, []);
}
