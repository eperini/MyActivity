"use client";

import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/hooks/useTheme";
import OnboardingProvider from "@/components/onboarding/OnboardingProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OnboardingProvider>{children}</OnboardingProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
