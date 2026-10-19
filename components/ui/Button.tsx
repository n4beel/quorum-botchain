"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/** Monospaced buttons, square, like a signing action in a terminal. */
const variantStyles: Record<Variant, CSSProperties> = {
  primary: { background: "var(--accent)", color: "#0B0C14" },
  ghost: { background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" },
  danger: { background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" },
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-5 py-2.5 text-[13px]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, children, className = "", style, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 transition-opacity",
        "mono font-medium tracking-[0.02em]",
        "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
        sizeStyles[size],
        className,
      ].join(" ")}
      style={{ borderRadius: "2px", ...variantStyles[variant], ...style }}
      {...props}
    >
      {loading ? (
        <>
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  ),
);

Button.displayName = "Button";
export default Button;
