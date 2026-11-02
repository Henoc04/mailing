import type { ReactNode } from "react";
import clsx from "clsx";

export type BadgeColor = "gray" | "blue" | "green" | "red" | "yellow" | "purple";

export interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  className?: string;
}

const colorClasses: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200",
};

export function Badge({ children, color = "gray", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClasses[color],
        className
      )}
    >
      {children}
    </span>
  );
}
