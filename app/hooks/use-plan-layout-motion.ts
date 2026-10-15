"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createLayout } from "animejs/layout";

/** React owns the nodes; Anime.js measures their before/after layout only. */
export function usePlanLayoutMotion(mode: string, planIds: string, visibleIds: string, layoutShape = "single") {
  const root = useRef<HTMLDivElement>(null);
  const layout = useRef<ReturnType<typeof createLayout> | null>(null);
  const previous = useRef<{ mode: string; planIds: string; width: number } | null>(null);
  const allowed = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.inputMethod !== "keyboard";

  const prepare = useCallback(() => {
    // Record before React changes class names. This also interrupts running motion.
    if (layout.current && allowed()) {
      layout.current.record();
    }
  }, []);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || (layout.current && layout.current.root !== element)) {
      layout.current?.revert();
      layout.current = null;
      previous.current = null;
      if (!element) return;
    }
    if (!layout.current) {
      layout.current = createLayout(element, {
        children: ".plan-entry",
        properties: [],
        duration: 240,
        ease: "out(3)",
        enterFrom: { transform: "translateY(12px) scale(.98)", opacity: 0, duration: 200 },
        leaveTo: { transform: "translateY(-6px) scale(.98)", opacity: 0, duration: 160 },
      });
    }
    const width = window.innerWidth;
    const old = previous.current;
    const changed = !!old && (old.mode !== mode || old.planIds !== planIds);
    if (changed && old.width === width && allowed()) {
      layout.current.animate({ onComplete: () => { layout.current?.record(); } });
    } else {
      // Initial loading, search/paging, keyboard and reduced motion are immediate.
      layout.current.revert();
      layout.current.record();
    }
    previous.current = { mode, planIds, width };
  }, [mode, planIds, visibleIds, layoutShape]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { layout.current?.revert(); layout.current?.record(); };
    const keyboard = () => { if (root.current?.classList.contains("is-animated")) stop(); };
    preference.addEventListener("change", stop);
    document.addEventListener("keydown", keyboard);
    return () => {
      preference.removeEventListener("change", stop);
      document.removeEventListener("keydown", keyboard);
      layout.current?.revert();
      layout.current = null;
    };
  }, []);

  return { root, prepare };
}
