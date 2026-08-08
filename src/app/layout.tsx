import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://localfold.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LocalFold — Private PDF tools in your browser",
    template: "%s · LocalFold",
  },
  description:
    "Private PDF tools in your browser. Merge, convert, compress, OCR, and protect — files never leave your device.",
  applicationName: "LocalFold",
  keywords: [
    "PDF tools",
    "merge PDF",
    "compress PDF",
    "PDF to Word",
    "private PDF",
    "local PDF editor",
    "OCR PDF",
  ],
  authors: [{ name: "LocalFold" }],
  creator: "LocalFold",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "LocalFold",
    title: "LocalFold — Private PDF tools in your browser",
    description:
      "Every PDF tool you need. None of the uploads. Process files privately on your device.",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "LocalFold",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "LocalFold — Private PDF tools",
    description:
      "Merge, convert, compress, and protect PDFs in your browser. No uploads.",
    images: ["/logo.png"],
  },
  // Favicon comes from src/app/favicon.ico + icon.png (App Router file conventions)
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png" }],
  },
  category: "productivity",
};

export const viewport: Viewport = {
  themeColor: "#0f8a5f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1 pt-[var(--nav-clearance)]">{children}</main>
      </body>
    </html>
  );
}
