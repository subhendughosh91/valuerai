import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ValuerAI | Property valuation intelligence",
  description: "State-aware property valuation workflow for India."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
