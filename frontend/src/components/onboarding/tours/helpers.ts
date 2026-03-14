/** Navigate to a specific view via the global navigator registered by page.tsx */
export function navigateTo(view: string) {
  const nav = (globalThis as Record<string, unknown>).__zeno_navigate as
    | ((view: string) => void)
    | undefined;
  if (nav) nav(view);
}
