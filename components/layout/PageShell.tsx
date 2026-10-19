"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

/**
 * Signing-desk shell: a narrow vertical rail of marks, then the queue.
 *
 * The rail is a column of signature strokes rather than text — Quorum's subject is how many
 * people have signed, and a row of discrete marks says that faster than a label does. It is
 * decorative in the header and meaningful in the queue, where the same mark is reused per
 * confirmation.
 */
export default function PageShell({ children, nav = [], title, description }: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex" style={{ minHeight: "100dvh" }}>
      {/* A thin printed spine, like the edge of a signature block. */}
      <div
        className="hidden md:flex flex-col items-center gap-2 pt-5 flex-shrink-0"
        style={{ width: "52px", background: "#07080E", borderRight: "1px solid var(--border-subtle)" }}
        aria-hidden="true"
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            style={{
              width: "18px",
              height: "2px",
              background: i < 3 ? "var(--accent)" : "var(--border-default)",
            }}
          />
        ))}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="px-5 md:px-8 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="6.4" cy="7.2" r="3" fill="var(--accent)" />
                <circle cx="13.6" cy="7.2" r="3" fill="var(--accent)" />
                <circle cx="10" cy="14" r="3" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
              </svg>
              <span className="mono text-[17px] font-medium tracking-[-0.02em]">{app.name}</span>
            </Link>

            <div className="flex items-center gap-3">
              {nav.length > 1 && (
                <nav className="hidden sm:flex items-center gap-4 mr-1">
                  {nav.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                        className="nav-link mono text-[13px] no-underline"
                        style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}>
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
              <NetworkBadge />
              <div style={{ width: "155px" }}><ConnectButton /></div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 md:px-8 py-8">
          <div className="mx-auto w-full" style={{ maxWidth: "900px" }}>
            {title && <h1 className="text-[26px] md:text-[30px]" style={{ color: "var(--text-primary)" }}>{title}</h1>}
            {description && (
              <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)", maxWidth: "62ch" }}>
                {description}
              </p>
            )}
            <div className={title || description ? "mt-7" : ""}>{children}</div>
          </div>
        </main>

        <footer className="flex-shrink-0 px-5 md:px-8 py-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto w-full flex flex-wrap items-center gap-x-5 gap-y-2" style={{ maxWidth: "900px" }}>
            <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{app.tagline}</span>
            <div className="flex-1" />
            <span className="mono text-[12px]" style={{ color: "var(--text-secondary)" }}>Built on BOT Chain</span>
            <a href="https://botchain.ai" target="_blank" rel="noreferrer" className="mono text-[12px]" style={{ color: "var(--text-tertiary)" }}>botchain.ai</a>
            <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer" className="mono text-[12px]" style={{ color: "var(--text-tertiary)" }}>BOT Chain Explorer</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
