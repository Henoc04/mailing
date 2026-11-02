import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons/links on the right; they wrap under the title on phones. */
  actions?: ReactNode;
  /** Optional "back" link shown above the title. */
  back?: { to: string; label: string };
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="space-y-2">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
