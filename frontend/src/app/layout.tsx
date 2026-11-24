import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Synaptiq — Think deeper. Debug smarter.",
  description:
    "An intentional workspace for learning to debug: explain, experiment, reflect.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
