import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LeTrend",
  description: "Virala sketchkoncept för ditt varumärke",
  icons: {
    icon: "/logo.jpg.jpg",
    apple: "/logo.jpg.jpg",
  },
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
