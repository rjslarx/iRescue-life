import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Phone } from "lucide-react";
import "./rescue-inbox.css";

/**
 * Lightweight, tenant-relative shell for the existing inbox workspace.
 * Wouter supplies the tenant base; do not prepend it to the full-inbox link.
 */
export function RescuePhoneLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="rescue-inbox"
      style={{
        minHeight: "100dvh",
        minWidth: 0,
        padding: "16px",
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(32px, env(safe-area-inset-bottom))",
        overflowWrap: "anywhere",
      }}
    >
      <header className="ri-banner">
        <div className="ri-toolbar">
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                fontSize: "1.35rem",
                fontWeight: 650,
                letterSpacing: "-.025em",
              }}
            >
              <Phone size={21} aria-hidden="true" style={{ flexShrink: 0 }} />
              Rescue Phone
            </h1>
            <p className="ri-muted">
              Contact adopters from your rescue’s shared number.
            </p>
          </div>
          <Link
            href="/dashboard/rescue-inbox"
            className="ri-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: "44px", maxWidth: "100%" }}
          >
            Full inbox
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <details
          style={{
            marginTop: "16px",
            borderTop: "1px solid var(--ri-line)",
            paddingTop: "8px",
            fontSize: ".875rem",
          }}
        >
          <summary
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              cursor: "pointer",
              minHeight: "44px",
              padding: "11px 0",
              fontWeight: 600,
              color: "var(--ri-ink)",
            }}
          >
            Add Rescue Phone to your home screen
          </summary>
          <div style={{ paddingBottom: "8px", lineHeight: 1.6 }}>
            <ul style={{ listStyle: "disc", paddingLeft: "20px" }}>
              <li>
                <strong>iPhone:</strong> Open this page in Safari. Tap Share,
                then Add to Home Screen.
              </li>
              <li style={{ marginTop: "6px" }}>
                <strong>Android:</strong> Open your browser’s menu, then choose
                Add to Home screen or Install. Wording varies by browser.
              </li>
            </ul>
            <p className="ri-muted" style={{ marginTop: "10px" }}>
              This adds a shortcut, not a separate phone app. Internet access
              and sign-in are still required. Keep Rescue Phone open while
              using it; the shortcut does not guarantee background ringing.
            </p>
          </div>
        </details>
      </header>
      <main className="[&>.min-h-screen]:min-h-0 [&>.min-h-screen]:p-0" style={{ minWidth: 0 }}>{children}</main>
    </div>
  );
}
