import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: ButtonVariant;
  /**
   * Maximum text width before truncation kicks in. Defaults to "16rem" so a
   * single button never dominates a button row. Pass `false` to remove the
   * cap (e.g. for icon-only buttons sized via className). The button still
   * respects `max-w-full` so it cannot overflow its parent.
   */
  maxWidth?: string | false;
  /**
   * Allow the label to wrap to multiple lines instead of truncating. Useful
   * for action buttons in small fixed-width containers (confirm bubbles)
   * where hiding the action verb would harm clarity.
   */
  multiline?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
  secondary: "border-border bg-panel text-foreground hover:bg-background",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-panel",
  danger: "border-danger bg-danger text-danger-foreground hover:bg-danger-strong",
};

export function Button({
  children,
  icon,
  maxWidth = "16rem",
  multiline = false,
  title,
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const textTitle = typeof children === "string" ? children : undefined;
  const resolvedTitle = title ?? textTitle;

  return (
    <button
      className={`inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      style={maxWidth ? { maxWidth } : undefined}
      title={resolvedTitle}
      type={type}
      {...props}
    >
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
      {children ? (
        <span
          className={
            multiline
              ? "min-w-0 whitespace-normal break-words text-center leading-tight"
              : "min-w-0 truncate"
          }
        >
          {children}
        </span>
      ) : null}
    </button>
  );
}
