import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "CampusFind — Recover what matters",
  description:
    "A trusted, intelligent lost-and-found platform for the University of Ibadan community.",
  openGraph: {
    title: "CampusFind",
    description: "Report, match and safely recover lost items on campus.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "CampusFind",
    description: "Report, match and safely recover lost items on campus.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CampusFind",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#10172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
