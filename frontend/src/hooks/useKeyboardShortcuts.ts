"use client";

import { useEffect, useCallback } from "react";

export interface ShortcutActions {
  onNewTask: () => void;
  onClosePanel: () => void;
  onToggleSidebar: () => void;
  onNavigate: (view: string) => void;
  onToggleSelectedTask: () => void;
  onShowHelp: () => void;
  onSearch: () => void;
  onNextTask: () => void;
  onPrevTask: () => void;
}

/**
 * Global keyboard shortcuts for the app.
 * Shortcuts are disabled when focus is inside an input/textarea/select/contenteditable.
 */
export default function useKeyboardShortcuts(actions: ShortcutActions) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isEditing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable;

      // Cmd/Ctrl shortcuts work even when editing
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "k") {
        e.preventDefault();
        actions.onSearch();
        return;
      }

      // Escape always works
      if (e.key === "Escape") {
        actions.onClosePanel();
        return;
      }

      // All other shortcuts are disabled when editing
      if (isEditing) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          actions.onNewTask();
          break;
        case "?":
          e.preventDefault();
          actions.onShowHelp();
          break;
        case "b":
          e.preventDefault();
          actions.onToggleSidebar();
          break;
        case "j":
          e.preventDefault();
          actions.onNextTask();
          break;
        case "k":
          e.preventDefault();
          actions.onPrevTask();
          break;
        case " ":
          e.preventDefault();
          actions.onToggleSelectedTask();
          break;
        // Number row: navigate to views
        case "1":
          e.preventDefault();
          actions.onNavigate("inbox");
          break;
        case "2":
          e.preventDefault();
          actions.onNavigate("today");
          break;
        case "3":
          e.preventDefault();
          actions.onNavigate("next7");
          break;
        case "4":
          e.preventDefault();
          actions.onNavigate("habits");
          break;
        case "5":
          e.preventDefault();
          actions.onNavigate("kanban");
          break;
        case "6":
          e.preventDefault();
          actions.onNavigate("calendar");
          break;
        case "7":
          e.preventDefault();
          actions.onNavigate("stats");
          break;
      }
    },
    [actions]
  );

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);
}
