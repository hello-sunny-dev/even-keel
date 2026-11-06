import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary:
    "bg-ink text-paper disabled:bg-track disabled:text-muted rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed",
  secondary: "border-rule-strong rounded-lg border px-3 py-2 text-sm",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  fullWidth?: boolean;
}) {
  const classes = [VARIANTS[variant], fullWidth && "w-full", className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}
