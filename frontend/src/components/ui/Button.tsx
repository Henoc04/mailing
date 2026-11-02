import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-500 focus-visible:ring-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400",
  secondary:
    "border border-gray-300 bg-white text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-50 focus-visible:ring-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800",
  danger:
    "bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-500 focus-visible:ring-red-500 dark:bg-red-600 dark:hover:bg-red-500",
  ghost:
    "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-400 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, className, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx("btn", variantClasses[variant], sizeClasses[size], className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
