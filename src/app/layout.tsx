import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ButlerChat } from "@/components/ButlerChat";
import { AppWarmup } from "@/components/AppWarmup";
import Script from "next/script";
import { getRequiredEnv } from "@/lib/env";
import { getMidtransSnapScriptSrc } from "@/lib/midtransConfig";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aura",
  description: "Ultra-Luxury Hotel — Zero Loading Experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const midtransClientKey = getRequiredEnv("NEXT_PUBLIC_MIDTRANS_CLIENT_KEY");
  const supabaseOrigin = new URL(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  ).origin;
  const midtransScriptSrc = getMidtransSnapScriptSrc({
    clientKey: midtransClientKey,
  });
  const midtransOrigin = new URL(midtransScriptSrc).origin;

  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href={supabaseOrigin} crossOrigin="" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="" />
        <link rel="preconnect" href={midtransOrigin} crossOrigin="" />
        <link rel="dns-prefetch" href="//images.unsplash.com" />
        <link rel="dns-prefetch" href={`//${new URL(supabaseOrigin).host}`} />
        <link rel="dns-prefetch" href={`//${new URL(midtransOrigin).host}`} />
        <Script
          src={midtransScriptSrc}
          data-client-key={midtransClientKey}
          strategy="beforeInteractive"
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} antialiased bg-background text-foreground min-h-screen selection:bg-primary/20`}
      >
        <AppWarmup />
        <Navbar />
        {children}
        <Footer />
        <ButlerChat />
      </body>
    </html>
  );
}
