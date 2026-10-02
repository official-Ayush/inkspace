import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inkspace — Your visual workspace",
  description: "An infinite canvas for your next big idea. Draw, connect, organize, and create in your private visual workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
