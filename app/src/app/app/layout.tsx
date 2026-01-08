import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LeTrend",
  description: "Virala sketchkoncept för ditt varumärke",
  icons: {
    icon: "/transparent.png",
    apple: "/transparent.png",
  },
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
