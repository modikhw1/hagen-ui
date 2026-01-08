import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LeTrend",
  description: "Virala sketchkoncept för ditt varumärke",
  icons: {
    icon: "/logo-transparent.jpg",
    apple: "/logo-transparent.jpg",
  },
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
