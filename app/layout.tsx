import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Majestic Twitter",
  description: "Premium social platform interface inspired by modern microblogging.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
