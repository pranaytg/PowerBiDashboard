import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "COGS & Profitability Dashboard | JH-Halte Analytics",
  description:
    "Track cost of goods sold, margins, and per-order profitability across JH and Halte companies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main style={{ paddingTop: "64px", minHeight: "100vh" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
