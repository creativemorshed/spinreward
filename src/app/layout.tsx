import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpinReward — রেস্টুরেন্টের জন্য স্পিন হুইল",
  description: "QR স্ক্যান করুন, চাকা ঘোরান, ক্যাশ ডিসকাউন্ট জিতুন।",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f97316",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
