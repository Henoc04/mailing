import clsx from "clsx";
import type { ToastItem } from "./ToastProvider";

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

const variantClasses: Record<ToastItem["variant"], string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-gray-800 text-white dark:bg-gray-700",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      className={clsx(
        "flex min-w-[240px] max-w-sm items-start justify-between gap-3 rounded-md px-4 py-3 text-sm shadow-lg",
        variantClasses[toast.variant]
      )}
    >
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-white/80 hover:text-white"
        aria-label="Fermer la notification"
      >
        &times;
      </button>
    </div>
  );
}
