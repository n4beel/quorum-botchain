"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CopyAddressProps {
  value: string;
  /** Shown instead of "copy" — e.g. "copy address". */
  label?: string;
}

type State = "idle" | "copied" | "manual";

/**
 * Copy a value to the clipboard, and say so.
 *
 * Three outcomes, not two. navigator.clipboard is undefined over plain HTTP and rejects outright
 * when the page lacks clipboard permission; execCommand can also refuse. A button that silently
 * does nothing in those cases is worse than no button, because the address is exactly what the
 * user cannot afford to retype — so the last resort puts the value in a selected field and tells
 * them to press ctrl-c themselves.
 */
export default function CopyAddress({ value, label = "copy" }: CopyAddressProps) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualField = useRef<HTMLInputElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (state === "manual") manualField.current?.select();
  }, [state]);

  const copy = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);

    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }

    if (!ok) {
      setState("manual");
      return;
    }
    setState("copied");
    timer.current = setTimeout(() => setState("idle"), 1800);
  }, [value]);

  if (state === "manual") {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <input
          ref={manualField}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Wallet address — press ctrl-c to copy"
          className="mono text-[11px]"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: "2px",
            color: "var(--text-primary)",
            padding: "3px 6px",
            width: "min(100%, 24ch)",
          }}
        />
        <span className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
          press ctrl-c
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`${label}: ${value}`}
      className="mono text-[11px] uppercase tracking-[0.08em] cursor-pointer transition-opacity hover:opacity-70"
      style={{
        background: "transparent",
        border: "1px solid var(--border-subtle)",
        borderRadius: "2px",
        padding: "3px 7px",
        color: state === "copied" ? "var(--accent)" : "var(--text-tertiary)",
        whiteSpace: "nowrap",
      }}
    >
      {state === "copied" ? "copied" : label}
    </button>
  );
}

function legacyCopy(value: string): boolean {
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
