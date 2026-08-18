import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FounderOS Simulator", template: "%s · FounderOS Simulator" },
  description: "A realistic startup problem-solving simulator built around evidence, cash, attention, and consequences.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#071019", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
