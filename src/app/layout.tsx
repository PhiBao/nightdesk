import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "NightDesk — session-aware tokenized-stock execution",
  description: "See what the after-hours price means before you pay it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0b0e14", color: "#e8ecf1" }}>
        <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 20px 64px" }}>{children}</main>
      </body>
    </html>
  );
}
