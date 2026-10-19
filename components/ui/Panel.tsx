import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
}

/** A signing block: square, with a faint top rule where a header would sit. */
export default function Panel({ elevated, noPadding, children, className = "", style, ...props }: PanelProps) {
  return (
    <div
      className={[noPadding ? "" : "p-5", className].join(" ")}
      style={{
        background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: "1px solid var(--border-subtle)", borderTop: "1px solid var(--border-strong)",
        borderRadius: "2px",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
