"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { TourStep } from "./types";

interface TourTooltipProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  isFirst: boolean;
  isLast: boolean;
}

type Placement = "top" | "bottom" | "left" | "right";

interface Position {
  top: number;
  left: number;
  placement: Placement;
}

const TOOLTIP_MARGIN = 12;
const ARROW_SIZE = 8;

function computePlacement(
  targetRect: DOMRect,
  tooltipW: number,
  tooltipH: number,
  preferred?: Placement | "auto",
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceTop = targetRect.top;
  const spaceBottom = vh - targetRect.bottom;
  const spaceLeft = targetRect.left;
  const spaceRight = vw - targetRect.right;

  let placement: Placement;

  if (preferred && preferred !== "auto") {
    placement = preferred;
  } else {
    // Pick the side with most space
    const spaces: [Placement, number][] = [
      ["bottom", spaceBottom],
      ["top", spaceTop],
      ["right", spaceRight],
      ["left", spaceLeft],
    ];
    spaces.sort((a, b) => b[1] - a[1]);
    placement = spaces[0][0];
  }

  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = targetRect.bottom + TOOLTIP_MARGIN + ARROW_SIZE;
      left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
      break;
    case "top":
      top = targetRect.top - tooltipH - TOOLTIP_MARGIN - ARROW_SIZE;
      left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
      break;
    case "right":
      top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
      left = targetRect.right + TOOLTIP_MARGIN + ARROW_SIZE;
      break;
    case "left":
      top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
      left = targetRect.left - tooltipW - TOOLTIP_MARGIN - ARROW_SIZE;
      break;
  }

  // Clamp to viewport
  left = Math.max(16, Math.min(left, vw - tooltipW - 16));
  top = Math.max(16, Math.min(top, vh - tooltipH - 16));

  return { top, left, placement };
}

function Arrow({ placement, targetRect, tooltipLeft }: { placement: Placement; targetRect: DOMRect; tooltipLeft: number }) {
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  const base = `w-0 h-0 absolute`;

  switch (placement) {
    case "bottom":
      return (
        <div
          className={base}
          style={{
            top: -ARROW_SIZE,
            left: Math.max(16, Math.min(targetCenterX - tooltipLeft, 360)),
            borderLeft: `${ARROW_SIZE}px solid transparent`,
            borderRight: `${ARROW_SIZE}px solid transparent`,
            borderBottom: `${ARROW_SIZE}px solid #09090b`,
          }}
        />
      );
    case "top":
      return (
        <div
          className={base}
          style={{
            bottom: -ARROW_SIZE,
            left: Math.max(16, Math.min(targetCenterX - tooltipLeft, 360)),
            borderLeft: `${ARROW_SIZE}px solid transparent`,
            borderRight: `${ARROW_SIZE}px solid transparent`,
            borderTop: `${ARROW_SIZE}px solid #09090b`,
          }}
        />
      );
    case "right":
      return (
        <div
          className={base}
          style={{
            left: -ARROW_SIZE,
            top: Math.max(16, targetCenterY),
            borderTop: `${ARROW_SIZE}px solid transparent`,
            borderBottom: `${ARROW_SIZE}px solid transparent`,
            borderRight: `${ARROW_SIZE}px solid #09090b`,
          }}
        />
      );
    case "left":
      return (
        <div
          className={base}
          style={{
            right: -ARROW_SIZE,
            top: Math.max(16, targetCenterY),
            borderTop: `${ARROW_SIZE}px solid transparent`,
            borderBottom: `${ARROW_SIZE}px solid transparent`,
            borderLeft: `${ARROW_SIZE}px solid #09090b`,
          }}
        />
      );
  }
}

export default function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  isFirst,
  isLast,
}: TourTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [visible, setVisible] = useState(false);

  const updatePosition = useCallback(() => {
    setIsMobile(window.innerWidth < 768);

    const el = document.querySelector(step.target);
    if (!el || !tooltipRef.current) return;

    const tRect = el.getBoundingClientRect();
    setTargetRect(tRect);

    if (window.innerWidth < 768) {
      // Mobile: bottom sheet
      setPosition({ top: 0, left: 0, placement: "bottom" });
      return;
    }

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const pos = computePlacement(
      tRect,
      tooltipRect.width,
      tooltipRect.height,
      step.placement,
    );
    setPosition(pos);
  }, [step.target, step.placement]);

  useEffect(() => {
    setVisible(false);
    // Small delay to allow DOM to settle after beforeShow navigation
    const timer = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, 200);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [step.target, updatePosition]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
      if (e.key === "ArrowRight" || e.key === "Enter") onNext();
      if (e.key === "ArrowLeft" && !isFirst) onPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onNext, onPrev, onSkip, isFirst]);

  if (isMobile) {
    return (
      <div
        ref={tooltipRef}
        className={`fixed bottom-0 left-0 right-0 z-[70] bg-zinc-950 border-t border-zinc-600 rounded-t-2xl p-5 pb-8 transition-all duration-200 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
        role="dialog"
        aria-live="polite"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-[var(--z-text-primary)]">{step.title}</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--z-text-muted)]">
              {stepIndex + 1} / {totalSteps}
            </span>
            <button onClick={onSkip} className="text-[var(--z-text-muted)] hover:text-[var(--z-text-primary)]">
              <X size={16} />
            </button>
          </div>
        </div>
        <p className="text-sm text-[var(--z-text-secondary)] mb-5 leading-relaxed">{step.content}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={isFirst}
            className="flex items-center gap-1 text-sm text-[var(--z-text-muted)] hover:text-[var(--z-text-primary)] disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronLeft size={14} /> Indietro
          </button>
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === stepIndex ? "bg-blue-500" : "bg-[var(--z-text-muted)]/30"
                }`}
              />
            ))}
          </div>
          <button
            onClick={onNext}
            className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isLast ? "Fine" : "Avanti"} {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-[70] w-[380px] max-w-[calc(100vw-32px)] bg-zinc-950 border border-zinc-600 rounded-xl shadow-2xl ring-1 ring-black/50 p-5 transition-all duration-150 ${
        visible && position ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
      }
      role="dialog"
      aria-live="polite"
    >
      {position && targetRect && (
        <Arrow placement={position.placement} targetRect={targetRect} tooltipLeft={position.left} />
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--z-text-primary)]">{step.title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--z-text-muted)]">
            {stepIndex + 1} / {totalSteps}
          </span>
          <button onClick={onSkip} className="text-[var(--z-text-muted)] hover:text-[var(--z-text-primary)] transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <p className="text-[13px] text-[var(--z-text-secondary)] mb-4 leading-relaxed">{step.content}</p>

      <div className="flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={isFirst}
          className="flex items-center gap-0.5 text-xs text-[var(--z-text-muted)] hover:text-[var(--z-text-primary)] disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          <ChevronLeft size={12} /> Indietro
        </button>
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === stepIndex ? "bg-blue-500" : "bg-zinc-600"
              }`}
            />
          ))}
        </div>
        <button
          onClick={onNext}
          className="flex items-center gap-0.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
        >
          {isLast ? "Fine" : "Avanti"} {!isLast && <ChevronRight size={12} />}
        </button>
      </div>
    </div>
  );
}
