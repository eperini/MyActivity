"use client";

import { useEffect, useState, useCallback } from "react";

interface SpotlightOverlayProps {
  targetSelector: string;
  padding: number;
  onClick: () => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function SpotlightOverlay({ targetSelector, padding, onClick }: SpotlightOverlayProps) {
  const [rect, setRect] = useState<Rect | null>(null);

  const updateRect = useCallback(() => {
    const el = document.querySelector(targetSelector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      x: r.x - padding,
      y: r.y - padding,
      width: r.width + padding * 2,
      height: r.height + padding * 2,
    });
  }, [targetSelector, padding]);

  useEffect(() => {
    // Initial position
    updateRect();

    // Scroll target into view if needed
    const el = document.querySelector(targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Recalculate after scroll
      setTimeout(updateRect, 400);
    }

    // Watch for resize/scroll
    const observer = new ResizeObserver(updateRect);
    if (el) observer.observe(el);

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [targetSelector, padding, updateRect]);

  // Use evenodd polygon: outer rectangle (clockwise) + inner cutout (counterclockwise)
  const clipPath = rect
    ? `polygon(evenodd,
        0 0, 100% 0, 100% 100%, 0 100%, 0 0,
        ${rect.x}px ${rect.y}px,
        ${rect.x + rect.width}px ${rect.y}px,
        ${rect.x + rect.width}px ${rect.y + rect.height}px,
        ${rect.x}px ${rect.y + rect.height}px,
        ${rect.x}px ${rect.y}px
      )`
    : undefined;

  return (
    <div
      className="fixed inset-0 z-[60] transition-all duration-300"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        clipPath,
      }}
      onClick={(e) => {
        // Only skip if clicking the dark overlay, not the cutout area
        if (rect) {
          const { clientX: cx, clientY: cy } = e;
          const inCutout =
            cx >= rect.x &&
            cx <= rect.x + rect.width &&
            cy >= rect.y &&
            cy <= rect.y + rect.height;
          if (!inCutout) onClick();
        } else {
          onClick();
        }
      }}
    />
  );
}
