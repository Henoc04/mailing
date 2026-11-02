import type { ReactNode } from "react";
import clsx from "clsx";
import { EmptyState } from "./EmptyState";

// A small generic table wrapper: columns config + rows. Kept intentionally
// minimal (no sorting/selection built in) — pages that need those layer
// them on top via column render functions and their own state, rather than
// this component growing a large generic API that fights TypeScript.
export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hide this column below the given breakpoint to keep phones readable. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: ReactNode;
  onRowClick?: (row: T) => void;
}

const hideClasses = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

export function Table<T>({ columns, rows, rowKey, emptyMessage = "Aucune donnée", onRowClick }: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <EmptyState title={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50/80 dark:bg-gray-800/40">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={clsx(
                    "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400",
                    column.hideBelow && hideClasses[column.hideBelow]
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  "transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      "px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300",
                      column.hideBelow && hideClasses[column.hideBelow],
                      column.className
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
