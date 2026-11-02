import type { ReactNode } from "react";
import clsx from "clsx";

export type BadgeColor = "gray" | "blue" | "green" | "red" | "yellow" | "purple";

export interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  /** Prefixes the label with a colored dot (useful for statuses). */
  dot?: boolean;
  className?: string;
}

const colorClasses: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 ring-gray-500/15 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-400/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25",
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/25",
  yellow:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25",
  purple:
    "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/25",
};

const dotClasses: Record<BadgeColor, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  yellow: "bg-amber-500",
  purple: "bg-violet-500",
};

export function Badge({ children, color = "gray", dot = false, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        colorClasses[color],
        className
      )}
    >
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", dotClasses[color])} aria-hidden="true" />}
      {children}
    </span>
  );
}
