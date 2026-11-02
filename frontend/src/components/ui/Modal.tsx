import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Icon } from "./Icon";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  size?: ModalSize;
  children: ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

/**
 * Centered dialog on desktop, bottom sheet on phones. The body scrolls when
 * the content is taller than the viewport; page scroll is locked while open.
 */
export function Modal({ isOpen, onClose, title, description, size = "md", children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect (callers often
  // pass inline arrows, which would otherwise steal focus on every render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-gray-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "relative z-10 flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-gray-900/5 focus:outline-none dark:bg-gray-900 dark:ring-white/10 sm:max-h-[88vh] sm:animate-pop-in sm:rounded-2xl",
          sizeClasses[size]
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700 sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>}
            {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 -mt-1 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
