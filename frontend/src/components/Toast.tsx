"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { X } from "lucide-react";

interface ToastMessage {
  id: number;
  text: string;
  type: "error" | "success" | "info";
}

interface ToastContextType {
  showToast: (text: string, type?: "error" | "success" | "info") => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: "error" | "success" | "info" = "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const colors = {
    error: "bg-red-900/90 border-red-700 text-red-200",
    success: "bg-green-900/90 border-green-700 text-green-200",
    info: "bg-zinc-800/90 border-zinc-600 text-zinc-200",
  };

  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm shadow-lg animate-in slide-in-from-right ${colors[toast.type]}`}
    >
      <span className="flex-1">{toast.text}</span>
      <button onClick={() => onDismiss(toast.id)} className="opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
