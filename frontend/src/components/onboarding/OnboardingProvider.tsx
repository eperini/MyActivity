"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { Tour, TourStep } from "./types";
import { tours } from "./tours";
import SpotlightOverlay from "./SpotlightOverlay";
import TourTooltip from "./TourTooltip";

interface OnboardingState {
  isActive: boolean;
  currentTourId: string | null;
  currentStepIndex: number;
}

interface OnboardingContextValue {
  state: OnboardingState;
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  endTour: () => void;
  completedTours: string[];
  registerNavigator: (fn: (view: string) => void) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}

function getCompletedTours(): string[] {
  try {
    return JSON.parse(localStorage.getItem("zeno_completed_tours") || "[]");
  } catch {
    return [];
  }
}

function saveCompletedTours(tours: string[]) {
  localStorage.setItem("zeno_completed_tours", JSON.stringify(tours));
}

export default function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>({
    isActive: false,
    currentTourId: null,
    currentStepIndex: 0,
  });
  const [completedTours, setCompletedTours] = useState<string[]>(() => getCompletedTours());
  const navigatorRef = useRef<((view: string) => void) | null>(null);

  const currentTour: Tour | undefined = state.currentTourId
    ? tours.find((t) => t.id === state.currentTourId)
    : undefined;

  const currentStep: TourStep | undefined = currentTour
    ? currentTour.steps[state.currentStepIndex]
    : undefined;

  const registerNavigator = useCallback((fn: (view: string) => void) => {
    navigatorRef.current = fn;
  }, []);

  const executeBeforeShow = useCallback((step: TourStep) => {
    if (step.beforeShow) {
      step.beforeShow();
    }
  }, []);

  const startTour = useCallback((tourId: string) => {
    const tour = tours.find((t) => t.id === tourId);
    if (!tour || tour.steps.length === 0) return;

    setState({ isActive: true, currentTourId: tourId, currentStepIndex: 0 });

    // Execute beforeShow for first step after a tick (allow DOM to update)
    setTimeout(() => {
      executeBeforeShow(tour.steps[0]);
    }, 100);
  }, [executeBeforeShow]);

  const nextStep = useCallback(() => {
    if (!currentTour) return;

    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex >= currentTour.steps.length) {
      // Tour complete
      const updated = [...completedTours, currentTour.id].filter(
        (v, i, a) => a.indexOf(v) === i
      );
      setCompletedTours(updated);
      saveCompletedTours(updated);
      setState({ isActive: false, currentTourId: null, currentStepIndex: 0 });
      return;
    }

    setState((prev) => ({ ...prev, currentStepIndex: nextIndex }));
    setTimeout(() => {
      executeBeforeShow(currentTour.steps[nextIndex]);
    }, 100);
  }, [currentTour, state.currentStepIndex, completedTours, executeBeforeShow]);

  const prevStep = useCallback(() => {
    if (!currentTour || state.currentStepIndex === 0) return;

    const prevIndex = state.currentStepIndex - 1;
    setState((prev) => ({ ...prev, currentStepIndex: prevIndex }));
    setTimeout(() => {
      executeBeforeShow(currentTour.steps[prevIndex]);
    }, 100);
  }, [currentTour, state.currentStepIndex, executeBeforeShow]);

  const skipTour = useCallback(() => {
    setState({ isActive: false, currentTourId: null, currentStepIndex: 0 });
  }, []);

  const endTour = useCallback(() => {
    if (currentTour) {
      const updated = [...completedTours, currentTour.id].filter(
        (v, i, a) => a.indexOf(v) === i
      );
      setCompletedTours(updated);
      saveCompletedTours(updated);
    }
    setState({ isActive: false, currentTourId: null, currentStepIndex: 0 });
  }, [currentTour, completedTours]);

  // Expose navigator for tour beforeShow callbacks
  // This is set by page.tsx so tours can navigate between views
  (globalThis as Record<string, unknown>).__zeno_navigate = navigatorRef.current;

  return (
    <OnboardingContext.Provider
      value={{
        state,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        endTour,
        completedTours,
        registerNavigator,
      }}
    >
      {children}
      {state.isActive && currentTour && currentStep && (
        <>
          <SpotlightOverlay
            targetSelector={currentStep.target}
            padding={currentStep.highlightPadding ?? 8}
            onClick={skipTour}
          />
          <TourTooltip
            step={currentStep}
            stepIndex={state.currentStepIndex}
            totalSteps={currentTour.steps.length}
            onNext={nextStep}
            onPrev={prevStep}
            onSkip={skipTour}
            isFirst={state.currentStepIndex === 0}
            isLast={state.currentStepIndex === currentTour.steps.length - 1}
          />
        </>
      )}
    </OnboardingContext.Provider>
  );
}
