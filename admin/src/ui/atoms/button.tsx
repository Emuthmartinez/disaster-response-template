import type { ButtonHTMLAttributes } from "react";
import { buttonBase, buttonVariants } from "../tokens";

/** Variantes visuales del botón. */
export type ButtonVariant = "primary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Átomo Button — presentacional y agnóstico de dominio.
 */
export function Button({
  variant = "primary",
  type = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = [buttonBase, buttonVariants[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
