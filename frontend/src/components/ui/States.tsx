import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

/** Placeholder shown while a page's data is loading. */
export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-500 dark:text-gray-400">
      <Spinner className="text-brand-500" />
      {label}
    </div>
  );
}

/** Inline error block for a failed query. */
export function ErrorState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <Icon name="alert" className="mt-0.5" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
