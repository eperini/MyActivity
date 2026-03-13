"use client";

import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/hooks/useTheme";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
