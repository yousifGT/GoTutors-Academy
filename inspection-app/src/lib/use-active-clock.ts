"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The inspection clock. It measures time actually spent on the inspection, not
 * wall-clock from start to finish: it pauses when the page is hidden, so a
 * break, a phone call or a walk to the next classroom doesn't inflate the
 * recorded duration.
 *
 * Visibility is the only signal used. Window focus is not: blur fires for
 * things that are not the inspector stopping work — on mobile the soft keyboard
 * opening can trigger it, and typing a note is exactly when they are working.
 * Pausing there would quietly undercount every visit.
 *
 * `startMs` is what the server already has. The returned value is that plus the
 * segment currently running.
 */
export function useActiveClock(startMs: number) {
  const accumulated = useRef(startMs);
  const segmentStart = useRef<number | null>(Date.now());
  const [display, setDisplay] = useState(startMs);

  const total = useCallback(() => {
    const running = segmentStart.current ? Date.now() - segmentStart.current : 0;
    return accumulated.current + running;
  }, []);

  const pause = useCallback(() => {
    if (segmentStart.current === null) return;
    accumulated.current += Date.now() - segmentStart.current;
    segmentStart.current = null;
  }, []);

  const resume = useCallback(() => {
    if (segmentStart.current === null) segmentStart.current = Date.now();
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
      else resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const tick = setInterval(() => setDisplay(total()), 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(tick);
      pause();
    };
  }, [pause, resume, total]);

  return { display, total, pause, resume };
}
