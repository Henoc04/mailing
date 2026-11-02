import clsx from "clsx";
import type { ToastItem } from "./ToastProvider";
import { Icon, type IconName } from "./Icon";

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

const variantIcon: Record<ToastItem["variant"], { icon: IconName; className: string }> = {
  success: { icon: "checkCircle", className: "text-emerald-500" },
  error: { icon: "alert", className: "text-red-500" },
  info: { icon: "info", className: "text-brand-500" },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const { icon, className } = variantIcon[toast.variant];

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className="pointer-events-auto flex w-full animate-pop-in items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-lift dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:w-96"
    >
      <Icon name={icon} className={clsx("mt-px", className)} />
      <span className="flex-1 leading-5">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        aria-label="Fermer la notification"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}
