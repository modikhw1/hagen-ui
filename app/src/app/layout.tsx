import type { Metadata } from "next";
import { ColorSchemeScript } from "@mantine/core";
import { DM_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "@mantine/core/styles.css";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LeTrend",
  description: "Virala sketchkoncept för ditt varumärke",
  icons: {
    icon: "/transparent.png",
    apple: "/transparent.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body className={dmSans.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
