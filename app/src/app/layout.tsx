import type { Metadata } from "next";
import { ColorSchemeScript } from "@mantine/core";
import { Providers } from "@/components/Providers";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./globals.css";

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
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
