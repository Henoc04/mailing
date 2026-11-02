import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon = "inbox", action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
